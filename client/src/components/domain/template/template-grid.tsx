import {useMemo, useState} from "react";
import {Link} from "react-router";
import {Input} from "@/components/ui/input";
import {TemplateCard} from "@/components/domain/template/template-card";
import type {TemplateSummary} from "@/lib/templates-api";

export interface TemplateGridProps {
    readonly templates: ReadonlyArray<TemplateSummary>;
    readonly onUse: (template: TemplateSummary) => void;
}

// Issue #19/D-07: search box + a native category dropdown (log-viewer
// precedent — Radix Select renders two role=combobox elements in jsdom)
// filter the grid locally; a no-match result shows an empty-state heading
// with a link back to the blank-slate Create Stack form.
export function TemplateGrid({templates, onUse}: Readonly<TemplateGridProps>) {
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("");

    const categories = useMemo(
        () => Array.from(new Set(templates.map((t) => t.category))).sort((a, b) => a.localeCompare(b)),
        [templates],
    );

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        return templates.filter((template) => {
            if (category && template.category !== category) return false;
            if (!query) return true;
            return (
                template.name.toLowerCase().includes(query) ||
                template.description.toLowerCase().includes(query) ||
                template.category.toLowerCase().includes(query)
            );
        });
    }, [templates, search, category]);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
                <Input
                    aria-label="Search templates"
                    placeholder="Search templates"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="max-w-xs"
                />
                <select
                    aria-label="Category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                >
                    <option value="">All categories</option>
                    {categories.map((c) => (
                        <option key={c} value={c}>
                            {c}
                        </option>
                    ))}
                </select>
            </div>

            {filtered.length === 0 ? (
                <div className="space-y-1">
                    <p className="text-lg font-semibold">No templates found</p>
                    <p className="text-sm text-muted-foreground">
                        Try a different search term or category — or{" "}
                        <Link to="/stacks/create" className="underline">
                            start from a blank compose file
                        </Link>{" "}
                        instead.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {filtered.map((template) => (
                        <TemplateCard key={template.id} template={template} onUse={onUse} />
                    ))}
                </div>
            )}
        </div>
    );
}
