import type {MigrationDiskSpace} from "@docktor/shared";
import {formatBytes} from "@/lib/format-bytes";

export interface MigrationDiskSpaceProps {
  readonly diskSpace: MigrationDiskSpace;
  // The backup can be turned off to make room only in a separate migration; in place there is no extra copy to drop.
  readonly backupCanBeDropped: boolean;
}

// #107, D-08: what the migration needs against what each filesystem has free,
// plus one alert per filesystem that is short. The server refuses a shortfall
// too; this is where the user sees how much to free up.
export function MigrationDiskSpace({diskSpace, backupCanBeDropped}: Readonly<MigrationDiskSpaceProps>): React.JSX.Element {
  const short = diskSpace.filesystems.filter((filesystem) => filesystem.availableBytes < filesystem.requiredBytes);

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
        {diskSpace.filesystems.map(({label, requiredBytes, availableBytes}) => (
          <li key={label} className="break-all">
            {`${label}: needs ${formatBytes(requiredBytes)}, ${formatBytes(availableBytes)} available`}
          </li>
        ))}
      </ul>
      {short.length > 0 && (
        <div role="alert" className="flex flex-col gap-1 text-xs text-red-600 dark:text-red-400">
          {short.map(({label, requiredBytes, availableBytes}) => (
            <p key={label} className="break-all">
              {`Not enough free space on ${label}: free up ${formatBytes(requiredBytes - availableBytes)}${backupCanBeDropped ? " or turn off the backup." : "."}`}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
