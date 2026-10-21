import {describe, expect, it} from "vitest";
import {TOUCH_TARGET} from "@/lib/touch-target";
import {cn} from "@/lib/utils";

describe("TOUCH_TARGET", () => {
    it("is the 44px-below-md size class", () => {
        expect(TOUCH_TARGET).toBe("max-md:size-11");
    });

    it("survives tailwind-merge next to the compact base size", () => {
        const merged = cn("size-9", TOUCH_TARGET).split(" ");

        expect(merged).toContain("size-9");
        expect(merged).toContain("max-md:size-11");
    });
});
