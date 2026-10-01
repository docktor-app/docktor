import {beforeEach, describe, expect, it} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {THEME_STORAGE_KEY, ThemeProvider} from "@/components/common/theme-provider";
import {ThemeToggle} from "@/components/common/theme-toggle";

// jsdom has no ResizeObserver — Radix's DropdownMenu.Content positioning
// internals require one (same pattern as stack-actions.test.tsx).
if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
}

function renderToggle() {
    return render(
        <ThemeProvider>
            <ThemeToggle />
        </ThemeProvider>,
    );
}

beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
});

async function openMenu() {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", {name: "Toggle theme"}));
    return user;
}

describe("ThemeToggle", () => {
    it("renders a 'Toggle theme' button that opens Light/Dark/System options", async () => {
        renderToggle();

        await openMenu();

        expect(screen.getByRole("menuitemcheckbox", {name: "Light"})).toBeInTheDocument();
        expect(screen.getByRole("menuitemcheckbox", {name: "Dark"})).toBeInTheDocument();
        expect(screen.getByRole("menuitemcheckbox", {name: "System"})).toBeInTheDocument();
    });

    it("choosing Dark adds the dark class and stores 'dark' under the theme storage key", async () => {
        renderToggle();
        const user = await openMenu();

        await user.click(screen.getByRole("menuitemcheckbox", {name: "Dark"}));

        expect(document.documentElement.classList.contains("dark")).toBe(true);
        expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    });

    it("choosing Light removes the dark class and stores 'light'", async () => {
        renderToggle();
        let user = await openMenu();
        await user.click(screen.getByRole("menuitemcheckbox", {name: "Dark"}));

        user = await openMenu();
        await user.click(screen.getByRole("menuitemcheckbox", {name: "Light"}));

        expect(document.documentElement.classList.contains("dark")).toBe(false);
        expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    });

    it("choosing System stores 'system'", async () => {
        renderToggle();
        const user = await openMenu();

        await user.click(screen.getByRole("menuitemcheckbox", {name: "System"}));

        expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
    });

    it("marks System as the selected option by default", async () => {
        renderToggle();

        await openMenu();

        expect(screen.getByRole("menuitemcheckbox", {name: "System"})).toBeChecked();
        expect(screen.getByRole("menuitemcheckbox", {name: "Light"})).not.toBeChecked();
        expect(screen.getByRole("menuitemcheckbox", {name: "Dark"})).not.toBeChecked();
    });

    it("moves the selected mark to the chosen theme", async () => {
        renderToggle();
        const user = await openMenu();
        await user.click(screen.getByRole("menuitemcheckbox", {name: "Dark"}));

        await openMenu();

        expect(screen.getByRole("menuitemcheckbox", {name: "Dark"})).toBeChecked();
        expect(screen.getByRole("menuitemcheckbox", {name: "System"})).not.toBeChecked();
    });
});
