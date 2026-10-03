import {useEffect, useState} from "react";
import {Button} from "@/components/ui/button";
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import type {TemplateSummary, TemplateVariantSummary} from "@/lib/templates-api";

export interface TemplateVariantDialogProps {
    readonly open: boolean;
    readonly template: TemplateSummary | null;
    readonly onOpenChange: (open: boolean) => void;
    readonly onChoose: (variant: TemplateVariantSummary) => void;
}

/**
 * Issue #19/D-06: the multi-variant picker — a forward-navigation choice, so
 * a dismissible Dialog (not AlertDialog) is correct here, unlike the
 * review-gate AlertDialogs elsewhere in this phase. First variant is
 * preselected; Escape/outside-click close without choosing (Radix Dialog's
 * default onOpenChange(false) behavior).
 */
export function TemplateVariantDialog({
    open,
    template,
    onOpenChange,
    onChoose,
}: Readonly<TemplateVariantDialogProps>) {
    const variants = template?.variants ?? [];
    const [selectedId, setSelectedId] = useState<string | null>(variants[0]?.id ?? null);

    useEffect(() => {
        if (open) setSelectedId(variants[0]?.id ?? null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, template?.id]);

    function handleChoose() {
        const variant = variants.find((v) => v.id === selectedId);
        if (variant) onChoose(variant);
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Choose a configuration for {template?.name ?? ""}</DialogTitle>
                </DialogHeader>

                <div className="space-y-2">
                    {variants.map((variant) => (
                        <label
                            key={variant.id}
                            className="flex items-start gap-3 rounded-md border p-3 has-[:checked]:border-primary"
                        >
                            <input
                                type="radio"
                                name="template-variant"
                                value={variant.id}
                                checked={selectedId === variant.id}
                                onChange={() => setSelectedId(variant.id)}
                                className="mt-1"
                                aria-label={variant.name}
                            />
                            <span>
                                <span className="block font-semibold">{variant.name}</span>
                                <span className="block text-sm text-muted-foreground">{variant.description}</span>
                            </span>
                        </label>
                    ))}
                </div>

                <DialogFooter>
                    <Button onClick={handleChoose} disabled={!selectedId}>
                        Use this variant
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
