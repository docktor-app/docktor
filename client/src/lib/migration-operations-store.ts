import type {MigrationOperation} from "@docktor/shared";

export type FollowedChange =
  | {readonly kind: "updated"; readonly operation: MigrationOperation}
  | {readonly kind: "lost"; readonly operation: MigrationOperation};

/** RED stub: replaced by the real implementation in the GREEN commit. */
export class MigrationOperationsStore {
  getSnapshot = (): readonly MigrationOperation[] => [];
  subscribe = (_listener: () => void): (() => void) => () => undefined;
  onFollowedChange = (_listener: (change: FollowedChange) => void): (() => void) => () => undefined;
  track(_operation: MigrationOperation): void {}
  receive(_operation: MigrationOperation): void {}
  reconcile(_listed: readonly MigrationOperation[], _requestedWhileRunning?: ReadonlySet<string>): void {}
  runningIds(): ReadonlySet<string> {
    return new Set();
  }
  reset(): void {}
}

export const migrationOperationsStore = new MigrationOperationsStore();

export function lostMigrationMessage(operation: Pick<MigrationOperation, "displayName">): string {
  return operation.displayName;
}
