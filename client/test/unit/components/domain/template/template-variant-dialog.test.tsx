import {describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {TemplateVariantDialog} from "@/components/domain/template/template-variant-dialog";
import type {TemplateSummary} from "@/lib/templates-api";

if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
}

const TEMPLATE: TemplateSummary = {
    id: "t1",
    repoId: "r1",
    slug: "nextcloud",
    name: "Nextcloud",
    description: "A file sync and share platform",
    category: "productivity",
    iconDataUri: null,
    variants: [
        {id: "v1", slug: "sqlite", name: "SQLite", description: "Single-container, SQLite-backed"},
        {id: "v2", slug: "postgres", name: "PostgreSQL", description: "Separate Postgres container"},
    ],
};

describe("TemplateVariantDialog", () => {
    it("lists every variant as a radio option with the first preselected", () => {
        render(
            <TemplateVariantDialog open template={TEMPLATE} onOpenChange={vi.fn()} onChoose={vi.fn()} />,
        );

        expect(screen.getByText("Choose a configuration for Nextcloud")).toBeVisible();
        expect(screen.getByText("SQLite")).toBeVisible();
        expect(screen.getByText("PostgreSQL")).toBeVisible();
        expect(screen.getByRole("radio", {name: "SQLite"})).toBeChecked();
        expect(screen.getByRole("radio", {name: "PostgreSQL"})).not.toBeChecked();
    });

    it("Use this variant calls onChoose with the selected variant", async () => {
        const onChoose = vi.fn();
        const user = userEvent.setup();

        render(
            <TemplateVariantDialog open template={TEMPLATE} onOpenChange={vi.fn()} onChoose={onChoose} />,
        );

        await user.click(screen.getByRole("radio", {name: "PostgreSQL"}));
        await user.click(screen.getByRole("button", {name: "Use this variant"}));

        expect(onChoose).toHaveBeenCalledWith(TEMPLATE.variants[1]);
    });

    it("Escape closes the dialog without calling onChoose", async () => {
        const onChoose = vi.fn();
        const onOpenChange = vi.fn();
        const user = userEvent.setup();

        render(
            <TemplateVariantDialog open template={TEMPLATE} onOpenChange={onOpenChange} onChoose={onChoose} />,
        );

        await user.keyboard("{Escape}");

        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onChoose).not.toHaveBeenCalled();
    });
});
