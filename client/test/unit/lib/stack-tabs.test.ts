import {describe, expect, it} from "vitest";
import {
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
});
