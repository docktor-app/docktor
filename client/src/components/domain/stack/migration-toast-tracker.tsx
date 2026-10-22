import {useEffect} from "react";
import {useNavigate} from "react-router";
import {toast} from "sonner";
import type {MigrationOperation} from "@docktor/shared";
import {useMigrationOperationFeed} from "@/hooks/use-migration-operations";
import {lostMigrationMessage, migrationOperationsStore} from "@/lib/migration-operations-store";
import {showMigrationToast} from "@/lib/migration-progress";

interface MigrationToastTrackerProps {
  readonly listOperations: () => Promise<{operations: MigrationOperation[]}>;
}

/**
 * Owns the toast of every followed migration. Mounted once in a layout (the
 * authenticated app layout and the setup page), so a toast ends in done,
 * failed, rolled back or lost whatever page the user is on (#105).
 */
export function MigrationToastTracker({listOperations}: Readonly<MigrationToastTrackerProps>): null {
  const navigate = useNavigate();
  useMigrationOperationFeed(listOperations);

  useEffect(
    () =>
      migrationOperationsStore.onFollowedChange((change) => {
        if (change.kind === "lost") {
          toast.error(lostMigrationMessage(change.operation), {id: change.operation.id});
          return;
        }
        showMigrationToast(change.operation, navigate);
      }),
    [navigate],
  );

  return null;
}
