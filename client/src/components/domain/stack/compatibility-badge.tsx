import {ToneBadge} from "@/components/common/tone-badge";
import type {Tone} from "@/components/common/tone-badge";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip";

interface CompatibilityBadgeProps {
  compatibility: "green" | "yellow" | "red";
  unsupportedFeatures?: string[];
}

const BADGE_CONFIG: Record<
  CompatibilityBadgeProps["compatibility"],
  {label: string; tone: Tone; tooltip: string}
> = {
  green: {
    label: "Ready",
    tone: "green",
    tooltip: "This stack uses only relative bind mounts and is ready to adopt in-place.",
  },
  yellow: {
    label: "Migration Recommended",
    tone: "yellow",
    tooltip: "This stack has named volumes, absolute bind mounts, or inline environment variables. Full migration recommended for backup compatibility.",
  },
  red: {
    label: "Unsupported",
    tone: "red",
    tooltip: "This stack uses Docker Compose features not supported by Docktor (configs, secrets, complex depends_on, or external networks beyond simple external:true).",
  },
};

export function CompatibilityBadge({compatibility, unsupportedFeatures}: Readonly<CompatibilityBadgeProps>) {
  const config = BADGE_CONFIG[compatibility];
  const tooltipText = unsupportedFeatures?.length
    ? `${config.tooltip} Issues: ${unsupportedFeatures.join(", ")}`
    : config.tooltip;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <ToneBadge tone={config.tone} className="cursor-help">
            {config.label}
          </ToneBadge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p>{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
