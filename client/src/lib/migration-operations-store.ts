import {MIGRATION_OPERATION_STEPS, type MigrationOperation} from "@docktor/shared";

export type FollowedChange =
  | {readonly kind: "updated"; readonly operation: MigrationOperation}
  | {readonly kind: "lost"; readonly operation: MigrationOperation};

function stepIndex(operation: MigrationOperation): number {
  return MIGRATION_OPERATION_STEPS.indexOf(operation.step);
}

function isSameSnapshot(a: MigrationOperation, b: MigrationOperation): boolean {
  return a.status === b.status && a.step === b.step && a.stepDetail === b.stepDetail;
}

/**
 * A snapshot is stale when it repeats the stored one or would move an
 * operation backwards: a finished operation never becomes running again, and a
 * running one never returns to an earlier step (the 202 response can arrive
 * after the first SSE events).
 */
function isStale(current: MigrationOperation | undefined, next: MigrationOperation): boolean {
  if (!current) return false;
  if (current.status !== "running") return next.status === "running" || isSameSnapshot(current, next);
  return next.status === "running" && (stepIndex(next) < stepIndex(current) || isSameSnapshot(current, next));
}

/** Observation, never an outcome: Docktor cannot know how a migration it lost track of ended (D-07). */
export function lostMigrationMessage(operation: Pick<MigrationOperation, "displayName">): string {
  return `Docktor no longer reports the migration of ${operation.displayName} (it may have restarted). Check the stack list and the old stack before trying again.`;
}

/**
 * Client-side registry of background migration operations. It lives at module
 * level so its lifecycle does not depend on which page is mounted: a toast
 * keeps following its operation after the user leaves the import page (#105).
 * An operation is followed once it was tracked here or seen running, so
 * finished operations of earlier sessions never raise a toast.
 */
export class MigrationOperationsStore {
  private readonly operations = new Map<string, MigrationOperation>();
  private readonly followed = new Set<string>();
  private snapshot: readonly MigrationOperation[] = [];
  private readonly listeners = new Set<() => void>();
  private readonly followedListeners = new Set<(change: FollowedChange) => void>();

  // Arrow properties: passed unbound to useSyncExternalStore.
  readonly getSnapshot = (): readonly MigrationOperation[] => this.snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly onFollowedChange = (listener: (change: FollowedChange) => void): (() => void) => {
    this.followedListeners.add(listener);
    return () => {
      this.followedListeners.delete(listener);
    };
  };

  /** Starts following an operation returned by the migrate request. */
  track(operation: MigrationOperation): void {
    this.upsert(operation, true);
  }

  /** Stores a snapshot (SSE event or list entry); follows it while it runs. */
  receive(operation: MigrationOperation): void {
    this.upsert(operation, false);
  }

  /** Ids of the operations that currently run, to scope a later {@link reconcile}. */
  runningIds(): ReadonlySet<string> {
    return new Set([...this.operations.values()].filter((op) => op.status === "running").map((op) => op.id));
  }

  /**
   * Applies the server's full operation list. A followed operation still
   * running here that the list does not contain is lost (for example the
   * server restarted): it is reported once, unfollowed and dropped, so no
   * toast or row spins forever. `requestedWhileRunning` limits that verdict to
   * operations that already ran when the list was requested; one started
   * meanwhile cannot be in the response yet.
   */
  reconcile(listed: readonly MigrationOperation[], requestedWhileRunning?: ReadonlySet<string>): void {
    listed.forEach((operation) => this.receive(operation));
    const listedIds = new Set(listed.map((operation) => operation.id));
    for (const operation of [...this.operations.values()]) {
      const lost =
        operation.status === "running" &&
        this.followed.has(operation.id) &&
        !listedIds.has(operation.id) &&
        (requestedWhileRunning?.has(operation.id) ?? true);
      if (lost) this.drop(operation);
    }
  }

  /** Test helper: forgets every operation and followed id (listeners stay). */
  reset(): void {
    this.operations.clear();
    this.followed.clear();
    this.refreshSnapshot();
  }

  private upsert(operation: MigrationOperation, follow: boolean): void {
    if (isStale(this.operations.get(operation.id), operation)) return;
    if (follow || operation.status === "running") this.followed.add(operation.id);
    this.operations.set(operation.id, operation);
    this.refreshSnapshot();
    if (this.followed.has(operation.id)) this.emit({kind: "updated", operation});
  }

  private drop(operation: MigrationOperation): void {
    this.operations.delete(operation.id);
    this.followed.delete(operation.id);
    this.refreshSnapshot();
    this.emit({kind: "lost", operation});
  }

  private refreshSnapshot(): void {
    this.snapshot = [...this.operations.values()];
    this.listeners.forEach((listener) => listener());
  }

  private emit(change: FollowedChange): void {
    this.followedListeners.forEach((listener) => listener(change));
  }
}

export const migrationOperationsStore = new MigrationOperationsStore();
