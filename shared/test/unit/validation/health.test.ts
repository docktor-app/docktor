import {describe, expect, it} from "vitest";
import {
    HEALTH_PROBE_ALLOWED_HOSTS,
    HEALTH_PROBE_DEFAULT_TIMEOUT_SECONDS,
    HEALTH_PROBE_MAX_TIMEOUT_SECONDS,
    healthProbeFormSchema,
    healthProbeSchema,
    serviceHealthEventsQuerySchema,
} from "../../../src/validation/health.js";

describe("serviceHealthEventsQuerySchema", () => {
    it("defaults limit to 50 when nothing is supplied", () => {
        expect(serviceHealthEventsQuerySchema.parse({})).toEqual({limit: 50});
    });

    it("coerces a numeric string limit", () => {
        expect(serviceHealthEventsQuerySchema.parse({limit: "10"}).limit).toBe(10);
    });

    it.each(["0", "201", "abc", "1.5"])("rejects limit %s", (limit) => {
        expect(serviceHealthEventsQuerySchema.safeParse({limit}).success).toBe(false);
    });

    it("accepts the bounds 1 and 200", () => {
        expect(serviceHealthEventsQuerySchema.safeParse({limit: "1"}).success).toBe(true);
        expect(serviceHealthEventsQuerySchema.safeParse({limit: "200"}).success).toBe(true);
    });

    it("rejects an empty serviceName", () => {
        expect(serviceHealthEventsQuerySchema.safeParse({serviceName: ""}).success).toBe(false);
    });

    it("rejects a serviceName longer than 255 characters", () => {
        expect(serviceHealthEventsQuerySchema.safeParse({serviceName: "a".repeat(256)}).success).toBe(false);
    });

    it("accepts a serviceName", () => {
        expect(serviceHealthEventsQuerySchema.parse({serviceName: "web"})).toEqual({serviceName: "web", limit: 50});
    });
});

const URL_MESSAGE = "Enter a valid http:// or https:// URL.";
const HOST_MESSAGE =
    "The host must be localhost, 127.0.0.1, or [::1]. Docktor sends the request to this service's container.";
const USERINFO_MESSAGE = "Remove the username and password from the URL.";
const TIMEOUT_MESSAGE = "Enter a whole number from 1 to 30.";

function firstMessage(input: unknown): string | undefined {
    const result = healthProbeSchema.safeParse(input);
    return result.success ? undefined : result.error.issues[0]?.message;
}

describe("health probe constants", () => {
    it("exposes the loopback allow-list and timeout bounds", () => {
        expect(HEALTH_PROBE_ALLOWED_HOSTS).toEqual(["localhost", "127.0.0.1", "[::1]"]);
        expect(HEALTH_PROBE_DEFAULT_TIMEOUT_SECONDS).toBe(5);
        expect(HEALTH_PROBE_MAX_TIMEOUT_SECONDS).toBe(30);
    });
});

describe("healthProbeSchema", () => {
    it.each([
        {url: "http://localhost:8080/health"},
        {url: "https://127.0.0.1/h", timeout: 30},
        {url: "http://[::1]:3000/"},
        {url: "  http://localhost/  ", timeout: 1},
    ])("accepts %j", (input) => {
        expect(healthProbeSchema.safeParse(input).success).toBe(true);
    });

    it("trims the url", () => {
        expect(healthProbeSchema.parse({url: "  http://localhost/  "}).url).toBe("http://localhost/");
    });

    it.each(["ftp://localhost/", "not a url", "", "localhost:8080", "javascript:alert(1)"])(
        "rejects %j as not an http(s) URL",
        (url) => {
            expect(firstMessage({url})).toBe(URL_MESSAGE);
        },
    );

    it.each([
        "http://example.com/",
        "http://169.254.169.254/latest/meta-data",
        "http://localhost.evil.com/",
        "http://10.0.0.5:8080/",
        "http://[::2]/",
    ])("rejects non-container host %s", (url) => {
        expect(firstMessage({url})).toBe(HOST_MESSAGE);
    });

    it.each(["http://user:pw@localhost/", "http://user@localhost/", "http://:pw@localhost/"])(
        "rejects userinfo in %s",
        (url) => {
            expect(firstMessage({url})).toBe(USERINFO_MESSAGE);
        },
    );

    it("reports userinfo before a bad host so only one message shows", () => {
        const result = healthProbeSchema.safeParse({url: "http://user:pw@example.com/"});
        expect(result.success).toBe(false);
        expect(result.error?.issues).toHaveLength(1);
        expect(result.error?.issues[0]?.message).toBe(USERINFO_MESSAGE);
    });

    it.each([0, 31, 1.5, -1, Number.NaN])("rejects timeout %s", (timeout) => {
        expect(firstMessage({url: "http://localhost/", timeout})).toBe(TIMEOUT_MESSAGE);
    });

    it("rejects a non-numeric timeout with the same message", () => {
        expect(firstMessage({url: "http://localhost/", timeout: "5"})).toBe(TIMEOUT_MESSAGE);
    });
});

describe("healthProbeFormSchema", () => {
    const row = (overrides: Partial<{serviceName: string; enabled: boolean; url: string; timeout: string}> = {}) => ({
        serviceName: "web",
        enabled: true,
        url: "http://localhost:8080/health",
        timeout: "",
        ...overrides,
    });

    function issuePaths(input: unknown): string[] {
        const result = healthProbeFormSchema.safeParse(input);
        return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
    }

    it("passes a disabled row with an empty url", () => {
        expect(healthProbeFormSchema.safeParse({probes: [row({enabled: false, url: ""})]}).success).toBe(true);
    });

    it("passes a disabled row even with garbage values", () => {
        const input = {probes: [row({enabled: false, url: "nope", timeout: "99"})]};
        expect(healthProbeFormSchema.safeParse(input).success).toBe(true);
    });

    it("fails an enabled row with an empty url at probes.0.url", () => {
        expect(issuePaths({probes: [row({url: ""})]})).toEqual(["probes.0.url"]);
    });

    it("passes an enabled row with an empty timeout (optional)", () => {
        expect(healthProbeFormSchema.safeParse({probes: [row({timeout: ""})]}).success).toBe(true);
        expect(healthProbeFormSchema.safeParse({probes: [row({timeout: "   "})]}).success).toBe(true);
    });

    it("fails an out-of-range timeout at probes.0.timeout", () => {
        expect(issuePaths({probes: [row({timeout: "45"})]})).toEqual(["probes.0.timeout"]);
    });

    it.each(["0", "1.5", "abc"])("fails timeout %j with the timeout message", (timeout) => {
        const result = healthProbeFormSchema.safeParse({probes: [row({timeout})]});
        expect(result.success).toBe(false);
        expect(result.error?.issues[0]?.message).toBe(TIMEOUT_MESSAGE);
    });

    it("passes a valid timeout string", () => {
        expect(healthProbeFormSchema.safeParse({probes: [row({timeout: "30"})]}).success).toBe(true);
    });

    it("carries the host message on probes.N.url and reports rows by index", () => {
        const result = healthProbeFormSchema.safeParse({
            probes: [row(), row({serviceName: "db", url: "http://example.com/"})],
        });
        expect(result.success).toBe(false);
        expect(result.error?.issues).toHaveLength(1);
        expect(result.error?.issues[0]?.path.join(".")).toBe("probes.1.url");
        expect(result.error?.issues[0]?.message).toBe(HOST_MESSAGE);
    });
});
