import {TemplateCard} from "@/components/domain/template/template-card";
import type {TemplateSummary} from "@/lib/templates-api";

export interface TemplateGridProps {
    readonly templates: ReadonlyArray<TemplateSummary>;
    readonly onUse: (template: TemplateSummary) => void;
}

// Issue #19/D-07: the browse grid. Search/category-filter and the
// no-match empty state are added in plan 12-09's Task 2.
export function TemplateGrid({templates, onUse}: Readonly<TemplateGridProps>) {
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => (
                <TemplateCard key={template.id} template={template} onUse={onUse} />
            ))}
        </div>
    );
}
