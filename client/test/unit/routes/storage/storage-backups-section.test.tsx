import {describe, expect, it} from "vitest";
import {render, screen} from "@testing-library/react";
import {StorageBackupsSection} from "../../../../src/routes/app/storage/components/storage-backups-section";
import type {StorageBackup} from "@/lib/storage-api";

const backups: StorageBackup[] = [
    {stackId: "small", displayName: "Small", sizeBytes: 1024},
    {stackId: "big", displayName: "Big", sizeBytes: 3072},
];

describe("StorageBackupsSection", () => {
    it("renders the title and description", () => {
        render(<StorageBackupsSection backups={backups} loading={false}/>);
        expect(screen.getByRole("heading", {name: "Backups"})).toBeInTheDocument();
        expect(
            screen.getByText(
                "Local restic repositories stored inside each stack folder. Remote repositories (SFTP, S3) use no local disk.",
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

    it("offers no sort controls", () => {
        render(<StorageBackupsSection backups={backups} loading={false}/>);
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("renders the empty state without a subtotal row", () => {
        render(<StorageBackupsSection backups={[]} loading={false}/>);
        expect(screen.getByText("No local backups")).toBeInTheDocument();
        expect(screen.getByText("Stacks without a local backup repository don't appear here.")).toBeInTheDocument();
        expect(screen.queryByText("Backups subtotal")).not.toBeInTheDocument();
    });

    it("renders skeleton rows while loading", () => {
        const {container} = render(<StorageBackupsSection backups={[]} loading/>);
        expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
        expect(screen.queryByText("No local backups")).not.toBeInTheDocument();
    });
});
