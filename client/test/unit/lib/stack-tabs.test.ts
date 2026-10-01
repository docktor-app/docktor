import {describe, expect, it} from "vitest";
import {
    isStackTabPath,
    LEGACY_STACK_TAB_ALIASES,
    resolveStackTab,
    STACK_TAB_LABELS,
    STACK_TABS,
} from "@/lib/stack-tabs";

describe("stack-tabs", () => {
    it("defines the exact tab order (D-01/D-02)", () => {
        expect(STACK_TABS).toEqual(["overview", "config", "logs", "backups", "proxy"]);
    });

    it("labels every tab", () => {
        for (const tab of STACK_TABS) {
            expect(STACK_TAB_LABELS[tab]).toBeTruthy();
        }
        expect(STACK_TAB_LABELS.config).toBe("Config");
    });

    it("maps legacy compose/environment aliases to config", () => {
        expect(LEGACY_STACK_TAB_ALIASES).toEqual({compose: "config", environment: "config"});
    });

    describe("resolveStackTab", () => {
        it("resolves undefined to the overview tab", () => {
            expect(resolveStackTab(undefined)).toEqual({kind: "tab", tab: "overview"});
        });

        it("resolves an unknown tab to the overview tab", () => {
            expect(resolveStackTab("bogus")).toEqual({kind: "tab", tab: "overview"});
        });

        it("resolves a valid tab to itself", () => {
            expect(resolveStackTab("config")).toEqual({kind: "tab", tab: "config"});
            expect(resolveStackTab("logs")).toEqual({kind: "tab", tab: "logs"});
        });

        it("resolves the legacy compose alias to a config redirect", () => {
            expect(resolveStackTab("compose")).toEqual({kind: "redirect", tab: "config"});
        });

        it("resolves the legacy environment alias to a config redirect", () => {
            expect(resolveStackTab("environment")).toEqual({kind: "redirect", tab: "config"});
        });
    });

    describe("isStackTabPath (11-10 unsaved-changes guard)", () => {
        it("matches the stack's own base path", () => {
            expect(isStackTabPath("my-app", "/stacks/my-app")).toBe(true);
        });

        it("matches a tab path for the same stack", () => {
            expect(isStackTabPath("my-app", "/stacks/my-app/config")).toBe(true);
        });

        it("matches a legacy tab alias for the same stack", () => {
            expect(isStackTabPath("my-app", "/stacks/my-app/compose")).toBe(true);
        });

        it("does not match a different page nested under the same stack (backup detail)", () => {
            expect(isStackTabPath("my-app", "/stacks/my-app/backups/b1")).toBe(false);
        });

        it("does not match the same tab path for a different stack", () => {
            expect(isStackTabPath("my-app", "/stacks/other/config")).toBe(false);
        });

        it("does not match an unrelated route", () => {
            expect(isStackTabPath("my-app", "/")).toBe(false);
        });
    });
});
