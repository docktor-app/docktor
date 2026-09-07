import {describe, expect, it} from "vitest";

// `compiled` resolves through shared/package.json's "main" field to the
// gitignored, built shared/dist/index.js — exactly what server/src/routes/proxy.ts
// (and every other server module) actually imports at runtime.
import * as compiled from "@docktor/shared";
// `source` bypasses that resolution entirely and reads shared/src directly;
// vitest transpiles the TypeScript on the fly. This is the ground truth.
import * as source from "../../../shared/src/index.js";

const REBUILD_HINT =
    "the compiled @docktor/shared output is stale relative to shared/src — run `yarn workspace @docktor/shared build` to fix";

type SafeParsable = {safeParse: (input: unknown) => {success: boolean}};

function hasSafeParse(value: unknown): value is SafeParsable {
    return (
        typeof value === "object" &&
        value !== null &&
        "safeParse" in value &&
        typeof (value as {safeParse?: unknown}).safeParse === "function"
    );
}

const PROBE_INPUTS: unknown[] = [{}, "x"];

describe("shared-schema-parity: compiled @docktor/shared vs shared/src", () => {
    it("exports the same set of runtime names as shared/src/index.ts", () => {
        const compiledKeys = Object.keys(compiled).sort();
        const sourceKeys = Object.keys(source).sort();

        expect(compiledKeys, REBUILD_HINT).toEqual(sourceKeys);
    });

    it("every safeParse-bearing export agrees on probe inputs between compiled and source", () => {
        const sharedKeys = Object.keys(compiled).filter((key) => key in source);

        for (const key of sharedKeys) {
            const compiledValue = (compiled as Record<string, unknown>)[key];
            const sourceValue = (source as Record<string, unknown>)[key];

            if (!hasSafeParse(compiledValue) || !hasSafeParse(sourceValue)) {
                continue;
            }

            for (const probe of PROBE_INPUTS) {
                const compiledResult = compiledValue.safeParse(probe).success;
                const sourceResult = sourceValue.safeParse(probe).success;

                expect(
                    compiledResult,
                    `export "${key}" disagrees on probe input ${JSON.stringify(probe)}: ${REBUILD_HINT}`,
                ).toBe(sourceResult);
            }
        }
    });

    it("compiled assignDomainSchema rejects the G-06-3 payload — this is the object the running server validates with", () => {
        const result = compiled.assignDomainSchema.safeParse({
            domain: "not a hostname",
            internalPort: 8080,
            tlsEnabled: true,
        });

        expect(result.success, `compiled assignDomainSchema accepted an invalid hostname: ${REBUILD_HINT}`).toBe(
            false,
        );
    });

    it("compiled assignDomainSchema accepts a valid payload — this is the object the running server validates with", () => {
        const result = compiled.assignDomainSchema.safeParse({
            domain: "app.example.com",
            internalPort: 8080,
            tlsEnabled: true,
        });

        expect(result.success, `compiled assignDomainSchema rejected a valid hostname: ${REBUILD_HINT}`).toBe(true);
    });
});
