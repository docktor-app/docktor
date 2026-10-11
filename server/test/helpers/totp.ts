import {createHmac} from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_STEP_MS = 30_000;
const TOTP_DIGITS = 1_000_000;

// RFC 4648 base32 decoder (no padding required, case-insensitive). The TOTP
// URI's `secret` parameter is the base32 form of better-auth's raw secret.
function base32Decode(input: string): Buffer {
    const clean = input.replace(/=+$/, "").toUpperCase();
    let bits = 0;
    let value = 0;
    const bytes: number[] = [];
    for (const char of clean) {
        const index = BASE32_ALPHABET.indexOf(char);
        if (index === -1) throw new Error(`Invalid base32 character: ${char}`);
        value = (value << 5) | index;
        bits += 5;
        if (bits >= 8) {
            bits -= 8;
            bytes.push((value >> bits) & 0xff);
        }
    }
    return Buffer.from(bytes);
}

/**
 * Test helper: the 6-digit RFC 6238 code (HMAC-SHA1, 30 s step) for an
 * enrollment `otpauth://` URI. Lets integration tests complete TOTP sign-in
 * without a dependency. Never log the URI or the code.
 */
export function totpFromUri(totpURI: string, nowMs: number = Date.now()): string {
    const secret = new URL(totpURI).searchParams.get("secret");
    if (!secret) throw new Error("totpFromUri: URI has no secret parameter");

    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(Math.floor(nowMs / TOTP_STEP_MS)));

    const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary =
        ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
    return String(binary % TOTP_DIGITS).padStart(6, "0");
}
