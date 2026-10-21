import {describe, expect, it} from "vitest";
import {render as rtlRender, screen} from "@testing-library/react";
import type {ReactElement} from "react";
import {MemoryRouter} from "react-router";
import {StorageBackupsSection} from "../../../../src/routes/app/storage/components/storage-backups-section";
import type {StorageBackup} from "@/lib/storage-api";

const backups: StorageBackup[] = [
    {stackId: "small", displayName: "Small", sizeBytes: 1024},
    {stackId: "big", displayName: "Big", sizeBytes: 3072},
];

function render(ui: ReactElement) {
    return rtlRender(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("StorageBackupsSection", () => {
    it("renders the title and description", () => {
        render(<StorageBackupsSection backups={backups} loading={false}/>);
        expect(screen.getByRole("heading", {name: "Backups"})).toBeInTheDocument();
        expect(
            screen.getByText(
                "Local restic repositories stored inside each stack folder.",
            ),
        ).toBeInTheDocument();
    });

    it("lists the largest repository first and sums them in the footer", () => {
        render(<StorageBackupsSection backups={backups} loading={false}/>);

        const bodyRows = screen.getAllByRole("row").slice(1, 3);
        expect(bodyRows[0]).toHaveTextContent("Big");
        expect(bodyRows[1]).toHaveTextContent("Small");

        const footer = screen.getByText("Backups subtotal").closest("tr") as HTMLElement;
        expect(footer).toHaveTextContent("4.0 KB");
    });

    it("renders the table in the shared frame with the subtotal in the table footer", () => {
        const {container} = render(<StorageBackupsSection backups={backups} loading={false}/>);

        expect(container.querySelector('[data-slot="table-frame"] table')).not.toBeNull();
        const footerRow = container.querySelector("tfoot tr") as HTMLElement;
        expect(footerRow).toHaveTextContent("Backups subtotal");
        expect(footerRow).toHaveTextContent("4.0 KB");
        const sumCell = screen.getByText("4.0 KB", {selector: "tfoot td"});
        expect(sumCell.classList.contains("text-right")).toBe(true);
    });

    it("offers no sort controls", () => {
        render(<StorageBackupsSection backups={backups} loading={false}/>);
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("renders the empty state without a subtotal row", () => {
        render(<StorageBackupsSection backups={[]} loading={false}/>);
        expect(screen.getByText("No local backups")).toBeInTheDocument();
        expect(screen.getByText("Stacks without a local backup repository don't appear here.")).toBeInTheDocument();
        expect(screen.queryByText("Backups subtotal")).not.toBeInTheDocument();
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    it("renders skeleton rows while loading", () => {
        const {container} = render(<StorageBackupsSection backups={[]} loading/>);
        expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
        expect(screen.queryByText("No local backups")).not.toBeInTheDocument();
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });
});
