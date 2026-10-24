import {useCallback, useMemo, useSyncExternalStore} from "react";
import type {MigrationOperation} from "@docktor/shared";
import {useContainerEvents, type StateEvent} from "@/hooks/use-container-events";
import {migrationOperationsStore} from "@/lib/migration-operations-store";

type ListOperations = () => Promise<{operations: MigrationOperation[]}>;

interface UseMigrationOperationsResult {
  operations: readonly MigrationOperation[];
  /** Running operations by the compose path of the stack being migrated. */
  runningByComposePath: ReadonlyMap<string, MigrationOperation>;
  /** Starts following an operation returned by the migrate request. */
  track: (operation: MigrationOperation) => void;
}

const track = (operation: MigrationOperation): void => migrationOperationsStore.track(operation);

function handleEvent(event: StateEvent): void {
  if (event.type === "migration_progress") migrationOperationsStore.receive(event.operation);
}

/**
 * Keeps the module store current: `migration_progress` SSE events flow in, and
 * the operation list is read exactly once per stream open (the first open and
 * every reconnect), which also recovers what happened while the stream was
 * closed. Mount it once in a layout-level owner (MigrationToastTracker), not in
 * pages: it opens the EventSource.
 */
export function useMigrationOperationFeed(listOperations: ListOperations): void {
  const resync = useCallback(() => {
    const runningBefore = migrationOperationsStore.runningIds();
    listOperations()
      .then(({operations}) => migrationOperationsStore.reconcile(operations, runningBefore))
      .catch((err: unknown) => console.warn("Could not read migration operations", err));
  }, [listOperations]);

  useContainerEvents(handleEvent, {onOpen: resync});
}

/**
 * Read-only view of the store for pages (G-18-job). Opens no EventSource of
 * its own; the feed owner keeps the store current.
 */
export function useMigrationOperations(): UseMigrationOperationsResult {
  const operations = useSyncExternalStore(migrationOperationsStore.subscribe, migrationOperationsStore.getSnapshot);

  const runningByComposePath = useMemo(
    () => new Map(operations.filter((op) => op.status === "running").map((op) => [op.composePath, op])),
    [operations],
  );

  return {operations, runningByComposePath, track};
}
