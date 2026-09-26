import {describe, expect, it} from "vitest";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

// This test reads the source tree from disk and asserts layering rules
// (CLAUDE.md "Architecture > Server — Layered DDD") as testable facts — no
// imports of the modules under test, no transpilation. A future layering
// regression fails this test instead of requiring a human reviewer to
// notice it. Rules are declared as named cases in RULES below; later plans
// in this phase (10-05, 10-07, 10-10, 10-13, 10-14) append cases here
// rather than writing a second architecture test file.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(__dirname, "../../../src");

function listTsFilesRecursive(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, {withFileTypes: true});
    const files: string[] = [];
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...listTsFilesRecursive(full));
        } else if (entry.isFile() && entry.name.endsWith(".ts")) {
            files.push(full);
        }
    }
    return files;
}

// Line-anchored so a mention inside a comment or a string literal elsewhere
// in the file can never satisfy or violate a rule — only an actual
// top-level `import` statement line is inspected.
function importLines(file: string): string[] {
    const content = fs.readFileSync(file, "utf-8");
    return content.split("\n").filter((line) => /^\s*import\b/.test(line));
}

function relative(file: string): string {
    return path.relative(SRC_ROOT, file).split(path.sep).join("/");
}

interface LayeringRule {
    describeName: string;
    files: string[];
    itName: (file: string) => string;
    forbidden: {label: string; pattern: RegExp}[];
}

const APPLICATION_DIR = path.join(SRC_ROOT, "application");
const APPLICATION_PORTS_DIR = path.join(SRC_ROOT, "application", "ports");
const DOMAIN_DIR = path.join(SRC_ROOT, "domain");
const REPOSITORIES_DIR = path.join(SRC_ROOT, "repositories");
const ROUTES_DIR = path.join(SRC_ROOT, "routes");

// application/ports/ is excluded — port interfaces are pure type
// declarations, not the service code D-01/D-10 restrict.
const applicationFilesExcludingPorts = listTsFilesRecursive(APPLICATION_DIR).filter(
    (f) => !f.startsWith(APPLICATION_PORTS_DIR + path.sep),
);

const domainFiles = listTsFilesRecursive(DOMAIN_DIR);
const routeFiles = listTsFilesRecursive(ROUTES_DIR);

const RULES: LayeringRule[] = [
    {
        describeName: "application layer never imports the Prisma client directly (D-10)",
        files: applicationFilesExcludingPorts,
        itName: (file) => `${relative(file)} has no top-level import of lib/db.js`,
        forbidden: [{label: "lib/db.js", pattern: /["'][^"']*\blib\/db\.js["']/}],
    },
    {
        describeName: "application layer never imports the mail transport library directly (D-07)",
        files: applicationFilesExcludingPorts,
        itName: (file) => `${relative(file)} has no top-level import of nodemailer`,
        forbidden: [{label: "nodemailer", pattern: /["']nodemailer["']/}],
    },
    {
        describeName: "domain layer stays pure — no Prisma, no infrastructure, no repositories",
        files: domainFiles,
        itName: (file) => `${relative(file)} has no top-level import of lib/db.js, infrastructure/, or repositories/`,
        forbidden: [
            {label: "lib/db.js", pattern: /["'][^"']*\blib\/db\.js["']/},
            {label: "infrastructure/", pattern: /["'][^"']*\/infrastructure\/[^"']*["']/},
            {label: "repositories/", pattern: /["'][^"']*\/repositories\/[^"']*["']/},
        ],
    },
    {
        // D-01, 10-10: closes routes/backups.ts's five cross-layer reaches
        // (two repositories, an infrastructure executor, a job module, the
        // database client) and keeps every route file this clean from here
        // on — a route that starts importing a repository, infrastructure
        // module, job module or lib/db.js fails this test instead of
        // waiting for a reviewer to notice.
        describeName: "routes call application services only — no repository, infrastructure, jobs, or database-client import (D-01, 10-10)",
        files: routeFiles,
        itName: (file) => `${relative(file)} has no top-level import of repositories/, infrastructure/, jobs/, or lib/db.js`,
        forbidden: [
            {label: "repositories/", pattern: /["'][^"']*\/repositories\/[^"']*["']/},
            {label: "infrastructure/", pattern: /["'][^"']*\/infrastructure\/[^"']*["']/},
            {label: "jobs/", pattern: /["'][^"']*\/jobs\/[^"']*["']/},
            {label: "lib/db.js", pattern: /["'][^"']*\blib\/db\.js["']/},
        ],
    },
];

describe("architecture: layering", () => {
    for (const rule of RULES) {
        describe(rule.describeName, () => {
            for (const file of rule.files) {
                it(rule.itName(file), () => {
                    const lines = importLines(file);
                    for (const forbidden of rule.forbidden) {
                        const violations = lines.filter((line) => forbidden.pattern.test(line));
                        expect(
                            violations,
                            `${relative(file)} has a forbidden top-level import of ${forbidden.label}: ${violations.join(", ")}`,
                        ).toHaveLength(0);
                    }
                });
            }
        });
    }

    describe("every infrastructure class implements a named port (D-07, 10-05)", () => {
        const INFRASTRUCTURE_DIR = path.join(SRC_ROOT, "infrastructure");
        const PORTS_DIR = path.join(SRC_ROOT, "application", "ports");

        // Line-anchored so a mention inside a comment or a string literal
        // can never satisfy the rule — only a real top-level "export class"
        // declaration line is inspected. Captures the class name and, when
        // present, the port name from its "implements <Name>Port" clause.
        const CLASS_DECLARATION_PATTERN = /^export class ([A-Za-z0-9]+)(?:\s+extends\s+[A-Za-z0-9]+)?(?:\s+implements\s+([A-Za-z0-9]+))?\b/;

        // Converts a PascalCase port name (e.g. "DockerExecutorPort") to the
        // kebab-case file name convention every port file already follows
        // (e.g. "docker-executor-port.ts") — matches the class-name to
        // file-name convention every port created in 10-01/10-02/10-03/10-05
        // follows, independent of the implementing class's own name (see
        // EventBusPort/InMemoryEventBus from 10-03, where the class name
        // doesn't match the file name but the port name does).
        function kebabCase(name: string): string {
            return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
        }

        const infraFiles = fs
            .readdirSync(INFRASTRUCTURE_DIR)
            .filter((f) => f.endsWith(".ts"))
            .map((f) => path.join(INFRASTRUCTURE_DIR, f));

        for (const file of infraFiles) {
            const content = fs.readFileSync(file, "utf-8");
            const classLines = content.split("\n").filter((line) => /^export class /.test(line));

            it(`${relative(file)} declares at least one exported class`, () => {
                expect(
                    classLines.length,
                    `${relative(file)} has no top-level "export class" declaration`,
                ).toBeGreaterThan(0);
            });

            for (const line of classLines) {
                const match = CLASS_DECLARATION_PATTERN.exec(line);
                const className = match?.[1] ?? "(unparsed)";

                // Typed errors in the lib/errors.ts AppError hierarchy (e.g.
                // RegistryUnavailableError) are exported alongside their
                // infrastructure class but are not ports — callers catch
                // them by identity (T-10-17), so they're exempt from this
                // rule rather than being forced into a port they don't need.
                if (className.endsWith("Error")) continue;

                it(`${relative(file)}'s ${className} implements a named port`, () => {
                    const portName = match?.[2];
                    expect(
                        portName,
                        `${relative(file)}: "export class ${className}" has no "implements <Name>Port" clause`,
                    ).toMatch(/Port$/);

                    const portFileName = `${kebabCase(portName as string)}.ts`;
                    const portFilePath = path.join(PORTS_DIR, portFileName);
                    expect(
                        fs.existsSync(portFilePath),
                        `${relative(file)}: "${className}" declares "implements ${portName}" but server/src/application/ports/${portFileName} does not exist`,
                    ).toBe(true);
                });
            }
        }
    });

    describe("every job under jobs/ joins the Job lifecycle contract (D-02, D-13, 10-07)", () => {
        const JOBS_DIR = path.join(SRC_ROOT, "jobs");
        // index.ts registers/delegates (no job class of its own); job.ts and
        // job-registry.ts are the contract itself, not a job that joins it.
        const EXEMPT_FILES = new Set(["index.ts", "job.ts", "job-registry.ts"]);

        // Line-anchored so a mention inside a comment or a string literal can
        // never satisfy the rule — only a real top-level "export class ..."
        // declaration line joins the contract, either by extending one of
        // the two base classes (which supply `kind` automatically) or by
        // declaring "implements Job" directly (which forces the compiler to
        // require a `kind` member, PD-6's dynamic-kind escape hatch).
        const JOB_CONTRACT_PATTERN = /^export class \w+ (?:extends (?:IntervalJob|WatcherJob)\b|implements Job\b)/;

        const jobFiles = fs
            .readdirSync(JOBS_DIR)
            .filter((f) => f.endsWith(".ts") && !EXEMPT_FILES.has(f))
            .map((f) => path.join(JOBS_DIR, f));

        for (const file of jobFiles) {
            it(`${relative(file)} exports a class that joins the Job lifecycle contract`, () => {
                const content = fs.readFileSync(file, "utf-8");
                const classLines = content.split("\n").filter((line) => /^export class /.test(line));
                expect(
                    classLines.length,
                    `${relative(file)} has no top-level "export class" declaration`,
                ).toBeGreaterThan(0);

                const joined = classLines.some((line) => JOB_CONTRACT_PATTERN.test(line));
                expect(
                    joined,
                    `${relative(file)}: no "export class" line extends IntervalJob/WatcherJob or declares "implements Job" — a new job file must join the Job lifecycle contract (D-02, D-13) instead of hand-rolling its own scheduling`,
                ).toBe(true);
            });
        }
    });

    describe("every repository singleton is published from repositories/index.ts (D-09)", () => {
        const repoFiles = fs
            .readdirSync(REPOSITORIES_DIR)
            .filter((f) => f.endsWith(".ts") && f !== "index.ts");
        const indexContent = fs.readFileSync(path.join(REPOSITORIES_DIR, "index.ts"), "utf-8");
        const indexExportLines = indexContent
            .split("\n")
            .filter((line) => /^\s*export\b/.test(line));

        for (const file of repoFiles) {
            const moduleSpecifier = `./${file.replace(/\.ts$/, ".js")}`;
            it(`repositories/index.ts re-exports a singleton from ${file}`, () => {
                const found = indexExportLines.some((line) => line.includes(moduleSpecifier));
                expect(
                    found,
                    `repositories/index.ts has no export from "${moduleSpecifier}" — every *.ts file under repositories/ other than index.ts must be re-exported as a singleton`,
                ).toBe(true);
            });
        }
    });

    describe("the StackEvent audit table has exactly one write path: the audit subscriber (D-15 item 2, 10-13)", () => {
        // "The audit repository's write member is reached from exactly one
        // file" is enforced by two complementary checks, since the audit
        // subscriber (application/subscribers/stack-event-subscriber.ts)
        // deliberately does NOT import repositories/ at all — it takes a
        // narrow write-only shape by parameter (Task 1's own acceptance
        // criteria: `grep -cE '^\s*import .*repositories/' ...
        // stack-event-subscriber.ts` prints 0). So the module-specifier
        // import check alone can't name the subscriber as the sole importer
        // — instead:
        //   1. No file other than the D-09-mandated barrel
        //      (repositories/index.ts) imports stack-event-repository.js
        //      directly — a future second writer reaching past the barrel
        //      for the concrete module fails here.
        //   2. No file other than the audit subscriber ever calls
        //      `.createEvent(` — the one place the write member is actually
        //      invoked at runtime.
        // application/index.ts (the composition root) imports the singleton
        // from the barrel (../repositories/index.js, not
        // stack-event-repository.js directly) precisely so check 1 stays
        // meaningful, and only ever passes the reference through to
        // registerDomainSubscribers — it never calls .createEvent( itself,
        // so check 2 holds for it too.
        const STACK_EVENT_REPO_MODULE_PATTERN = /["'][^"']*\bstack-event-repository\.js["']/;
        const REPOSITORIES_INDEX_FILE = path.join(REPOSITORIES_DIR, "index.ts");
        const STACK_EVENT_REPO_FILE = path.join(REPOSITORIES_DIR, "stack-event-repository.ts");
        const STACK_EVENT_SUBSCRIBER_FILE = path.join(APPLICATION_DIR, "subscribers", "stack-event-subscriber.ts");

        const allSrcFilesExcludingDefinition = listTsFilesRecursive(SRC_ROOT).filter(
            (f) => f !== STACK_EVENT_REPO_FILE,
        );

        it("no file under server/src/ other than repositories/index.ts imports stack-event-repository.js directly", () => {
            const offenders: string[] = [];
            for (const file of allSrcFilesExcludingDefinition) {
                if (file === REPOSITORIES_INDEX_FILE) continue;
                const lines = importLines(file);
                if (lines.some((line) => STACK_EVENT_REPO_MODULE_PATTERN.test(line))) {
                    offenders.push(relative(file));
                }
            }
            expect(
                offenders,
                `The following file(s) import stack-event-repository.js directly, bypassing the audit subscriber's DI shape: ${offenders.join(", ")}`,
            ).toHaveLength(0);
        });

        it("no file under server/src/ other than the audit subscriber calls .createEvent( on the audit repository", () => {
            // A plain, non-comment code line only — a mention inside a `//`
            // comment (e.g. explaining what used to happen here) must not
            // trip this rule, matching every other rule in this file's
            // comment/string immunity.
            const offenders: string[] = [];
            for (const file of allSrcFilesExcludingDefinition) {
                if (file === STACK_EVENT_SUBSCRIBER_FILE) continue;
                const content = fs.readFileSync(file, "utf-8");
                const hasCall = content
                    .split("\n")
                    .some((line) => !/^\s*\/\//.test(line) && /\.createEvent\(/.test(line));
                if (hasCall) offenders.push(relative(file));
            }
            expect(
                offenders,
                `The following file(s) call .createEvent( directly — application/subscribers/stack-event-subscriber.ts must be the only caller: ${offenders.join(", ")}`,
            ).toHaveLength(0);
        });
    });

    describe("no source file lives under a 'services' directory (D-11, 10-14)", () => {
        // server/src/services/ was a leftover from before the current
        // application/ + repositories/ split (empty except .gitkeep, deleted
        // by plan 10-14). This rule guards against a future author
        // recreating it out of habit rather than against a mistaken revert —
        // the failure message names the layer that actually owns this kind
        // of code so the fix is obvious, not just "the file is misplaced".
        const allSrcFiles = listTsFilesRecursive(SRC_ROOT);
        const offenders = allSrcFiles.filter((f) =>
            relative(f).split("/").includes("services"),
        );

        it("no .ts file exists under a 'services' directory anywhere in server/src/", () => {
            expect(
                offenders.map(relative),
                `The following file(s) live under a 'services' directory: ${offenders.map(relative).join(", ")} — application services belong in server/src/application/, not a separate services/ directory`,
            ).toHaveLength(0);
        });
    });
});
