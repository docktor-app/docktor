import {describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MemoryRouter} from "react-router";
import {TemplateGrid} from "@/components/domain/template/template-grid";
import type {TemplateSummary} from "@/lib/templates-api";

const TEMPLATES: TemplateSummary[] = [
    {
        id: "t1",
        repoId: "r1",
        slug: "nextcloud",
        name: "Nextcloud",
        description: "A file sync and share platform",
        category: "productivity",
        iconDataUri: null,
        variants: [{id: "v1", slug: "default", name: "Default", description: ""}],
    },
    {
        id: "t2",
        repoId: "r1",
        slug: "vaultwarden",
        name: "Vaultwarden",
        description: "A password manager server",
        category: "security",
        iconDataUri: null,
        variants: [{id: "v2", slug: "default", name: "Default", description: ""}],
    },
];

function renderGrid(templates = TEMPLATES, onUse = vi.fn()) {
    return render(
        <MemoryRouter>
            <TemplateGrid templates={templates} onUse={onUse} />
        </MemoryRouter>,
    );
}

describe("TemplateGrid", () => {
    it("renders a card for every template", () => {
        renderGrid();
        expect(screen.getByText("Nextcloud")).toBeVisible();
        expect(screen.getByText("Vaultwarden")).toBeVisible();
    });

    it("search filters by name/description/category case-insensitively", async () => {
        const user = userEvent.setup();
        renderGrid();

        await user.type(screen.getByLabelText("Search templates"), "password");

        expect(screen.getByText("Vaultwarden")).toBeVisible();
        expect(screen.queryByText("Nextcloud")).not.toBeInTheDocument();
    });

    it("category select narrows the grid, with 'All categories' as the first option", async () => {
        const user = userEvent.setup();
        renderGrid();

        const select = screen.getByLabelText("Category");
        expect(select).toHaveDisplayValue("All categories");

        await user.selectOptions(select, "security");

        expect(screen.getByText("Vaultwarden")).toBeVisible();
        expect(screen.queryByText("Nextcloud")).not.toBeInTheDocument();
    });

    it("shows the no-match empty state with a link back to the blank Create Stack form", async () => {
        const user = userEvent.setup();
        renderGrid();

        await user.type(screen.getByLabelText("Search templates"), "nonexistent-xyz");

        expect(screen.getByText("No templates found")).toBeVisible();
        const link = screen.getByRole("link", {name: /start from a blank compose file/i});
        expect(link).toHaveAttribute("href", "/stacks/create");
    });
});
