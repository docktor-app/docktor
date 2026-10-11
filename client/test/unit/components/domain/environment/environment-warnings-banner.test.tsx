import {describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {EnvironmentWarning} from "@docktor/shared";
import {EnvironmentWarningsBanner} from "@/components/domain/environment/environment-warnings-banner";

const secretWarning: EnvironmentWarning = {
    code: "TEMPLATE_SECRET_IN_PRODUCTION",
    variable: "BETTER_AUTH_SECRET",
    message: "BETTER_AUTH_SECRET still holds the template value.",
};
const proxyWarning: EnvironmentWarning = {
    code: "TRUST_PROXY_UNSET_BEHIND_HTTPS",
    variable: "TRUST_PROXY",
    message: "TRUST_PROXY is not set.",
};
const DOCS_HREF = "https://docs.example.com/reference/deployment#startup-checks";

function renderBanner(
    warnings: readonly EnvironmentWarning[],
    handlers: {onDismiss?: (w: EnvironmentWarning) => void; onDismissAll?: () => void} = {},
) {
    return render(
        <EnvironmentWarningsBanner
            warnings={warnings}
            onDismiss={handlers.onDismiss ?? vi.fn()}
            onDismissAll={handlers.onDismissAll ?? vi.fn()}
            docsHref={DOCS_HREF}
        />,
    );
}

describe("EnvironmentWarningsBanner (#7, D-13)", () => {
    it("renders nothing for an empty list", () => {
        const {container} = renderBanner([]);

        expect(container).toBeEmptyDOMElement();
    });

    it("shows the heading, the count, each variable and each message", () => {
        renderBanner([secretWarning, proxyWarning]);

        expect(screen.getByText("Configuration warnings")).toBeInTheDocument();
        expect(screen.getByText("2")).toBeInTheDocument();
        expect(screen.getByText("BETTER_AUTH_SECRET")).toBeInTheDocument();
        expect(screen.getByText(secretWarning.message)).toBeInTheDocument();
        expect(screen.getByText("TRUST_PROXY")).toBeInTheDocument();
        expect(screen.getByText(proxyWarning.message)).toBeInTheDocument();
    });

    it("offers one dismiss button per warning plus Dismiss all", () => {
        renderBanner([secretWarning, proxyWarning]);

        expect(screen.getByRole("button", {name: "Dismiss warning about BETTER_AUTH_SECRET"})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Dismiss warning about TRUST_PROXY"})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Dismiss all"})).toBeInTheDocument();
    });

    it("omits Dismiss all for a single warning", () => {
        renderBanner([secretWarning]);

        expect(screen.queryByRole("button", {name: "Dismiss all"})).not.toBeInTheDocument();
    });

    it("links to the docs in a new tab without opener access", () => {
        renderBanner([secretWarning]);

        const link = screen.getByRole("link", {name: "How to fix these"});
        expect(link).toHaveAttribute("href", DOCS_HREF);
        expect(link).toHaveAttribute("target", "_blank");
        expect(link.getAttribute("rel")).toContain("noreferrer");
        expect(link.getAttribute("rel")).toContain("noopener");
    });

    it("calls onDismiss with the warning whose button was clicked", async () => {
        const onDismiss = vi.fn();
        renderBanner([secretWarning, proxyWarning], {onDismiss});

        await userEvent.click(screen.getByRole("button", {name: "Dismiss warning about TRUST_PROXY"}));

        expect(onDismiss).toHaveBeenCalledTimes(1);
        expect(onDismiss).toHaveBeenCalledWith(proxyWarning);
    });

    it("calls onDismissAll from Dismiss all", async () => {
        const onDismissAll = vi.fn();
        renderBanner([secretWarning, proxyWarning], {onDismissAll});

        await userEvent.click(screen.getByRole("button", {name: "Dismiss all"}));

        expect(onDismissAll).toHaveBeenCalledTimes(1);
    });

    it("renders markup in a message as literal text (T-16-10)", () => {
        const hostile: EnvironmentWarning = {...secretWarning, message: "<b>x</b>"};
        const {container} = renderBanner([hostile]);

        expect(screen.getByText("<b>x</b>")).toBeInTheDocument();
        expect(container.querySelector("b")).toBeNull();
    });
});
