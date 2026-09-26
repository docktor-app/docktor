import {describe, expect, it} from "vitest";
import {describeStackEvent} from "@/lib/stack-event-description";
import type {StackEvent} from "@/lib/stacks-api";

function makeEvent(overrides: Partial<StackEvent>): StackEvent {
    return {
        id: "1",
        type: "config_changed",
        message: null,
        payload: null,
        createdAt: "2026-08-28T12:00:00Z",
        ...overrides,
    };
}

// Carried over from the deleted event-log-card.test.tsx's "describeStackEvent"
// describe block (Phase 2 contract) — payload-parsing behaviour is unchanged,
// only the returned shape moves from {variant} (Badge) to {tone} (ToneBadge).
describe("describeStackEvent", () => {
    it("returns the fixed compose-changed text when the payload cannot be parsed", () => {
        const result = describeStackEvent(
            makeEvent({type: "config_changed", payload: "{not valid json"}),
        );
        expect(result.label).toBe("Config Changed");
        expect(result.description).toMatch(/compose file changed on disk/i);
        expect(result.tone).toBe("yellow");
    });

    it("appends short hash forms when the payload parses with both hashes", () => {
        const result = describeStackEvent(
            makeEvent({
                type: "config_changed",
                payload: JSON.stringify({oldHash: "abcdef1234567890", newHash: "1234567890abcdef"}),
            }),
        );
        expect(result.description).toMatch(/compose file changed on disk/i);
        expect(result.description).toContain("abcdef1");
        expect(result.description).toContain("1234567");
    });

    it("returns the stored message for config_error with a red tone", () => {
        const result = describeStackEvent(
            makeEvent({type: "config_error", message: "services: is required"}),
        );
        expect(result.label).toBe("Config Error");
        expect(result.description).toBe("services: is required");
        expect(result.tone).toBe("red");
    });

    it("falls back to a fixed message when config_error has no stored message", () => {
        const result = describeStackEvent(makeEvent({type: "config_error", message: null}));
        expect(result.description).toBe("Configuration validation failed");
    });

    it("returns the message (image reference) for update_available with a blue tone", () => {
        const result = describeStackEvent(
            makeEvent({type: "update_available", message: "nginx:1.27"}),
        );
        expect(result.label).toBe("Update Available");
        expect(result.description).toBe("nginx:1.27");
        expect(result.tone).toBe("blue");
    });

    it("falls back to a fixed message when update_available has no stored message", () => {
        const result = describeStackEvent(makeEvent({type: "update_available", message: null}));
        expect(result.description).toBe("A newer image is available");
    });

    it("never throws on an absent payload", () => {
        expect(() =>
            describeStackEvent(makeEvent({type: "config_changed", payload: null})),
        ).not.toThrow();
    });

    it("never throws on an empty-string payload", () => {
        expect(() =>
            describeStackEvent(makeEvent({type: "config_changed", payload: ""})),
        ).not.toThrow();
    });
});
