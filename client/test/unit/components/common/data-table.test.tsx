import type {ComponentProps} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import {MemoryRouter} from "react-router";
import {StackList} from "@/components/domain/stack/stack-list";
import {DataTable, type TableColumn} from "@/components/common/data/table";

// jsdom does not implement matchMedia; useIsMobile (via TableContent) needs it.
beforeEach(() => {
    if (typeof window.matchMedia !== "function") {
        window.matchMedia = vi.fn().mockImplementation((query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));
    }
});

interface Item {
    id: string;
    name: string;
    size: number;
}

const items: Item[] = [
    {id: "a", name: "Alpha", size: 3},
    {id: "b", name: "Beta", size: 1},
];

const columns: TableColumn<Item>[] = [
    {name: "Name", render: (item) => item.name},
    {name: "Size", render: (item) => String(item.size)},
];

function renderTable(props: Partial<ComponentProps<typeof DataTable<Item>>> = {}): ReturnType<typeof render> {
    return render(
        <MemoryRouter>
            <DataTable<Item>
                data={items}
                columns={columns}
                getRowKey={(item) => item.id}
                emptyMessage="Nothing here"
                {...props}
            />
        </MemoryRouter>,
    );
}

function tokens(element: Element | null): string[] {
    return (element?.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
}

describe("DataTable frame (UI-08)", () => {
    it("renders the table inside exactly one bordered, rounded frame", () => {
        const {container} = renderTable();

        const frames = container.querySelectorAll('[data-slot="table-frame"]');
        expect(frames).toHaveLength(1);
        expect(tokens(frames[0])).toEqual(expect.arrayContaining(["overflow-hidden", "rounded-md", "border"]));
        expect(frames[0].contains(screen.getByRole("table"))).toBe(true);
    });

    it("tints the thead, not the header row, and gives body rows a subtle hover", () => {
        const {container} = renderTable({itemRoute: (item) => `/items/${item.id}`});

        expect(tokens(container.querySelector("thead"))).toContain("bg-muted/50");
        expect(tokens(container.querySelector("thead tr"))).not.toContain("bg-muted/50");
        const bodyRows = container.querySelectorAll("tbody tr");
        expect(bodyRows).toHaveLength(2);
        bodyRows.forEach((row) => {
            expect(tokens(row)).toEqual(expect.arrayContaining(["hover:bg-muted/30", "cursor-pointer"]));
        });
    });

    it("does not make body rows clickable without an itemRoute", () => {
        const {container} = renderTable();

        container.querySelectorAll("tbody tr").forEach((row) => {
            expect(tokens(row)).not.toContain("cursor-pointer");
        });
    });
});

describe("DataTable empty and loading states", () => {
    it("renders the message and the description without a table or frame", () => {
        const {container} = renderTable({data: [], emptyDescription: "Add the first item."});

        expect(screen.getByText("Nothing here")).toBeInTheDocument();
        expect(screen.getByText("Add the first item.")).toBeInTheDocument();
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
        expect(container.querySelector('[data-slot="table-frame"]')).toBeNull();
    });

    it("renders a single paragraph when no description is given and never the legacy fallback", () => {
        const {container} = renderTable({data: []});

        expect(container.querySelectorAll("p")).toHaveLength(1);
        expect(screen.queryByText("No data")).not.toBeInTheDocument();
    });

    it("renders three skeleton rows and no frame while loading", () => {
        const {container} = renderTable({loading: true});

        expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
        expect(container.querySelector('[data-slot="table-frame"]')).toBeNull();
    });
});

describe("StackList empty copy", () => {
    it("explains how to get started when there are no stacks", () => {
        render(
            <MemoryRouter>
                <StackList stacks={[]} loading={false} />
            </MemoryRouter>,
        );

        expect(screen.getByText("No stacks yet")).toBeInTheDocument();
        expect(
            screen.getByText("Create a stack or import an existing one to get started."),
        ).toBeInTheDocument();
    });
});
