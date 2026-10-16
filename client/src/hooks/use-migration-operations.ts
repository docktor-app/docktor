import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {MIGRATION_OPERATION_STEPS, type MigrationOperation} from "@docktor/shared";
import {useContainerEvents, type StateEvent} from "@/hooks/use-container-events";

type ListOperations = () => Promise<{operations: MigrationOperation[]}>;

interface UseMigrationOperationsOptions {
  /** Called for every change of an operation this session follows. */
  onUpdate?: (operation: MigrationOperation) => void;
}

interface UseMigrationOperationsResult {
  operations: MigrationOperation[];
  /** Running operations by the compose path of the stack being migrated. */
  runningByComposePath: ReadonlyMap<string, MigrationOperation>;
  /** Starts following an operation returned by the migrate request. */
  track: (operation: MigrationOperation) => void;
}

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

/**
 * Single source of truth for background migration operations (G-18-job).
 * The list is read once on mount; afterwards `migration_progress` SSE events
 * keep it current. An operation is followed (reported through `onUpdate`) once
 * it was tracked here or seen running, so finished operations from earlier
 * sessions never raise a toast.
 */
export function useMigrationOperations(
  listOperations: ListOperations,
  options: UseMigrationOperationsOptions = {},
): UseMigrationOperationsResult {
  const [operations, setOperations] = useState<MigrationOperation[]>([]);
  const store = useRef(new Map<string, MigrationOperation>());
  const followed = useRef(new Set<string>());
  const onUpdate = useRef(options.onUpdate);
  onUpdate.current = options.onUpdate;
  const list = useRef(listOperations);
  list.current = listOperations;

  const upsert = useCallback((operation: MigrationOperation, follow: boolean) => {
    if (isStale(store.current.get(operation.id), operation)) return;
    if (follow || operation.status === "running") followed.current.add(operation.id);
    store.current.set(operation.id, operation);
    setOperations([...store.current.values()]);
    if (followed.current.has(operation.id)) onUpdate.current?.(operation);
  }, []);

  const track = useCallback((operation: MigrationOperation) => upsert(operation, true), [upsert]);

  const handleEvent = useCallback(
    (event: StateEvent) => {
      if (event.type === "migration_progress") upsert(event.operation, false);
    },
    [upsert],
  );

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const resync = useCallback(() => {
    list
      .current()
      .then(({operations: listed}) => {
        if (mounted.current) listed.forEach((operation) => upsert(operation, false));
      })
      .catch((err: unknown) => console.warn("Could not read migration operations", err));
  }, [upsert]);

  // Events missed while the stream was closed (reload, network loss) are
  // recovered by re-reading the list whenever the stream opens.
  useContainerEvents(handleEvent, {onOpen: resync});
  useEffect(resync, [resync]);

  const runningByComposePath = useMemo(
    () => new Map(operations.filter((op) => op.status === "running").map((op) => [op.composePath, op])),
    [operations],
  );

  return {operations, runningByComposePath, track};
}
