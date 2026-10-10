import {describe, expect, it} from "vitest";
import {render, screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MemoryRouter} from "react-router";
import {StorageStacksTable} from "../../../../src/routes/app/storage/components/storage-stacks-table";
import type {StorageStack} from "@/lib/storage-api";

// jsdom has no ResizeObserver; Radix's Tooltip (the expander's label) requires
// one once it opens.
if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
}

const MEASURED_AT = "2026-10-08T03:00:00Z";

function makeStack(
    stackId: string,
    volumeSizeBytes: number | null,
    volumes: StorageStack["volumes"] = [],
): StorageStack {
    return {
        stackId,
        displayName: stackId,
        volumeSizeBytes,
        measuredAt: volumeSizeBytes === null ? null : MEASURED_AT,
        volumes,
    };
}

const stacks: StorageStack[] = [
    makeStack("alpha", 2048, [
        {name: "data", sizeBytes: 1024},
        {name: "cache", sizeBytes: 1024},
    ]),
    makeStack("bravo", 4096, [{name: "db", sizeBytes: 4096}]),
    makeStack("empty", 0),
    makeStack("ghost", null),
];

function renderTable(props: Partial<React.ComponentProps<typeof StorageStacksTable>> = {}) {
    return render(
        <MemoryRouter>
            <StorageStacksTable stacks={stacks} measuredAt={MEASURED_AT} loading={false} {...props} />
        </MemoryRouter>,
    );
}

function stackOrder(): string[] {
    return screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).queryByRole("link")?.textContent ?? "")
        .filter(Boolean);
}

describe("StorageStacksTable sorting", () => {
    it("defaults to size descending with the unmeasured stack last", () => {
        renderTable();
        expect(stackOrder()).toEqual(["bravo", "alpha", "empty", "ghost"]);
        expect(screen.getByRole("columnheader", {name: /size/i})).toHaveAttribute("aria-sort", "descending");
        expect(screen.getByRole("columnheader", {name: /stack/i})).toHaveAttribute("aria-sort", "none");
    });

    it("sorts by name ascending on the first Stack click and reverses on the second", async () => {
        const user = userEvent.setup();
        renderTable();

        await user.click(screen.getByRole("button", {name: "Stack"}));
        expect(stackOrder()).toEqual(["alpha", "bravo", "empty", "ghost"]);
        expect(screen.getByRole("columnheader", {name: /stack/i})).toHaveAttribute("aria-sort", "ascending");
        expect(screen.getByRole("columnheader", {name: /size/i})).toHaveAttribute("aria-sort", "none");

        await user.click(screen.getByRole("button", {name: "Stack"}));
        expect(stackOrder()).toEqual(["empty", "bravo", "alpha", "ghost"]);
        expect(screen.getByRole("columnheader", {name: /stack/i})).toHaveAttribute("aria-sort", "descending");
    });

    it("keeps the unmeasured stack last when Size is toggled to ascending", async () => {
        const user = userEvent.setup();
        renderTable();

        await user.click(screen.getByRole("button", {name: "Size"}));
        expect(stackOrder()).toEqual(["empty", "alpha", "bravo", "ghost"]);
    });
});

describe("StorageStacksTable volume expansion", () => {
    it("reveals one row per volume, sorted like the parent, and renames the button", async () => {
        const user = userEvent.setup();
        renderTable();

        const show = screen.getByRole("button", {name: "Show volumes for alpha"});
        expect(show).toHaveAttribute("aria-expanded", "false");
        expect(screen.queryByText("data")).not.toBeInTheDocument();

        await user.click(show);

        const hide = screen.getByRole("button", {name: "Hide volumes for alpha"});
        expect(hide).toHaveAttribute("aria-expanded", "true");
        const controlled = hide.getAttribute("aria-controls");
        expect(controlled).toBeTruthy();
        expect(document.getElementById(controlled as string)).toBeInTheDocument();
        // Equal sizes tie-break by name ascending: cache, then data.
        const volumeRows = screen.getAllByRole("row").filter((row) => row.classList.contains("bg-muted/50"));
        expect(volumeRows.map((row) => row.textContent)).toEqual(["cache1.0 KB", "data1.0 KB"]);
    });

    it("lets several stacks stay open at once", async () => {
        const user = userEvent.setup();
        renderTable();

        await user.click(screen.getByRole("button", {name: "Show volumes for alpha"}));
        await user.click(screen.getByRole("button", {name: "Show volumes for bravo"}));

        expect(screen.getByText("data")).toBeInTheDocument();
        expect(screen.getByText("db")).toBeInTheDocument();
    });

    it("collapses an open stack again", async () => {
        const user = userEvent.setup();
        renderTable();

        await user.click(screen.getByRole("button", {name: "Show volumes for bravo"}));
        await user.click(screen.getByRole("button", {name: "Hide volumes for bravo"}));

        expect(screen.queryByText("db")).not.toBeInTheDocument();
    });

    it("has no expander for a measured stack without volumes and explains why", () => {
        renderTable();
        expect(screen.queryByRole("button", {name: /volumes for empty/})).not.toBeInTheDocument();
        expect(screen.getByText("No volumes found in this stack's volumes folder.")).toBeInTheDocument();
    });

    it("shows the volume count hint with singular and plural wording", () => {
        renderTable();
        expect(screen.getByText("1 volume")).toBeInTheDocument();
        expect(screen.getByText("2 volumes")).toBeInTheDocument();
    });

    it("marks an unmeasured stack with a dash and Not measured", () => {
        renderTable();
        const row = screen.getByRole("link", {name: "ghost"}).closest("tr") as HTMLElement;
        expect(within(row).getByText("Not measured")).toBeInTheDocument();
        expect(within(row).getByText("—")).toBeInTheDocument();
        expect(within(row).queryByRole("button")).not.toBeInTheDocument();
    });

    it("links each stack name to its detail page and titles long names", () => {
        renderTable();
        const link = screen.getByRole("link", {name: "alpha"});
        expect(link).toHaveAttribute("href", "/stacks/alpha");
        expect(link).toHaveAttribute("title", "alpha");
    });
});

describe("StorageStacksTable states", () => {
    it("shows skeleton rows and no table while loading", () => {
        const {container} = renderTable({loading: true});
        expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    it("explains an empty install", () => {
        renderTable({stacks: [], measuredAt: null});
        expect(screen.getByText("No stacks to measure")).toBeInTheDocument();
        expect(
            screen.getByText("Create or import a stack and its disk usage will appear here after the next measurement."),
        ).toBeInTheDocument();
    });

    it("explains that nothing has been measured yet", () => {
        renderTable({measuredAt: null});
        expect(screen.getByText("Disk usage hasn't been measured yet")).toBeInTheDocument();
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });
});
