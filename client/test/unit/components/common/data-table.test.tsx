import type {ComponentProps, ReactNode} from "react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MemoryRouter} from "react-router";
import {StackList} from "@/components/domain/stack/stack-list";
import {
    DataTable,
    ExpandedRow,
    TableCell,
    TableRow,
    type DataTableLayout,
    type TableColumn,
} from "@/components/common/data/table";
import {nextSortDirection, sortRows} from "@/components/common/data/table/table-sort";

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

function firstCellTexts(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll("tbody tr")).map(
        (row) => row.querySelector("td")?.textContent ?? "",
    );
}

const sortableColumns: TableColumn<Item>[] = [
    {name: "Name", render: (item) => item.name, sortValue: (item) => item.name},
    {name: "Size", render: (item) => String(item.size), sortValue: (item) => item.size, align: "right"},
];

describe("DataTable uncontrolled sorting", () => {
    it("cycles ascending, descending, none with aria-sort on the header", async () => {
        const user = userEvent.setup();
        const reversed = [...items].reverse();
        const {container} = renderTable({data: reversed, columns: sortableColumns});
        const [nameHeader, sizeHeader] = screen.getAllByRole("columnheader");

        expect(firstCellTexts(container)).toEqual(["Beta", "Alpha"]);
        expect(nameHeader).toHaveAttribute("aria-sort", "none");
        expect(sizeHeader).toHaveAttribute("aria-sort", "none");

        await user.click(within(nameHeader).getByRole("button"));
        expect(firstCellTexts(container)).toEqual(["Alpha", "Beta"]);
        expect(nameHeader).toHaveAttribute("aria-sort", "ascending");

        await user.click(within(nameHeader).getByRole("button"));
        expect(firstCellTexts(container)).toEqual(["Beta", "Alpha"]);
        expect(nameHeader).toHaveAttribute("aria-sort", "descending");

        await user.click(within(nameHeader).getByRole("button"));
        expect(firstCellTexts(container)).toEqual(["Beta", "Alpha"]);
        expect(nameHeader).toHaveAttribute("aria-sort", "none");
    });

    it("right-aligns the header and cells of an aligned column", () => {
        const {container} = renderTable({columns: sortableColumns});

        expect(screen.getAllByRole("columnheader")[1].className).toContain("text-right");
        container.querySelectorAll("tbody tr").forEach((row) => {
            expect(row.querySelectorAll("td")[1].className).toContain("text-right");
        });
    });

    it("sorts the whole list before slicing the page", async () => {
        const user = userEvent.setup();
        const many: Item[] = Array.from({length: 12}, (_, i) => ({id: `i${String(i + 1)}`, name: `Item ${String(i + 1)}`, size: i + 1}));
        const {container} = renderTable({data: many, columns: sortableColumns});
        const sizeHeader = screen.getAllByRole("columnheader")[1];

        await user.click(within(sizeHeader).getByRole("button"));
        await user.click(within(sizeHeader).getByRole("button"));

        const rows = firstCellTexts(container);
        expect(rows).toHaveLength(10);
        expect(rows[0]).toBe("Item 12");
        expect(rows).not.toContain("Item 2");
    });
});

describe("DataTable controlled sorting", () => {
    it("shows the given direction and only reports toggles, keeping the input order", async () => {
        const user = userEvent.setup();
        const onToggle = vi.fn();
        const {container} = renderTable({
            columns: [
                {name: "Name", render: (item) => item.name},
                {name: "Size", render: (item) => String(item.size), sort: {direction: "desc", onToggle}},
            ],
        });
        const sizeHeader = screen.getAllByRole("columnheader")[1];

        expect(sizeHeader).toHaveAttribute("aria-sort", "descending");
        await user.click(within(sizeHeader).getByRole("button"));

        expect(onToggle).toHaveBeenCalledTimes(1);
        expect(firstCellTexts(container)).toEqual(["Alpha", "Beta"]);
    });
});

describe("DataTable column options", () => {
    it("applies className to cells and headerClassName to the header", () => {
        const {container} = renderTable({
            columns: [
                {name: "Name", render: (item) => item.name, className: "cell-x", headerClassName: "head-x"},
                {name: "Size", render: (item) => String(item.size)},
            ],
        });

        expect(screen.getAllByRole("columnheader")[0].className).toContain("head-x");
        container.querySelectorAll("tbody tr").forEach((row) => {
            expect(row.querySelectorAll("td")[0].className).toContain("cell-x");
            expect(row.querySelectorAll("td")[1].className).not.toContain("cell-x");
        });
    });

    it("keeps a hideHeader column as a column header with screen-reader-only text", () => {
        renderTable({
            columns: [
                {name: "Name", render: (item) => item.name},
                {name: "Actions", render: () => "go", hideHeader: true},
            ],
        });

        const headers = screen.getAllByRole("columnheader");
        expect(headers).toHaveLength(2);
        expect(within(headers[1]).getByText("Actions").className).toContain("sr-only");
    });
});

describe("table-sort helpers", () => {
    it("advances none, asc, desc, none", () => {
        expect(nextSortDirection("none")).toBe("asc");
        expect(nextSortDirection("asc")).toBe("desc");
        expect(nextSortDirection("desc")).toBe("none");
    });

    it("compares strings with localeCompare and numbers numerically", () => {
        expect(sortRows(["b", "a", "c"], (v) => v, "asc")).toEqual(["a", "b", "c"]);
        expect(sortRows([10, 9, 100], (v) => v, "asc")).toEqual([9, 10, 100]);
        expect(sortRows([10, 9, 100], (v) => v, "desc")).toEqual([100, 10, 9]);
    });

    it("keeps input order for ties and for none, without mutating the input", () => {
        const rows = [
            {id: 1, k: 1},
            {id: 2, k: 1},
            {id: 3, k: 0},
        ];
        expect(sortRows(rows, (r) => r.k, "asc").map((r) => r.id)).toEqual([3, 1, 2]);
        expect(sortRows(rows, (r) => r.k, "desc").map((r) => r.id)).toEqual([1, 2, 3]);
        expect(sortRows(rows, (r) => r.k, "none")).toEqual(rows);
        expect(rows.map((r) => r.id)).toEqual([1, 2, 3]);
    });
});

function renderDetailA(item: Item, layout: DataTableLayout): ReactNode {
    if (item.id !== "a") return null;
    return layout.mode === "table" ? (
        <ExpandedRow columnCount={layout.columnCount}>Detail A</ExpandedRow>
    ) : (
        "Detail A"
    );
}

function bodyRows(container: HTMLElement): HTMLTableRowElement[] {
    return Array.from(container.querySelectorAll<HTMLTableRowElement>("tbody tr"));
}

describe("DataTable expandable rows", () => {
    it("renders one full-width detail row directly after its item's row", () => {
        const {container} = renderTable({renderExpanded: renderDetailA});

        const rows = bodyRows(container);
        expect(rows).toHaveLength(3);
        expect(rows[0]).toHaveTextContent("Alpha");
        const cells = rows[1].querySelectorAll("td");
        expect(cells).toHaveLength(1);
        expect(cells[0]).toHaveAttribute("colspan", "2");
        expect(cells[0].className).toContain("bg-muted/50");
        expect(cells[0]).toHaveTextContent("Detail A");
        expect(rows[2]).toHaveTextContent("Beta");
    });

    it("renders several aligned rows after the item's row", () => {
        const {container} = renderTable({
            renderExpanded: (item) =>
                item.id === "a" ? (
                    <>
                        <TableRow className="bg-muted/50">
                            <TableCell>vol-1</TableCell>
                            <TableCell>1 GB</TableCell>
                        </TableRow>
                        <TableRow className="bg-muted/50">
                            <TableCell>vol-2</TableCell>
                            <TableCell>2 GB</TableCell>
                        </TableRow>
                    </>
                ) : null,
        });

        const rows = bodyRows(container);
        expect(rows.map((row) => row.querySelector("td")?.textContent)).toEqual([
            "Alpha",
            "vol-1",
            "vol-2",
            "Beta",
        ]);
        rows.slice(1, 3).forEach((row) => expect(row.querySelectorAll("td")).toHaveLength(2));
    });
});

describe("DataTable footer and pagination switch", () => {
    it("renders a tfoot row with one cell per column, honouring alignment", () => {
        const {container} = renderTable({columns: sortableColumns, footer: ["Total", "4"]});

        const footerCells = container.querySelectorAll("tfoot tr td");
        expect([...footerCells].map((cell) => cell.textContent)).toEqual(["Total", "4"]);
        expect(footerCells[1].className).toContain("text-right");
        expect(footerCells[0].className).not.toContain("text-right");
    });

    it("renders every row and no pager when pagination is off", () => {
        const many: Item[] = Array.from({length: 25}, (_, i) => ({id: `i${String(i)}`, name: `Item ${String(i)}`, size: i}));
        const {container} = renderTable({data: many, pagination: false});

        expect(bodyRows(container)).toHaveLength(25);
        expect(screen.queryByText("Rows per page")).not.toBeInTheDocument();
    });
});

describe("DataTable card layout below md (UI-SPEC A-02)", () => {
    const originalWidth = Object.getOwnPropertyDescriptor(window, "innerWidth");

    beforeEach(() => {
        Object.defineProperty(window, "innerWidth", {configurable: true, value: 500});
    });

    afterEach(() => {
        if (originalWidth) {
            Object.defineProperty(window, "innerWidth", originalWidth);
        }
    });

    function cards(container: HTMLElement): HTMLElement[] {
        return Array.from(container.querySelectorAll<HTMLElement>('[data-slot="card"]'));
    }

    it("renders one card per item with no table", async () => {
        const {container} = renderTable();

        await waitFor(() => expect(cards(container)).toHaveLength(2));
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    it("renders hideHeader columns without a label", async () => {
        const {container} = renderTable({
            columns: [
                {name: "Name", render: (item) => item.name},
                {name: "Actions", render: () => <button type="button">Open</button>, hideHeader: true},
            ],
        });

        await waitFor(() => expect(cards(container)).toHaveLength(2));
        expect(within(cards(container)[0]).getByRole("button", {name: "Open"})).toBeInTheDocument();
        expect(screen.queryByText("Actions")).not.toBeInTheDocument();
    });

    it("keeps sorting available through a Sort toolbar", async () => {
        const user = userEvent.setup();
        const {container} = renderTable({data: [...items].reverse(), columns: sortableColumns});

        const toolbar = await screen.findByRole("group", {name: "Sort"});
        await user.click(within(toolbar).getByRole("button", {name: "Name"}));

        expect(within(toolbar).getByRole("button", {name: "Name"})).toHaveAttribute("aria-pressed", "true");
        expect(cards(container).map((card) => card.textContent)).toEqual([
            expect.stringContaining("Alpha"),
            expect.stringContaining("Beta"),
        ]);
    });

    it("renders expanded content inside the item's card", async () => {
        const {container} = renderTable({renderExpanded: renderDetailA});

        await waitFor(() => expect(cards(container)).toHaveLength(2));
        expect(within(cards(container)[0]).getByText("Detail A")).toBeInTheDocument();
        expect(within(cards(container)[1]).queryByText("Detail A")).not.toBeInTheDocument();
    });

    it("renders the footer as a summary line below the cards", async () => {
        const {container} = renderTable({footer: ["Total", "4"]});

        await waitFor(() => expect(cards(container)).toHaveLength(2));
        const summary = screen.getByText("Total").parentElement;
        expect(summary).toHaveTextContent("Total4");
        const lastCard = cards(container)[1];
        expect(lastCard.compareDocumentPosition(summary as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
});
