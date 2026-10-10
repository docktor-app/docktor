import {describe, expect, it} from "vitest";
import {formatBytes} from "@/lib/format-bytes";

describe("formatBytes", () => {
    it.each([
        [0, "0 B"],
        [512, "512 B"],
        [1023, "1023 B"],
        [1536, "1.5 KB"],
        [1048576, "1.0 MB"],
        [1073741824, "1.00 GB"],
        [1099511627776, "1.00 TB"],
        [5 * 1099511627776, "5.00 TB"],
    ])("formats %d as %s", (bytes, expected) => {
        expect(formatBytes(bytes)).toBe(expected);
    });

    it("renders an em dash for null", () => {
        expect(formatBytes(null)).toBe("—");
    });

    it("stays in terabytes for values past 1024 TB", () => {
        expect(formatBytes(2048 * 1099511627776)).toBe("2048.00 TB");
    });
});
