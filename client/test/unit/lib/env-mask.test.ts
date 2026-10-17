import {describe, expect, it} from "vitest";
import {envLineHasSecret, envTextHasSecret, maskEnvLine, maskEnvText, SECRET_MASK} from "@/lib/env-mask";

describe("env-mask", () => {
    it("exposes the eight-bullet mask", () => {
        expect(SECRET_MASK).toBe("••••••••");
    });

    describe("maskEnvLine", () => {
        it("masks the value of a secret-looking key", () => {
            expect(maskEnvLine("DB_PASSWORD=hunter2", false)).toBe("DB_PASSWORD=••••••••");
        });

        it("keeps an export prefix when masking", () => {
            expect(maskEnvLine("export API_TOKEN=abc", false)).toBe("export API_TOKEN=••••••••");
        });

        it("leaves a non-secret key untouched", () => {
            expect(maskEnvLine("PORT=8080", false)).toBe("PORT=8080");
        });

        it("leaves a comment untouched even if it mentions a secret key", () => {
            expect(maskEnvLine("# SECRET=x comment", false)).toBe("# SECRET=x comment");
        });

        it("returns the line unchanged when secrets are revealed", () => {
            expect(maskEnvLine("DB_PASSWORD=hunter2", true)).toBe("DB_PASSWORD=hunter2");
        });
    });

    describe("maskEnvText", () => {
        it("masks line by line and preserves blank lines", () => {
            expect(maskEnvText("DB_PASSWORD=hunter2\nPORT=8080\n\nAPI_KEY=k", false)).toBe(
                "DB_PASSWORD=••••••••\nPORT=8080\n\nAPI_KEY=••••••••",
            );
        });

        it("returns the content unchanged when secrets are revealed", () => {
            const content = "DB_PASSWORD=hunter2\nPORT=8080";
            expect(maskEnvText(content, true)).toBe(content);
        });
    });

    describe("secret detection", () => {
        it("detects a secret key in a block of env text", () => {
            expect(envTextHasSecret("PORT=8080\nDB_PASSWORD=x")).toBe(true);
        });

        it("reports no secret when every key is benign", () => {
            expect(envTextHasSecret("PORT=8080")).toBe(false);
        });

        it("detects a secret key on a single export line", () => {
            expect(envLineHasSecret("export MY_SECRET=1")).toBe(true);
        });
    });
});
