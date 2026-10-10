import {useState} from "react";
import {describe, expect, it, vi} from "vitest";
import {render, screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {HealthProbeForm} from "@/routes/app/stacks/components/health-probe-form";

const WEB_ONLY = "services:\n  web:\n    image: nginx # pinned\n";
const WEB_AND_DB = "services:\n  web:\n    image: nginx\n  db:\n    image: postgres\n";
const PROBED_WEB =
    "services:\n  web:\n    image: nginx\n    x-docktor:\n      health-probe:\n        url: http://localhost:8080/health\n";

function lastCall(onChange: ReturnType<typeof vi.fn>): string {
    const calls = onChange.mock.calls;
    return calls[calls.length - 1][0] as string;
}

function occurrences(haystack: string, needle: string): number {
    return haystack.split(needle).length - 1;
}

interface HarnessProps {
    readonly initial: string;
    readonly externalEdit?: string;
    readonly onEmit?: (next: string) => void;
}

/**
 * Feeds the form's own onChange output back in as composeContent, as the real
 * Config tab does, so a self-write round-trips through the parent. The
 * "Edit externally" button stands in for a code-editor edit.
 */
function Harness({initial, externalEdit = "", onEmit}: HarnessProps) {
    const [content, setContent] = useState(initial);
    return (
        <>
            <HealthProbeForm
                composeContent={content}
                onChange={(next) => {
                    onEmit?.(next);
                    setContent(next);
                }}
            />
            <button type="button" onClick={() => setContent(externalEdit)}>
                Edit externally
            </button>
            <output data-testid="buffer">{content}</output>
        </>
    );
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

describe("HealthProbeForm — edge states", () => {
    it("replaces the form with the YAML-error Alert and never writes while the buffer does not parse", () => {
        const onChange = vi.fn();
        render(<HealthProbeForm composeContent="services: [unclosed" onChange={onChange} />);

        expect(screen.getByRole("alert")).toHaveTextContent("Fix the compose file's YAML errors to edit probes here.");
        expect(screen.queryByRole("switch")).not.toBeInTheDocument();
        expect(onChange).not.toHaveBeenCalled();
        // The behavior note stays visible so the section still explains itself.
        expect(screen.getByText(/Probes run every 30 seconds from Docktor\./)).toBeVisible();
    });

    it("shows the no-services message and no rows for a compose file without services", () => {
        render(<HealthProbeForm composeContent={"services: {}\n"} onChange={vi.fn()} />);

        expect(screen.getByText("Add a service to the compose file to configure a probe.")).toBeVisible();
        expect(screen.queryByRole("switch")).not.toBeInTheDocument();
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("restores the form with the previous values once a YAML error is fixed externally", async () => {
        const user = userEvent.setup();
        render(<Harness initial="services: [unclosed" externalEdit={PROBED_WEB} />);
        expect(screen.getByRole("alert")).toBeVisible();

        await user.click(screen.getByRole("button", {name: "Edit externally"}));

        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(screen.getByRole("switch", {name: "Probe web over HTTP"})).toBeChecked();
        expect(screen.getByLabelText("Probe URL")).toHaveValue("http://localhost:8080/health");
    });

    it("shows the host error inline after blur and does not write an invalid URL", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<HealthProbeForm composeContent={WEB_ONLY} onChange={onChange} />);

        await user.click(screen.getByRole("switch", {name: "Probe web over HTTP"}));
        await user.type(screen.getByLabelText("Probe URL"), "http://example.com/");
        expect(screen.queryByText(/Docktor sends the request to this service's container/)).not.toBeInTheDocument();
        await user.tab();

        expect(
            await screen.findByText(
                "The host must be localhost, 127.0.0.1, or [::1]. Docktor sends the request to this service's container.",
            ),
        ).toBeVisible();
        expect(onChange).not.toHaveBeenCalled();
    });

    it("shows the userinfo and timeout errors inline and writes neither", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<HealthProbeForm composeContent={WEB_ONLY} onChange={onChange} />);

        await user.click(screen.getByRole("switch", {name: "Probe web over HTTP"}));
        await user.type(screen.getByLabelText("Probe URL"), "http://user:pw@localhost/");
        await user.tab();
        expect(await screen.findByText("Remove the username and password from the URL.")).toBeVisible();

        expect(onChange).not.toHaveBeenCalled();

        // Once the URL is valid it is written, but an out-of-range timeout is not.
        await user.clear(screen.getByLabelText("Probe URL"));
        await user.type(screen.getByLabelText("Probe URL"), "http://localhost/");
        await user.type(screen.getByLabelText("Timeout (seconds)"), "45");
        await user.tab();
        expect(await screen.findByText("Enter a whole number from 1 to 30.")).toBeVisible();

        const written = onChange.mock.calls.map((call) => call[0] as string);
        expect(written.every((buffer) => !buffer.includes("pw@"))).toBe(true);
        expect(written.every((buffer) => !/timeout: 45/.test(buffer))).toBe(true);
    });

    it("does not write when a valid probe is blurred without any change", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<HealthProbeForm composeContent={PROBED_WEB} onChange={onChange} />);

        await user.click(screen.getByLabelText("Probe URL"));
        await user.tab();

        expect(onChange).not.toHaveBeenCalled();
    });
});

describe("HealthProbeForm — switch off", () => {
    it("removes the probe and the x-docktor key it leaves empty", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<HealthProbeForm composeContent={PROBED_WEB} onChange={onChange} />);

        await user.click(screen.getByRole("switch", {name: "Probe web over HTTP"}));

        expect(onChange).toHaveBeenCalledTimes(1);
        const next = lastCall(onChange);
        expect(next).not.toContain("x-docktor");
        expect(next).not.toContain("health-probe");
        expect(next).toContain("image: nginx");
        expect(screen.queryByLabelText("Probe URL")).not.toBeInTheDocument();
    });

    it("keeps other x-docktor keys when the probe is switched off", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        const content =
            "services:\n  web:\n    x-docktor:\n      other: keep-me\n      health-probe:\n        url: http://localhost/\n";
        render(<HealthProbeForm composeContent={content} onChange={onChange} />);

        await user.click(screen.getByRole("switch", {name: "Probe web over HTTP"}));

        const next = lastCall(onChange);
        expect(next).toContain("x-docktor");
        expect(next).toContain("other: keep-me");
        expect(next).not.toContain("health-probe");
    });

    it("re-applies the URL kept in the row when the switch is turned back on", async () => {
        const user = userEvent.setup();
        render(<Harness initial={PROBED_WEB} />);

        await user.click(screen.getByRole("switch", {name: "Probe web over HTTP"}));
        expect(screen.getByTestId("buffer")).not.toHaveTextContent("health-probe");

        await user.click(screen.getByRole("switch", {name: "Probe web over HTTP"}));

        expect(screen.getByLabelText("Probe URL")).toHaveValue("http://localhost:8080/health");
        expect(screen.getByTestId("buffer")).toHaveTextContent("http://localhost:8080/health");
    });

    it("does not resurrect a stale error when an empty row is switched off and on again", async () => {
        const user = userEvent.setup();
        render(<HealthProbeForm composeContent={WEB_ONLY} onChange={vi.fn()} />);

        await user.click(screen.getByRole("switch", {name: "Probe web over HTTP"}));
        await user.click(screen.getByLabelText("Probe URL"));
        await user.tab();
        expect(await screen.findByText("Enter a valid http:// or https:// URL.")).toBeVisible();

        await user.click(screen.getByRole("switch", {name: "Probe web over HTTP"}));
        await user.click(screen.getByRole("switch", {name: "Probe web over HTTP"}));

        expect(screen.getByLabelText("Probe URL")).toBeVisible();
        expect(screen.queryByText("Enter a valid http:// or https:// URL.")).not.toBeInTheDocument();
    });

    it("re-validates a URL kept in the row when the switch is turned back on", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<HealthProbeForm composeContent={WEB_ONLY} onChange={onChange} />);

        await user.click(screen.getByRole("switch", {name: "Probe web over HTTP"}));
        await user.type(screen.getByLabelText("Probe URL"), "nope");
        await user.tab();
        await user.click(screen.getByRole("switch", {name: "Probe web over HTTP"}));
        await user.click(screen.getByRole("switch", {name: "Probe web over HTTP"}));

        expect(await screen.findByText("Enter a valid http:// or https:// URL.")).toBeVisible();
        expect(onChange).not.toHaveBeenCalled();
    });
});

describe("HealthProbeForm — two-way sync with the buffer (11-12 regression class)", () => {
    it("never duplicates text or loses keystrokes when its own write is fed back as composeContent", async () => {
        const user = userEvent.setup();
        const onEmit = vi.fn();
        const url = "http://localhost:8080/health";
        render(<Harness initial={WEB_ONLY} onEmit={onEmit} />);

        await user.click(screen.getByRole("switch", {name: "Probe web over HTTP"}));
        const input = screen.getByLabelText("Probe URL");
        // user-event types one keystroke at a time, each re-rendering the form.
        await user.type(input, url);
        expect(input).toHaveValue(url);
        await user.tab();

        // Blur wrote the buffer once; the round-trip must not reset the field.
        expect(screen.getByLabelText("Probe URL")).toHaveValue(url);
        expect(onEmit).toHaveBeenCalledTimes(1);
        expect(occurrences(lastCall(onEmit), url)).toBe(1);
        expect(occurrences(screen.getByTestId("buffer").textContent ?? "", url)).toBe(1);

        // Typing on after the write keeps every keystroke too.
        await user.type(screen.getByLabelText("Probe URL"), "2");
        expect(screen.getByLabelText("Probe URL")).toHaveValue(`${url}2`);
        await user.tab();
        expect(occurrences(lastCall(onEmit), `${url}2`)).toBe(1);
        expect(occurrences(lastCall(onEmit), "health-probe")).toBe(1);
    });

    it("accumulates edits to two services without losing the first", async () => {
        const user = userEvent.setup();
        const onEmit = vi.fn();
        render(<Harness initial={WEB_AND_DB} onEmit={onEmit} />);

        await user.click(screen.getByRole("switch", {name: "Probe web over HTTP"}));
        const webRow = screen.getByRole("listitem", {name: "web"});
        await user.type(within(webRow).getByLabelText("Probe URL"), "http://localhost:1/");
        await user.tab();

        await user.click(screen.getByRole("switch", {name: "Probe db over HTTP"}));
        const dbRow = screen.getByRole("listitem", {name: "db"});
        await user.type(within(dbRow).getByLabelText("Probe URL"), "http://localhost:2/");
        await user.tab();

        const buffer = lastCall(onEmit);
        expect(buffer).toContain("http://localhost:1/");
        expect(buffer).toContain("http://localhost:2/");
    });

    it("re-seeds the fields when the compose buffer is edited externally", async () => {
        const user = userEvent.setup();
        const external = PROBED_WEB.replace("http://localhost:8080/health", "http://localhost:9000/");
        render(<Harness initial={PROBED_WEB} externalEdit={external} />);
        expect(screen.getByLabelText("Probe URL")).toHaveValue("http://localhost:8080/health");

        await user.click(screen.getByRole("button", {name: "Edit externally"}));

        expect(screen.getByLabelText("Probe URL")).toHaveValue("http://localhost:9000/");
    });

    it("re-seeds when the parent rerenders with content produced outside the form", () => {
        const {rerender} = render(<HealthProbeForm composeContent={PROBED_WEB} onChange={vi.fn()} />);
        const external = PROBED_WEB.replace("http://localhost:8080/health", "http://localhost:9000/");

        rerender(<HealthProbeForm composeContent={external} onChange={vi.fn()} />);

        expect(screen.getByLabelText("Probe URL")).toHaveValue("http://localhost:9000/");
    });

    it("picks up services added in the code editor", async () => {
        const user = userEvent.setup();
        render(<Harness initial={WEB_ONLY} externalEdit={WEB_AND_DB} />);
        expect(screen.queryByRole("switch", {name: "Probe db over HTTP"})).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Edit externally"}));

        expect(screen.getByRole("switch", {name: "Probe db over HTTP"})).not.toBeChecked();
    });
});
