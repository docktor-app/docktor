import {describe, expect, it} from "vitest";
import {totpFromUri} from "../../helpers/totp.js";

// RFC 6238 appendix B: SHA-1, secret "12345678901234567890" (base32 below).
const RFC_URI = "otpauth://totp/Docktor:a?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Docktor";

describe("totpFromUri", () => {
    it("matches the RFC 6238 vector at T=59s", () => {
        expect(totpFromUri(RFC_URI, 59_000)).toBe("287082");
    });

    it("matches the RFC 6238 vector at T=1111111109s (leading zero kept)", () => {
        expect(totpFromUri(RFC_URI, 1_111_111_109_000)).toBe("081804");
    });

    it("returns the same code anywhere inside one 30-second step", () => {
        expect(totpFromUri(RFC_URI, 30_000)).toBe(totpFromUri(RFC_URI, 59_999));
    });

    it("decodes unpadded and lowercase base32", () => {
        const lower = RFC_URI.replace("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "gezdgnbvgy3tqojqgezdgnbvgy3tqojq");
        expect(totpFromUri(lower, 59_000)).toBe("287082");
    });
});
