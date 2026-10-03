import {Package} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {ToneBadge} from "@/components/common/tone-badge";
import type {TemplateSummary} from "@/lib/templates-api";

export interface TemplateCardProps {
    readonly template: TemplateSummary;
    readonly onUse: (template: TemplateSummary) => void;
}

/**
 * Issue #19/D-07: one card per template in the browse grid. Icons are
 * rendered only from the inline data URI the server produces (never a
 * remote URL, T-12-34) — a missing icon falls back to a generic lucide
 * Package glyph, never a broken <img>.
 */
export function TemplateCard({template, onUse}: Readonly<TemplateCardProps>) {
    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-3">
                    {template.iconDataUri ? (
                        <img src={template.iconDataUri} alt="" className="h-10 w-10 shrink-0 rounded" />
                    ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted">
                            <Package className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                        </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                        <CardTitle className="truncate">{template.name}</CardTitle>
                        <ToneBadge tone="neutral">{template.category}</ToneBadge>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className="line-clamp-2 text-sm text-muted-foreground" title={template.description}>
                    {template.description}
                </p>
                {template.variants.length > 1 && (
                    <p className="text-sm text-muted-foreground">{template.variants.length} variants</p>
                )}
                <Button onClick={() => onUse(template)}>Use Template</Button>
            </CardContent>
        </Card>
    );
}
