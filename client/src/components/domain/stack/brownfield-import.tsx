import {useState} from "react";
import {useNavigate} from "react-router";
import {toast} from "sonner";
import type {MigrationExecuteInput, MigrationOperation, MigrationPreviewInput} from "@docktor/shared";
import {Search, FolderOpen} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {Skeleton} from "@/components/ui/skeleton";
import {CompatibilityBadge} from "@/components/domain/stack/compatibility-badge";
import {DiscoveredStackActions} from "@/components/domain/stack/discovered-stack-actions";
import {ScanSkippedDirectories} from "@/components/domain/stack/scan-skipped-directories";
import {MigrationWizard, type ConfirmMigrateParams} from "@/routes/setup/components/migration-wizard";
import {useMigrationOperations} from "@/hooks/use-migration-operations";
import {directoryDisplayName} from "@/lib/path-display";
import {MIGRATION_ERROR_FALLBACK, showMigrationToast} from "@/lib/migration-progress";
import type {
  DiscoveredStack,
  MigrationPreview,
  ScanResult,
  SkippedDirectory,
} from "@/lib/brownfield-types";

/**
 * Injected API surface so this component is agnostic about which endpoints
 * drive it — the setup wizard's BrownfieldStep wires it to `setup-api.ts`
 * (`/api/setup/*`, reachable only while the wizard is incomplete), and the
 * post-setup `/stacks/import` page wires it to `import-api.ts`
 * (`/api/stacks/import/*`, reachable by any authenticated user afterward).
 */
export interface BrownfieldImportApi {
  scanDirectories: (directories: string[]) => Promise<ScanResult>;
  adoptStack: (composePath: string, displayName: string) => Promise<{id: string}>;
  previewMigration: (input: MigrationPreviewInput) => Promise<MigrationPreview>;
  // Answers 202 with the background operation, not the migration outcome.
  executeMigration: (input: MigrationExecuteInput) => Promise<MigrationOperation>;
  listMigrationOperations: () => Promise<{operations: MigrationOperation[]}>;
}

interface BrownfieldImportProps {
  api: BrownfieldImportApi;
}

export function BrownfieldImport({api}: Readonly<BrownfieldImportProps>) {
  const navigate = useNavigate();
  const [directories, setDirectories] = useState("/home, /opt, /srv");
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [stacks, setStacks] = useState<DiscoveredStack[]>([]);
  const [skipped, setSkipped] = useState<readonly SkippedDirectory[]>([]);
  const [adoptingId, setAdoptingId] = useState<string | null>(null);
  const [migratingStack, setMigratingStack] = useState<DiscoveredStack | null>(null);
  const [adoptedIds, setAdoptedIds] = useState<Set<string>>(new Set());

  const {runningByComposePath, track} = useMigrationOperations(api.listMigrationOperations, {
    onUpdate: (operation) => {
      showMigrationToast(operation, navigate);
      if (operation.status === "succeeded") {
        setAdoptedIds((prev) => new Set([...prev, operation.composePath]));
      }
    },
  });

  const handleScan = async () => {
    const dirs = directories
      .split(",")
      .map((d) => d.trim())
      .filter((d) => d.length > 0);

    if (dirs.length === 0) {
      toast.error("Please enter at least one directory to scan");
      return;
    }

    setScanning(true);
    try {
      const result = await api.scanDirectories(dirs);
      setStacks(result.stacks);
      setSkipped(result.skipped);
      setScanned(true);

      if (result.stacks.length === 0) {
        toast.info(
          result.skipped.length > 0
            ? "No compose files found. Some directories could not be scanned; see the list below."
            : "No compose files found in the specified directories",
        );
      } else {
        toast.success(`Found ${result.stacks.length} stack(s)`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Scan failed";
      toast.error(message);
    } finally {
      setScanning(false);
    }
  };

  const handleAdopt = async (stack: DiscoveredStack) => {
    const displayName = directoryDisplayName(stack.directory) || "imported-stack";
    setAdoptingId(stack.path);

    try {
      const result = await api.adoptStack(stack.path, displayName);
      toast.success(`${displayName} adopted successfully`, {
        action: {
          label: "View stack",
          onClick: () => navigate(`/stacks/${result.id}`),
        },
      });
      setAdoptedIds((prev) => new Set([...prev, stack.path]));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to adopt stack";
      toast.error(message);
    } finally {
      setAdoptingId(null);
    }
  };

  // WR-09: the migration request starts here (in the parent, which stays
  // mounted for the whole background migration) instead of inside
  // MigrationWizard, which closes/unmounts as soon as the user confirms.
  // G-18-job: the request answers 202 with an operation; its progress and
  // outcome arrive as toasts through useMigrationOperations.
  const handleConfirmMigrate = ({
    stack,
    displayName,
    volumeSelections,
    namedVolumeSelections,
    backup,
    stopOldStack,
    inPlaceAsideName,
  }: ConfirmMigrateParams) => {
    api
      .executeMigration({
        composePath: stack.path,
        displayName,
        volumeSelections,
        namedVolumeSelections,
        backup,
        stopOldStack,
        ...(inPlaceAsideName !== null && {inPlaceAsideName}),
      })
      .then(track)
      .catch((err: unknown) => {
        toast.error(err instanceof Error && err.message ? err.message : MIGRATION_ERROR_FALLBACK);
      });
  };

  return (
    <>
      <Card className="w-full max-w-6xl mx-auto">
        <CardHeader>
          <CardTitle>Import Existing Stacks</CardTitle>
          <CardDescription>
            Scan your filesystem for existing Docker Compose stacks and adopt them into Docktor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="directories">Directories to Scan</Label>
            <div className="flex gap-2">
              <Input
                id="directories"
                value={directories}
                onChange={(e) => setDirectories(e.target.value)}
                placeholder="/home, /opt, /srv"
                className="flex-1"
              />
              <Button onClick={handleScan} disabled={scanning}>
                {scanning ? (
                  "Scanning..."
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Scan
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter comma-separated paths as the Docktor container sees them (host directories are under /host with
              the default compose file). System directories (/proc, /sys, /dev) are automatically excluded.
            </p>
          </div>

          {scanning && (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}

          {scanned && !scanning && <ScanSkippedDirectories skipped={skipped} />}

          {scanned && !scanning && stacks.length === 0 && (
            <div className="text-center py-8 border rounded-md">
              <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm font-semibold">No stacks found</p>
              <p className="text-sm text-muted-foreground mt-1">
                We couldn't find any docker-compose.yml files in the directories you specified.
                Check the paths and try again.
              </p>
            </div>
          )}

          {scanned && !scanning && stacks.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Discovered Stacks ({stacks.length})</h3>
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Directory</TableHead>
                      <TableHead>Services</TableHead>
                      <TableHead>Compatibility</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stacks.map((stack) => {
                      const isAdopted = adoptedIds.has(stack.path);
                      const isAdopting = adoptingId === stack.path;

                      return (
                        <TableRow key={stack.path}>
                          <TableCell className="font-mono text-sm whitespace-normal break-all min-w-48">
                            {stack.directory}
                          </TableCell>
                          <TableCell>{stack.serviceCount}</TableCell>
                          <TableCell>
                            <CompatibilityBadge
                              compatibility={stack.compatibility}
                              unsupportedFeatures={stack.unsupportedFeatures}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <DiscoveredStackActions
                              stack={stack}
                              isAdopted={isAdopted}
                              isAdopting={isAdopting}
                              runningOperation={runningByComposePath.get(stack.path)}
                              onMigrate={() => setMigratingStack(stack)}
                              onAdopt={() => handleAdopt(stack)}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">
                <strong>Green</strong> stacks can be adopted in-place safely.
                <strong> Yellow/red</strong> stacks should be migrated for full Docktor compatibility (backups, env editing).
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {migratingStack && (
        <MigrationWizard
          stack={migratingStack}
          open={true}
          onClose={() => setMigratingStack(null)}
          onConfirmMigrate={handleConfirmMigrate}
          previewMigration={api.previewMigration}
        />
      )}
    </>
  );
}
