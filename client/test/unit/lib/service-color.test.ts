import {describe, expect, it} from "vitest";
import {getServiceColor} from "@/lib/service-color";

const PALETTE = [
    "text-cyan-400",
    "text-yellow-400",
    "text-pink-400",
    "text-purple-400",
    "text-orange-400",
    "text-lime-400",
    "text-sky-400",
    "text-rose-400",
    "text-indigo-400",
    "text-emerald-400",
];

describe("getServiceColor", () => {
    it("returns the same class for the same name on every call", () => {
        expect(getServiceColor("web")).toBe(getServiceColor("web"));
    });

    it("always returns one of the 10 palette entries", () => {
        expect(PALETTE).toContain(getServiceColor("web"));
        expect(PALETTE).toContain(getServiceColor("db"));
        expect(PALETTE).toContain(getServiceColor("redis"));
    });

    it("matches the pre-move output for known service names", () => {
        expect(getServiceColor("web")).toBe("text-indigo-400");
        expect(getServiceColor("db")).toBe("text-indigo-400");
        expect(getServiceColor("redis")).toBe("text-lime-400");
    });
});
