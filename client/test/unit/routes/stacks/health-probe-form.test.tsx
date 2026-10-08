import {describe, expect, it, vi} from "vitest";
import {render, screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {HealthProbeForm} from "@/routes/app/stacks/components/health-probe-form";

const WEB_ONLY = "services:\n  web:\n    image: nginx # pinned\n";
const WEB_AND_DB = "services:\n  web:\n    image: nginx\n  db:\n    image: postgres\n";

function lastCall(onChange: ReturnType<typeof vi.fn>): string {
    const calls = onChange.mock.calls;
    return calls[calls.length - 1][0] as string;
}

describe("HealthProbeForm", () => {
    it("renders one switch per service, all off for a file without probes", () => {
        render(<HealthProbeForm composeContent={WEB_AND_DB} onChange={vi.fn()} />);

        expect(screen.getByRole("switch", {name: "Probe web over HTTP"})).not.toBeChecked();
        expect(screen.getByRole("switch", {name: "Probe db over HTTP"})).not.toBeChecked();
        expect(screen.queryByLabelText("Probe URL")).not.toBeInTheDocument();
    });

    it("reveals the URL and timeout fields when the switch is turned on, without writing yet", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<HealthProbeForm composeContent={WEB_ONLY} onChange={onChange} />);

        await user.click(screen.getByRole("switch", {name: "Probe web over HTTP"}));

        expect(screen.getByLabelText("Probe URL")).toBeVisible();
        expect(screen.getByLabelText("Timeout (seconds)")).toBeVisible();
        expect(screen.getByText("1 to 30. Defaults to 5.")).toBeVisible();
        expect(onChange).not.toHaveBeenCalled();
        // The empty URL is not an error until the user has touched the field.
        expect(screen.queryByText("Enter a valid http:// or https:// URL.")).not.toBeInTheDocument();
    });

    it("writes the probe block into the buffer once, after a valid URL is typed and the field blurred", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<HealthProbeForm composeContent={WEB_ONLY} onChange={onChange} />);

        await user.click(screen.getByRole("switch", {name: "Probe web over HTTP"}));
        await user.type(screen.getByLabelText("Probe URL"), "http://localhost:8080/health");
        expect(onChange).not.toHaveBeenCalled();
        await user.tab();

        expect(onChange).toHaveBeenCalledTimes(1);
        const next = lastCall(onChange);
        expect(next).toContain("health-probe");
        expect(next).toContain("http://localhost:8080/health");
        expect(next).toContain("# pinned");
    });

    it("writes the timeout as a number when one is entered", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<HealthProbeForm composeContent={WEB_ONLY} onChange={onChange} />);

        await user.click(screen.getByRole("switch", {name: "Probe web over HTTP"}));
        await user.type(screen.getByLabelText("Probe URL"), "http://localhost:8080/health");
        await user.tab();
        await user.type(screen.getByLabelText("Timeout (seconds)"), "12");
        await user.tab();

        expect(lastCall(onChange)).toMatch(/timeout: 12\b/);
    });

    it("seeds enabled rows from an existing probe", () => {
        const content =
            "services:\n  web:\n    x-docktor:\n      health-probe:\n        url: http://localhost:8080/health\n        timeout: 9\n";
        render(<HealthProbeForm composeContent={content} onChange={vi.fn()} />);

        expect(screen.getByRole("switch", {name: "Probe web over HTTP"})).toBeChecked();
        expect(screen.getByLabelText("Probe URL")).toHaveValue("http://localhost:8080/health");
        expect(screen.getByLabelText("Timeout (seconds)")).toHaveValue("9");
    });

    it("scopes fields to their own service row", async () => {
        const user = userEvent.setup();
        render(<HealthProbeForm composeContent={WEB_AND_DB} onChange={vi.fn()} />);

        await user.click(screen.getByRole("switch", {name: "Probe db over HTTP"}));

        const dbRow = screen.getByRole("listitem", {name: "db"});
        expect(within(dbRow).getByLabelText("Probe URL")).toBeVisible();
        expect(within(screen.getByRole("listitem", {name: "web"})).queryByLabelText("Probe URL")).toBeNull();
    });

    it("always shows the behavior note and the save hint", () => {
        render(<HealthProbeForm composeContent={WEB_ONLY} onChange={vi.fn()} />);

        expect(
            screen.getByText(
                "Probes run every 30 seconds from Docktor. A service is marked unhealthy after 3 failed checks in a row, with a 60-second grace period after each start. Any 2xx or 3xx response counts as healthy. When a probe is set, it replaces the service's Docker healthcheck for status.",
            ),
        ).toBeVisible();
        expect(
            screen.getByText(
                "Edits change the compose file above. Use Save on the Compose File section to review and apply them.",
            ),
        ).toBeVisible();
    });
});
