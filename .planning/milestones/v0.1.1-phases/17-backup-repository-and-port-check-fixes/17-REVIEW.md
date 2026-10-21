---
phase: 17-backup-repository-and-port-check-fixes
reviewed: 2026-10-14T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - Dockerfile
  - server/src/application/backup-service.ts
  - server/src/application/ports/restic-executor-port.ts
  - server/src/domain/port-conflicts.ts
  - server/src/domain/restic-repository.ts
  - server/src/infrastructure/restic-executor.ts
  - server/src/routes/backups.ts
  - shared/src/validation/backups.ts
  - client/src/lib/backups-api.ts
  - client/src/routes/app/settings/components/backup-repository-card.tsx
  - client/src/routes/app/settings/components/backup-repository-fields.tsx
findings:
  critical: 1
  warning: 7
  info: 8
  total: 16
status: issues_found
---

# Phase 17: Code Review Report

**Reviewed:** 2026-10-14
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

This is a re-review. Since the first pass, the phase added the Settings UI for SFTP and S3, `POST /api/settings/backup/test` backed by `BackupService.testRepositoryConnection()`, and a relaxed S3 secret-key check in the shared schema. I also read `settings-service.ts` (lines 315-370) for the save path.

I reproduced the restic behaviour behind the main finding locally with restic 0.18.1 (the Dockerfile ships 0.19.1).

**Earlier findings:** none are fixed.
- WR-01, WR-02, WR-03 and IN-01..IN-04 all still apply to the current code.
- WR-01 is now confirmed by reproduction, not just inferred (see WR-01).
- IN-03 matters more now that the test endpoint exists (see WR-04).

**New code:**
- **Secrets handling is sound.**
  - The UI never receives stored secrets. The masked GET returns only `hasSftpKey`, `hasS3SecretKey` and `hasPassword`.
  - `toFormValues` never populates a secret field.
  - A blank secret becomes `null` and the server leaves the stored value untouched.
  - Secrets are sent verbatim and never trimmed. After save, `loadSettings()` resets the form, so a pasted key does not linger in form state.
  - The restic env and the key file stay out of argv and logs.
  - The probe stack id passes `REMOTE_STACK_ID_PATTERN` and cannot traverse into another stack's repository.
- **Error leakage via the test endpoint** is limited. Restic and ssh stderr do not print secret values in the cases I could reproduce (see IN-06). The endpoint returns raw stderr, truncated to 500 characters, with no redaction.
- **The test endpoint itself is unreliable for S3** (CR-01).

## Critical Issues

### CR-01: "Test connection" reports success for S3 with bad credentials, an unreachable endpoint or a missing bucket, after a ~15 minute hang

**File:** `server/src/infrastructure/restic-executor.ts:24-28` (consumed at `server/src/application/backup-service.ts:630-639`, `:973`, and `restic-executor.ts:287`)

**Issue:** `isRepositoryNotFoundError` matches on `err.message.includes("unable to open config file")`. The code comment says this is needed because restic 0.16.x returns exit code 1 for a missing repository. The shipped binary is 0.19.1, and the UI requires >= 0.17.

Since 0.17, a genuinely missing repository exits with code 10, and the message is `Fatal: repository does not exist: unable to open config file: ...`. I confirmed this on 0.18.1: a missing repository exits 10, and a wrong password exits 12.

Restic uses the same `unable to open config file:` prefix for any backend `Stat` failure that is not "not found". For S3 that includes an invalid access key, a 403, a DNS failure, a refused connection, or a missing bucket. Those exit 1 with `Fatal: unable to open config file: Stat: <cause>`.

I reproduced the following with fake credentials:
- With a refused endpoint, `restic cat config` retries with backoff (`Stat(<config/>) returned error, retrying after ...`) and was still retrying at my 60 s cutoff.
- With the AWS "Access Key Id does not exist" response, restic kept retrying with growing backoff and was still running at my 60 s cutoff. The same prefix applies when it finally gives up.
- Both cases end with `Fatal: unable to open config file: ...`, which `isRepositoryNotFoundError` treats as "not found".

Consequences:
1. `testRepositoryConnection()` returns `{ok: true, "Connection successful..."}` for exactly the S3 failures the feature exists to catch. This is a false positive on the credential check. The user sees "Connection successful" and the first real backup then fails. Restic's default retry window is on the order of 15 minutes, so the click first hangs that long.
2. `snapshots()` returns `[]` for S3 with bad credentials or an unreachable endpoint. The Backups tab shows an empty list instead of an error.
3. `runWithAutoInit` runs `restic init` after any such failure, which then fails with a second, less informative error.

The SFTP path is not affected. Connection and auth failures there say `unable to open repository at sftp:...`, which does not match. I confirmed this with a refused ssh login.

**Fix:** Treat only restic's real "repository missing" signal as not-found. Rely on exit code 10, plus the explicit `repository does not exist` phrase for safety. Drop the bare `unable to open config file` match, or gate it on an old restic version.
```ts
export function isRepositoryNotFoundError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    if ((err as {exitCode?: number}).exitCode === 10) return true;
    return err.message.includes("repository does not exist");
}
```
Also give the probe a hard timeout (see WR-04), and update the unit tests that encode the old substring behaviour. Add a test where stderr is `Fatal: unable to open config file: Stat: The AWS Access Key Id you provided does not exist` with exit 1, and expect `ok: false`.

## Warnings

### WR-01: SFTP host-key notice on stderr corrupts `snapshots()` JSON parsing (STILL OPEN, now confirmed by reproduction)

**File:** `server/src/infrastructure/restic-executor.ts:278-292` (with `:189-203`)

**Issue:** This is unchanged. I ran restic 0.18.1 with the same `StrictHostKeyChecking=accept-new` command and it printed `subprocess ssh: Warning: Permanently added '127.0.0.1' (ED25519) to the list of known hosts.` on stderr. `spawnRestic` forwards it as `[stderr] ...` and `snapshots()` runs `JSON.parse(lines.join(""))` over stdout and stderr together, so it throws `SyntaxError` and the request returns 500.

The new Test connection button usually makes the first connection and pins the host key, which shrinks the window. It still fails if `known_hosts` is missing or re-pinned, or if restic emits any other stderr warning. The Backups tab is the first place a user lists snapshots.

**Fix:** Collect only stdout for the JSON:
```ts
(l) => { if (!l.startsWith("[stderr] ")) lines.push(l) }
```
Optionally add `-o LogLevel=ERROR` to `buildSftpCommand`. Add a test that emits the notice on stderr.

### WR-02: Private-key directory can be orphaned on a hard kill, on the persistent stacks volume (STILL OPEN)

**File:** `server/src/infrastructure/restic-executor.ts:111-130`

**Issue:** Unchanged. The key directory lives under `<stacksDir>/.docktor/ssh`, which is the bind-mounted persistent volume. `finally { rm }` does not run on SIGKILL, OOM-kill or a short stop grace period, so the plaintext key can persist on the host disk. Nothing sweeps stale `key-*` directories.

**Fix:** Create the key directory under `os.tmpdir()` and keep only `known_hosts` on the persistent volume. Or do a startup-only sweep of `key-*` directories.

### WR-03: Key-directory cleanup failure masks the restic result or original error (STILL OPEN)

**File:** `server/src/infrastructure/restic-executor.ts:128-130`

**Issue:** Unchanged. `rm(..., {force: true})` only suppresses ENOENT. An EACCES, EBUSY or EIO thrown from the `finally` replaces the real restic error. That can defeat `isRepositoryNotFoundError`-driven auto-init, and it turns a successful backup into a failure. The new test endpoint is also affected: a cleanup error would be shown as the connection result.

**Fix:**
```ts
} finally {
    await rm(keyDir, {recursive: true, force: true}).catch((e: unknown) => {
        console.error(`[ResticExecutor] Failed to remove key directory ${keyDir}:`, e)
    })
}
```

### WR-04: Test endpoint has no timeout and no server-side concurrency bound; ssh has no ConnectTimeout

**File:** `server/src/application/backup-service.ts:630-633`, `server/src/routes/backups.ts:238-240`, `server/src/infrastructure/restic-executor.ts:139-153`

**Issue:** `POST /api/settings/backup/test` awaits `restic cat config` with no deadline.
- S3: restic retries for roughly 15 minutes (CR-01).
- SFTP: the ssh command has no `ConnectTimeout`, so an unreachable host waits for the kernel TCP timeout. `ServerAliveCountMax=240` allows a hung session of about 4 hours (this is IN-03, now user-reachable).

The client disables the button only locally. Every click, or any direct API call, spawns another restic process, and each stays alive for the full retry window. The HTTP request will usually be killed by a reverse proxy first, but the restic process keeps running. The Settings UI sits on "Testing..." the whole time.

**Fix:** Run the probe with a deadline, for example `AbortSignal.timeout(30_000)` passed through to `spawn` (it supports `signal`/`timeout`). Return `{ok: false, message: "Connection test timed out"}` on abort. Add `-o ConnectTimeout=15` to the ssh command. Optionally reject a second concurrent test with a 409, or reuse the in-flight promise.

### WR-05: Optional non-secret fields cannot be cleared from the UI (`s3Endpoint`, `repoPath`)

**File:** `client/src/routes/app/settings/components/backup-repository-card.tsx:36-40, 52-68` with `server/src/application/settings-service.ts:359-364`

**Issue:** `orNull` sends `null` for a blank input, and the server only upserts truthy values. The comment says blank means "leave the stored value untouched". That is right for secrets but wrong for plain fields. The S3 endpoint field says "Leave blank for AWS S3", yet a stored MinIO endpoint can never be reverted to the AWS default. The same applies to the SFTP remote path and its `/backups` default. The only way to clear them is a database edit. Because `GET` returns the stored value and `reset()` repopulates it, the UI also shows the old value again after a "successful" save of a blank field.

**Fix:** Send an empty string for blank non-secret fields and have the service upsert `""`. Concretely, in the service use `if (data.s3Endpoint !== undefined && data.s3Endpoint !== null) upsert(...)`. Keep `null` meaning "unchanged" for secrets only. Add a test for clearing the endpoint.

### WR-06: Relaxed validation lets an incomplete remote configuration be saved with a success toast

**File:** `shared/src/validation/backups.ts:18-29` with `server/src/application/settings-service.ts:357-369`

**Issue:** The S3 secret key and the SFTP key were removed from the required set so that a blank means "keep stored". Nothing checks that a stored value exists when none is supplied. A first-time save of S3 or SFTP with a blank secret or password returns 200 and "Repository settings saved". `initiateBackup` then passes (`repoType` is set) and `resolveResticRepository` fails the backup at run time with `missing S3 secret key, repository password`. The user gets no warning at configuration time. Switching local to remote with a blank key hits the same path. Test connection does surface the missing-field message, but the user has to know to click it.

**Fix:** In `saveBackupRepositorySettings`, after the writes, verify that the selected type's required secrets are now present. Compare the incoming payload plus the stored `hasX` state, and throw `BadRequestError` listing the missing labels (labels only, no values). Alternatively, return the `hasX` state in the PUT response and warn in the UI.

### WR-07: Restic password input lacks `autoComplete`, so browser password managers can fill the login password into it

**File:** `client/src/routes/app/settings/components/backup-repository-card.tsx:207-229`

**Issue:** The restic password input is `type="password"` with no `autoComplete`. The sibling `RepositoryField` inputs set `autoComplete="off"`, so the omission here is inconsistent. A browser or password manager can autofill the Docktor login password into it, making the form dirty with a value the user did not choose. Saving it replaces the stored restic password. Every existing repository then fails with "wrong password" (exit 12). The SMTP password field has the same exposure.

**Fix:** Add `autoComplete="new-password"` to this input. Consider a warning that changing the password after repositories exist makes existing snapshots unreadable.

### WR-08: Save handler is not awaited, so the form allows double submits

**File:** `client/src/routes/app/settings/components/backup-repository-card.tsx:118-127, 240`

**Issue:** `handleSave` returns `void` and fires `toast.promise(...)`, so `form.handleSubmit` resolves immediately and `formState.isSubmitting` is false for the whole request. The Save button is never disabled while the PUT is in flight, so a double click sends two writes. The "(key saved)" hints and the dirty state are refreshed only when the chained `loadSettings` completes. If `loadSettings` rejects after a successful PUT, the toast shows an error although the data was saved.

**Fix:** Make `handleSave` async and `await` the save, then reload separately:
```ts
const handleSave = async (values: BackupSettingsInput) => {
    setTestResult(null);
    const saved = saveBackupSettings(buildPayload(values));
    toast.promise(saved, {loading: "Saving...", success: "Repository settings saved", error: (e: Error) => e?.message ?? "Failed to save"});
    await saved;
    await loadSettings();
};
```

## Info

### IN-01: Local target with no `hostPath` and no `repoPath` yields an empty repository (STILL OPEN)

**File:** `server/src/domain/restic-repository.ts:74-80`
**Issue:** Unchanged. `resolveLocal` returns `RESTIC_REPOSITORY=""`, which restic rejects with an opaque error.
**Fix:** Throw `BadRequestError("Local backup repository path is not configured")` when the resolved path is blank.

### IN-02: SFTP validation edge cases: `@` in the user name, no IPv6 or port (STILL OPEN, now user-visible)

**File:** `server/src/domain/restic-repository.ts:56-59, 119-124`
**Issue:** Unchanged, but the new UI makes it reachable. `host:22`, `[::1]` or any non-default port is rejected with `SFTP host "..." is not a valid host name`, with no port setting. These limits are only discovered on Test connection or at the first backup, not at save time.
**Fix:** Add an optional `sftpPort` setting, or document the limit in the field description. Consider validating the host pattern in the shared schema so the form shows the error inline. Drop `@` from the user pattern.

### IN-03: Dead-peer detection is very long and there is no connect timeout (STILL OPEN)

**File:** `server/src/infrastructure/restic-executor.ts:139-153`
**Issue:** Unchanged. See WR-04, which covers the test-endpoint impact.
**Fix:** Add `-o ConnectTimeout=30` and lower `ServerAliveCountMax`.

### IN-04: Tier-3 self-exclusion matches on (port, protocol) only (STILL OPEN)

**File:** `server/src/domain/port-conflicts.ts:149-155, 167-170`
**Issue:** Unchanged. `SocketListener` and `publishedPorts` carry no bind address, so a foreign listener on another interface is masked when the deploying stack publishes the same port. This is documented as intentional.
**Fix:** Optional follow-up: add the bind IP to both shapes, or note the limit in the JSDoc.

### IN-05: Probe stack id `connection-test` can collide with a real stack

**File:** `server/src/application/backup-service.ts:169, 631`
**Issue:** `CONNECTION_PROBE_STACK_ID = "connection-test"` is a valid slug. A user who creates a stack named "Connection Test" has the probe read that stack's real repository (`<path>/connection-test`). It is read-only (`cat config` takes no lock and writes nothing), so there is no data risk. The result then reflects that stack's password and state. A wrong password gives exit 12, which is reported as a failure; a stack that exists is reported as success. Likewise, if the id ever came from user input it would hit `assertRemoteStackId`. It does not today.
**Fix:** Use an id that slugify cannot produce, such as one containing a double underscore or a leading underscore. `REMOTE_STACK_ID_PATTERN` requires an alphanumeric first character, so `docktor__connection-probe` would need the pattern relaxed or an explicit probe path. Or reserve the id when creating stacks. This is low priority.

### IN-06: Raw restic and ssh stderr is returned to the client without redaction

**File:** `server/src/application/backup-service.ts:633-637`
**Issue:** The message is `err.message.slice(0, 500)`, i.e. `restic exited with code N: <full stderr>`. In the cases I reproduced, stderr contained the host, user, repository path, `subprocess ssh:` lines and the AWS error text. I did not see the access key, secret key, restic password or key path. Stderr is still foreign output: S3-compatible servers can echo request details, ssh prints server banners and restic can print the repository URL. The same unredacted text is also persisted as `errorMessage` and `logLines` for real backups. The endpoint is behind `requireAuth` only.
**Fix:** Defence in depth: before returning, replace any occurrence of the decrypted `password`, `sftpKey`, `s3SecretKey` and `s3AccessKey` values with `***`. Prefer mapping known failures to stable messages (auth failed, host unreachable, wrong password) and attach the raw text only to server logs.

### IN-07: Stale test result stays visible after the form is edited

**File:** `client/src/routes/app/settings/components/backup-repository-card.tsx:129-139, 230-235`
**Issue:** `testResult` is cleared only on save and on a new test. A previous "Connection successful" alert keeps showing while the user edits fields. The Test button is disabled, but the success alert still looks current.
**Fix:** Clear `testResult` when `isDirty` becomes true, for example `useEffect(() => { if (isDirty) setTestResult(null) }, [isDirty])`.

### IN-08: Initial settings load failure is swallowed, leaving a blank, saveable form; loose API typing

**File:** `client/src/routes/app/settings/components/backup-repository-card.tsx:106-116`, `client/src/lib/backups-api.ts:104`
**Issue:**
- The `.catch(() => setLoading(false))` hides both a failed settings load and a failed restic-status call. The form then renders with `EMPTY_VALUES` (repoType `local`) and no error. Saving from that state overwrites the stored repository type, silently pointing remote backups back at local.
- `buildPayload` returns `Record<string, string | null>` and `saveBackupSettings` accepts `Record<string, unknown>`, so the payload is not checked against the shared `BackupSettingsInput` type.

**Fix:** On load failure, show an error state or toast and disable Save. Type the payload as `BackupSettingsInput` end to end.

---

_Reviewed: 2026-10-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
