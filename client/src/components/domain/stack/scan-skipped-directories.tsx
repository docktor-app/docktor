import {AlertTriangle} from "lucide-react";
import {Alert, AlertDescription, AlertTitle} from "@/components/ui/alert";
import type {SkippedDirectory} from "@/lib/brownfield-types";

type SkippedDirectoryReason = SkippedDirectory["reason"];

const REASON_LABELS: Record<SkippedDirectoryReason, string> = {
  not_found: "Not found inside the Docktor container",
  permission_denied: "Permission denied",
  system_directory: "System directory, never scanned",
};

interface ScanSkippedDirectoriesProps {
  skipped: readonly SkippedDirectory[];
}

/**
 * Lists every scan root that produced nothing, with the reason, so a path the
 * container cannot see is never mistaken for "no stacks here".
 */
export function ScanSkippedDirectories({skipped}: Readonly<ScanSkippedDirectoriesProps>) {
  if (skipped.length === 0) {
    return null;
  }

  return (
    <section aria-label="Skipped directories">
      <Alert>
        <AlertTriangle className="text-yellow-600 dark:text-yellow-400" />
        <AlertTitle className="text-sm font-semibold">Skipped directories ({skipped.length})</AlertTitle>
        <AlertDescription>
          <ul className="space-y-1">
            {skipped.map(({directory, reason}) => (
              <li key={directory}>
                <span className="font-mono text-xs break-all">{directory}</span>
                <span className="block text-muted-foreground">{REASON_LABELS[reason]}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Docktor scans paths inside its own container. With the default docker-compose.yml the host's files are
            under /host, for example /host/opt/stacks for /opt/stacks on the host.
          </p>
        </AlertDescription>
      </Alert>
    </section>
  );
}
