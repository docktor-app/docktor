import {describe, expect, it} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {createMemoryRouter, Link, RouterProvider} from "react-router";
import {UnsavedChangesGuard} from "@/components/common/unsaved-changes-guard";

// useBlocker only works under a data router — every render in this file goes
// through createMemoryRouter + RouterProvider, never MemoryRouter/Routes.

interface HomeProps {
    readonly when: boolean;
    readonly isSameContext?: (pathname: string) => boolean;
}

function Home({when, isSameContext}: HomeProps) {
    return (
        <div>
            <UnsavedChangesGuard
                when={when}
                description="Your edits to the compose file haven't been saved."
                isSameContext={isSameContext}
            />
            <Link to="/other">Go elsewhere</Link>
            <Link to="/same-context">Go same context</Link>
        </div>
    );
}

function renderGuard(props: HomeProps) {
    const router = createMemoryRouter(
        [
            {path: "/", element: <Home {...props} />},
            {path: "/other", element: <div>Other page</div>},
            {path: "/same-context", element: <div>Same context page</div>},
        ],
        {initialEntries: ["/"]},
    );
    render(<RouterProvider router={router} />);
    return router;
}

describe("UnsavedChangesGuard", () => {
    it("opens the discard dialog when navigating away with when=true", async () => {
        const user = userEvent.setup();
        renderGuard({when: true});

        await user.click(screen.getByRole("link", {name: "Go elsewhere"}));

        expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
        expect(screen.getByText("Discard unsaved changes?")).toBeInTheDocument();
        expect(
            screen.getByText("Your edits to the compose file haven't been saved."),
        ).toBeInTheDocument();
    });

    it("'Keep editing' cancels the navigation and leaves the edits in place", async () => {
        const user = userEvent.setup();
        renderGuard({when: true});

        await user.click(screen.getByRole("link", {name: "Go elsewhere"}));
        await screen.findByRole("alertdialog");
        await user.click(screen.getByRole("button", {name: "Keep editing"}));

        expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
        expect(screen.queryByText("Other page")).not.toBeInTheDocument();
    });

    it("'Discard' completes the navigation", async () => {
        const user = userEvent.setup();
        renderGuard({when: true});

        await user.click(screen.getByRole("link", {name: "Go elsewhere"}));
        await screen.findByRole("alertdialog");
        await user.click(screen.getByRole("button", {name: "Discard"}));

        expect(await screen.findByText("Other page")).toBeInTheDocument();
        expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    it("does not block a navigation for which isSameContext returns true", async () => {
        const user = userEvent.setup();
        renderGuard({when: true, isSameContext: (pathname) => pathname === "/same-context"});

        await user.click(screen.getByRole("link", {name: "Go same context"}));

        expect(await screen.findByText("Same context page")).toBeInTheDocument();
        expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    it("never blocks navigation when when=false", async () => {
        const user = userEvent.setup();
        renderGuard({when: false});

        await user.click(screen.getByRole("link", {name: "Go elsewhere"}));

        expect(await screen.findByText("Other page")).toBeInTheDocument();
        expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
});

describe("UnsavedChangesGuard beforeunload", () => {
    function Standalone({when}: {readonly when: boolean}) {
        return <UnsavedChangesGuard when={when} description="desc" />;
    }

    function renderStandalone(when: boolean) {
        const router = createMemoryRouter([{path: "/", element: <Standalone when={when} />}], {
            initialEntries: ["/"],
        });
        render(<RouterProvider router={router} />);
    }

    it("prevents the default beforeunload behaviour when when=true", () => {
        renderStandalone(true);

        const event = new Event("beforeunload", {cancelable: true});
        window.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
    });

    it("does not prevent the default beforeunload behaviour when when=false", () => {
        renderStandalone(false);

        const event = new Event("beforeunload", {cancelable: true});
        window.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(false);
    });
});
