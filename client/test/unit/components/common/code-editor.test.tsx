import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import {THEME_STORAGE_KEY, ThemeProvider} from "@/components/common/theme-provider";
import {CodeEditor} from "@/components/common/code-editor";

function renderEditor(theme?: "light" | "dark") {
    if (theme) {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
    return render(
        <ThemeProvider>
            <CodeEditor value="services:\n  web:\n    image: nginx\n" onChange={vi.fn()} ariaLabel="Docker Compose File" />
        </ThemeProvider>,
    );
}

beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
});

describe("CodeEditor", () => {
    it("renders a textbox named by ariaLabel containing the initial value", () => {
        renderEditor();

        const textbox = screen.getByRole("textbox", {name: "Docker Compose File"});
        expect(textbox).toBeInTheDocument();
        expect(textbox.textContent).toContain("services:");
    });

    it("renders a different CodeMirror theme class under a dark resolved theme than under light", () => {
        const {container: darkContainer, unmount: unmountDark} = renderEditor("dark");
        const darkClassName = darkContainer.querySelector(".cm-editor")?.className;
        unmountDark();

        localStorage.clear();
        document.documentElement.classList.remove("dark");

        const {container: lightContainer} = renderEditor("light");
        const lightClassName = lightContainer.querySelector(".cm-editor")?.className;

        expect(darkClassName).toBeTruthy();
        expect(lightClassName).toBeTruthy();
        expect(darkClassName).not.toBe(lightClassName);
    });
});
