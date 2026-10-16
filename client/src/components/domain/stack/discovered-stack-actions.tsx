import {Link} from "react-router";
import {Button} from "@/components/ui/button";
import {ToneBadge} from "@/components/common/tone-badge";
import type {DiscoveredStack} from "@/lib/brownfield-types";

interface DiscoveredStackActionsProps {
  stack: DiscoveredStack;
  isAdopted: boolean;
  isAdopting: boolean;
  onMigrate: () => void;
  onAdopt: () => void;
}

/**
 * Action cell of a scan result row. A stack Docktor already manages keeps its
 * buttons but disabled, with a link to the managing stack; the server refuses
 * the request regardless, so this is convenience only.
 */
export function DiscoveredStackActions({
  stack,
  isAdopted,
  isAdopting,
  onMigrate,
  onAdopt,
}: Readonly<DiscoveredStackActionsProps>) {
  if (isAdopted) {
    return <span className="text-sm text-green-600 dark:text-green-400">Imported</span>;
  }

  const {managedStack} = stack;
  const disabled = isAdopting || managedStack !== null;

  return (
    <div className="flex items-center justify-end gap-2">
      {managedStack && (
        <>
          <ToneBadge tone="blue">Already managed</ToneBadge>
          <Link to={`/stacks/${managedStack.id}`} className="text-sm underline-offset-4 hover:underline">
            View {managedStack.displayName}
          </Link>
        </>
      )}
      <Button size="sm" variant="outline" onClick={onMigrate} disabled={disabled}>
        Migrate
      </Button>
      <Button size="sm" onClick={onAdopt} disabled={disabled}>
        {isAdopting ? "Adopting..." : "Adopt"}
      </Button>
    </div>
  );
}
