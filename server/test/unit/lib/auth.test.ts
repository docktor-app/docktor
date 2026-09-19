import {describe, expect, it} from "vitest";
import {buildTrustedOrigins} from "../../../src/lib/auth.js";

describe("buildTrustedOrigins", () => {
    it("includes only the env URL when the Settings baseUrl is unset", () => {
        expect(buildTrustedOrigins("https://env.example.com", null)).toEqual(["https://env.example.com"]);
    });

    it("includes only the Settings baseUrl when the env URL is unset", () => {
        expect(buildTrustedOrigins(undefined, "https://wizard.example.com")).toEqual([
            "https://wizard.example.com",
        ]);
    });

    it("includes both sources when they differ, so either origin is trusted", () => {
        const result = buildTrustedOrigins("https://env.example.com", "https://wizard.example.com");
        expect(result).toContain("https://env.example.com");
        expect(result).toContain("https://wizard.example.com");
        expect(result).toHaveLength(2);
    });

    it("deduplicates when both sources are the same value", () => {
        expect(buildTrustedOrigins("https://same.example.com", "https://same.example.com")).toEqual([
            "https://same.example.com",
        ]);
    });

    it("falls back to the dev-server default when neither source is set", () => {
        expect(buildTrustedOrigins(undefined, null)).toEqual(["http://localhost:5173"]);
    });

    it("treats an empty-string Settings baseUrl as unset", () => {
        expect(buildTrustedOrigins("https://env.example.com", "")).toEqual(["https://env.example.com"]);
    });
});
