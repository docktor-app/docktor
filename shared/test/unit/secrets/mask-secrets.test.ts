import {describe, expect, it} from "vitest";

import {
    isSecretKey,
    lineHasSecret,
    maskSecretLine,
    maskErrorText,
    maskSecrets,
    SECRET_MASK,
    textHasSecret,
} from "../../../src/secrets/mask-secrets.js";

const M = SECRET_MASK;

describe("SECRET_MASK", () => {
    it("is the eight-bullet mask", () => {
        expect(SECRET_MASK).toBe("••••••••");
    });
});

describe("isSecretKey", () => {
    it.each(["DB_PASSWORD", "DB_PASSWD", "API_KEY", "AUTH_TOKEN", "MY_SECRET", "AWS_CREDENTIALS", "apiKey"])(
        "treats %s as secret",
        (key) => {
            expect(isSecretKey(key)).toBe(true);
        },
    );

    it.each(["PORT", "HOST", "NODE_ENV", "DATABASE_URL"])("treats %s as not secret", (key) => {
        expect(isSecretKey(key)).toBe(false);
    });
});

describe("maskSecretLine", () => {
    it.each([
        // .env form
        ["POSTGRES_PASSWORD=hunter2", `POSTGRES_PASSWORD=${M}`],
        ["export API_TOKEN=abc", `export API_TOKEN=${M}`],
        ["PORT=8080", "PORT=8080"],
        ["# SECRET=x comment", "# SECRET=x comment"],
        ["API_KEY=", "API_KEY="],
        ['API_KEY="abc"', `API_KEY="${M}"`],
        // compose map form
        ["      POSTGRES_PASSWORD: hunter2", `      POSTGRES_PASSWORD: ${M}`],
        ["      \"DB_PASSWORD\": 'x'", `      "DB_PASSWORD": '${M}'`],
        ["      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}", "      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}"],
        ["      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-dev}", "      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-dev}"],
        ["      PORT: 8080", "      PORT: 8080"],
        // compose list form
        ["      - DB_PASSWORD=x", `      - DB_PASSWORD=${M}`],
        ['      - "API_KEY=y"', `      - "API_KEY=${M}"`],
        ["      - DB_PASSWORD=${DB_PASSWORD}", "      - DB_PASSWORD=${DB_PASSWORD}"],
        ["      - PORT=8080", "      - PORT=8080"],
        // URL credentials, regardless of the key name
        ["DATABASE_URL=postgres://app:s3cret@db/app", `DATABASE_URL=postgres://app:${M}@db/app`],
        ["      URL: https://u:p@example.org/x", `      URL: https://u:${M}@example.org/x`],
        ["      command: curl https://u:p@example.org/x", `      command: curl https://u:${M}@example.org/x`],
        ["DATABASE_URL=postgres://app:${DB_PASSWORD}@db/app", "DATABASE_URL=postgres://app:${DB_PASSWORD}@db/app"],
        ["REDIS_URL=redis://:s3cret@cache:6379/0", `REDIS_URL=redis://:${M}@cache:6379/0`],
        ["      URL: redis://default:pa/ss@cache", `      URL: redis://default:${M}@cache`],
        ["      URL: postgres://u:pa@ss@db/app", `      URL: postgres://u:${M}@db/app`],
        ["https://example.org/path", "https://example.org/path"],
        ["https://example.org:8080/path", "https://example.org:8080/path"],
        ["https://user@example.org/path", "https://user@example.org/path"],
        // block scalars and non-scalar values stay as they are
        ["      SECRET_KEY: |", "      SECRET_KEY: |"],
        ["      SECRET_KEY: >-", "      SECRET_KEY: >-"],
        ["      SECRET_KEY:", "      SECRET_KEY:"],
        ["      SECRET_KEY: {a: b}", "      SECRET_KEY: {a: b}"],
        // flow-style maps
        ["    environment: {DB_PASSWORD: x, PORT: 1}", `    environment: {DB_PASSWORD: ${M}, PORT: 1}`],
        ['    environment: {"API_KEY": "x"}', `    environment: {"API_KEY": "${M}"}`],
        ["    environment: {PORT: 1}", "    environment: {PORT: 1}"],
        // CRLF
        ["API_KEY=abc\r", `API_KEY=${M}\r`],
        ["      PASSWORD: abc\r", `      PASSWORD: ${M}\r`],
        ["PORT=8080\r", "PORT=8080\r"],
        // already masked
        [`API_KEY=${M}`, `API_KEY=${M}`],
    ])("%j -> %j", (line, expected) => {
        expect(maskSecretLine(line)).toBe(expected);
    });
});

describe("maskSecrets", () => {
    it("masks line by line and keeps blank lines", () => {
        expect(maskSecrets("DB_PASSWORD=hunter2\nPORT=8080\n\nAPI_KEY=k")).toBe(
            `DB_PASSWORD=${M}\nPORT=8080\n\nAPI_KEY=${M}`,
        );
    });

    it("masks a compose environment block in both forms", () => {
        const compose = ["environment:", "  DB_PASSWORD: a", "  OTHER:", "    - TOKEN=b", "    - PORT=1"].join("\n");
        expect(maskSecrets(compose)).toBe(
            ["environment:", `  DB_PASSWORD: ${M}`, "  OTHER:", `    - TOKEN=${M}`, "    - PORT=1"].join("\n"),
        );
    });
});

describe("secret detection", () => {
    it("lineHasSecret is true exactly when masking changes the line", () => {
        expect(lineHasSecret("export MY_SECRET=1")).toBe(true);
        expect(lineHasSecret("PORT=8080")).toBe(false);
        expect(lineHasSecret(`API_KEY=${M}`)).toBe(false);
    });

    it("textHasSecret looks through every line", () => {
        expect(textHasSecret("PORT=8080\nDB_PASSWORD=x")).toBe(true);
        expect(textHasSecret("PORT=8080\n  - HOST=db")).toBe(false);
        expect(textHasSecret("")).toBe(false);
    });
});

describe("maskSecrets block scalars", () => {
    it("masks the continuation lines of a block scalar owned by a secret key", () => {
        const compose = [
            "    environment:",
            "      PRIVATE_KEY: |",
            "        line one",
            "",
            "        line two",
            "      PORT: 8080",
        ].join("\n");
        expect(maskSecrets(compose)).toBe(
            [
                "    environment:",
                "      PRIVATE_KEY: |",
                `        ${M}`,
                "",
                `        ${M}`,
                "      PORT: 8080",
            ].join("\n"),
        );
    });

    it("leaves the block of a non-secret key alone", () => {
        const text = ["    command: |", "      echo hi"].join("\n");
        expect(maskSecrets(text)).toBe(text);
    });

    it("keeps CRLF line endings inside a masked block", () => {
        expect(maskSecrets("SECRET_KEY: >-\r\n  abc\r\nPORT: 1\r\n")).toBe(
            `SECRET_KEY: >-\r\n  ${M}\r\nPORT: 1\r\n`,
        );
    });
});

describe("maskErrorText", () => {
    it("masks an assignment in the middle of a line", () => {
        expect(maskErrorText("invalid interpolation: POSTGRES_PASSWORD=hunter2 in service db")).toBe(
            `invalid interpolation: POSTGRES_PASSWORD=${M} in service db`,
        );
    });

    it("masks quoted and JSON fragments", () => {
        expect(maskErrorText('failed to parse {"DB_PASSWORD":"x y"} and API_KEY="abc"')).toBe(
            `failed to parse {"DB_PASSWORD":"${M}"} and API_KEY="${M}"`,
        );
    });

    it("keeps non-secret assignments and variable references", () => {
        const text = "PORT=8080 and DB_PASSWORD=${DB_PASSWORD} and empty API_KEY= end";
        expect(maskErrorText(text)).toBe(text);
    });

    it("still applies the line rules and URL credentials", () => {
        expect(maskErrorText("pull failed for redis://:pw@cache\nAPI_KEY=k")).toBe(
            `pull failed for redis://:${M}@cache\nAPI_KEY=${M}`,
        );
    });
});
