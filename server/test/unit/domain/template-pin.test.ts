import {describe, expect, it} from "vitest";
import {isTemplateUpdated} from "../../../src/domain/template-pin.js";

describe("isTemplateUpdated (Issue #19/D-08)", () => {
    it("returns true when the current hash differs from the pinned hash", () => {
        expect(isTemplateUpdated("a", "b")).toBe(true);
    });

    it("returns false when the current hash matches the pinned hash", () => {
        expect(isTemplateUpdated("a", "a")).toBe(false);
    });

    it("returns false when there is no current hash (removed variant/unknown repo) — never raises the badge", () => {
        expect(isTemplateUpdated("a", undefined)).toBe(false);
    });
});
