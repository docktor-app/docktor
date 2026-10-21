import {describe, expect, it} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MemoryRouter, useLocation} from "react-router";
import {TablePagination} from "@/components/common/data/table/table-pagination";

// jsdom has no ResizeObserver — Radix's Select positioning internals need one.
if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
}

function LocationProbe() {
    const {search} = useLocation();
    return <div data-testid="search">{search}</div>;
}

function renderPagination(props: Partial<React.ComponentProps<typeof TablePagination>> = {}) {
    return render(
        <MemoryRouter initialEntries={["/stacks?page=2"]}>
            <TablePagination
                currentPage={props.currentPage ?? 2}
                totalPages={props.totalPages ?? 3}
                pageSize={props.pageSize ?? 10}
                totalItems={props.totalItems ?? 25}
            />
            <LocationProbe />
        </MemoryRouter>,
    );
}

const BUTTON_NAMES = ["First page", "Previous page", "Next page", "Last page"];

describe("TablePagination", () => {
    it("names the four navigation buttons and gives each a 44px-below-md touch target", () => {
        renderPagination();

        for (const name of BUTTON_NAMES) {
            const button = screen.getByRole("button", {name});
            expect(button).toHaveClass("size-8", "max-md:size-11");
            expect(button).not.toHaveClass("h-8");
            expect(button).not.toHaveClass("w-8");
        }
    });

    it("makes the rows-per-page select 44px tall below md and wraps the footer", () => {
        const {container} = renderPagination();

        expect(screen.getByRole("combobox")).toHaveClass("h-8", "max-md:data-[size=default]:h-11");
        expect(container.firstElementChild).toHaveClass("flex-wrap");
    });

    it("navigates with the Next and First buttons", async () => {
        const user = userEvent.setup();
        renderPagination();

        await user.click(screen.getByRole("button", {name: "Next page"}));
        expect(screen.getByTestId("search")).toHaveTextContent("page=3");

        await user.click(screen.getByRole("button", {name: "First page"}));
        expect(screen.getByTestId("search")).toHaveTextContent("page=1");
    });

    it("disables First and Previous on the first page", () => {
        renderPagination({currentPage: 1});

        expect(screen.getByRole("button", {name: "First page"})).toBeDisabled();
        expect(screen.getByRole("button", {name: "Previous page"})).toBeDisabled();
        expect(screen.getByRole("button", {name: "Next page"})).toBeEnabled();
    });

    it("disables Next and Last on the last page", () => {
        renderPagination({currentPage: 3});

        expect(screen.getByRole("button", {name: "Next page"})).toBeDisabled();
        expect(screen.getByRole("button", {name: "Last page"})).toBeDisabled();
        expect(screen.getByRole("button", {name: "Previous page"})).toBeEnabled();
    });

    it("shows the item count with correct pluralisation", () => {
        const {unmount} = renderPagination({totalItems: 25});
        expect(screen.getByText("25 items")).toBeInTheDocument();
        unmount();

        renderPagination({totalItems: 1});
        expect(screen.getByText("1 item")).toBeInTheDocument();
    });
});
