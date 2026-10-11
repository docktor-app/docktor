import {describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MemoryRouter} from "react-router";
import {NavUser} from "@/components/nav-user";
import {SidebarProvider} from "@/components/ui/sidebar";

const {signOut} = vi.hoisted(() => ({signOut: vi.fn()}));

vi.mock("@/lib/auth-client", () => ({
    signOut,
    useSession: () => ({data: {user: {name: "Ada Lovelace", email: "ada@example.com"}}}),
}));

async function openMenu() {
    const user = userEvent.setup();
    render(
        <MemoryRouter>
            <SidebarProvider>
                <NavUser/>
            </SidebarProvider>
        </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", {name: /Ada Lovelace/}));
    return user;
}

describe("NavUser", () => {
    it("offers an Account entry linking to /account", async () => {
        await openMenu();

        const account = await screen.findByRole("menuitem", {name: "Account"});
        expect(account).toHaveAttribute("href", "/account");
    });

    it("lists Account above Sign out", async () => {
        await openMenu();

        const items = await screen.findAllByRole("menuitem");
        expect(items.map((item) => item.textContent)).toEqual(["Account", "Sign out"]);
    });

    it("still signs out", async () => {
        const user = await openMenu();

        await user.click(await screen.findByRole("menuitem", {name: "Sign out"}));

        expect(signOut).toHaveBeenCalledTimes(1);
    });
});
