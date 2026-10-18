import {isValidElement} from "react";
import type {ReactElement} from "react";
import {describe, expect, it, vi} from "vitest";
import {matchRoutes} from "react-router";
import {router} from "@/router";
import {AppLayout} from "@/components/app-layout";
import {ProtectedRoute} from "@/components/domain/auth/protected-route";
import TemplateBrowsePage from "@/routes/app/stacks/templates";

vi.mock("@/lib/auth-client", () => ({
    signOut: vi.fn(),
    useSession: () => ({data: {user: {name: "Ada Lovelace", email: "ada@example.com"}}}),
}));

function matchesFor(path: string) {
    const matches = matchRoutes(router.routes, path);
    expect(matches).not.toBeNull();
    return matches ?? [];
}

function elementOf(route: {element?: unknown}): ReactElement {
    expect(isValidElement(route.element)).toBe(true);
    return route.element as ReactElement; // narrowed by the isValidElement assertion above
}

describe("router (UI-07)", () => {
    it("serves /templates with TemplateBrowsePage inside ProtectedRoute > AppLayout", () => {
        const matches = matchesFor("/templates");

        const leaf = matches[matches.length - 1];
        const layout = matches[0];
        if (!leaf || !layout) throw new Error("expected a layout match and a leaf match");

        expect(elementOf(leaf.route).type).toBe(TemplateBrowsePage);

        const layoutElement = elementOf(layout.route);
        expect(layoutElement.type).toBe(ProtectedRoute);
        const children = (layoutElement.props as {children?: unknown}).children;
        expect(isValidElement(children)).toBe(true);
        expect((children as ReactElement).type).toBe(AppLayout); // narrowed by the assertion above
    });

    it("keeps /stacks/create/templates serving TemplateBrowsePage", () => {
        const matches = matchesFor("/stacks/create/templates");

        const leaf = matches[matches.length - 1];
        if (!leaf) throw new Error("expected a leaf match");

        expect(elementOf(leaf.route).type).toBe(TemplateBrowsePage);
    });
});
