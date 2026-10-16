import {describe, it, expect, vi} from "vitest";
import {parse as parseYaml} from "yaml";
import {ComposeRewriter} from "../../../src/infrastructure/compose-rewriter.js";
import {computeUnifiedDiff} from "../../../src/lib/unified-diff.js";

// Fixtures are explicit line arrays joined with "\n" so indentation is exact and
// never depends on template-literal formatting (G-18-4 B).
const lines = (...rows: string[]): string => rows.join("\n");
const toCrlf = (text: string): string => text.replaceAll("\n", "\r\n");

const MEMOS = lines(
    "services:",
    "  memos:",
    "    image: neosmemo/memos:stable",
    "    container_name: memos",
    "    volumes:",
    "      - ./data:/var/opt/memos",
    "    ports:",
    "      - 5230:5230",
    "",
);

// Sequences flush with their key: the style of the file in the UAT report.
const MEMOS_FLUSH = lines(
    "services:",
    "  memos:",
    "    image: neosmemo/memos:stable",
    "    container_name: memos",
    "    volumes:",
    "    - ./data:/var/opt/memos",
    "    ports:",
    "    - 5230:5230",
    "",
);

const MEMOS_CRLF = toCrlf(MEMOS_FLUSH);

const MEMOS_COMMENTED = lines(
    "# memos notes",
    "services:",
    "  memos:",
    "    image: neosmemo/memos:stable",
    "    container_name: memos",
    "    volumes:",
    "      - ./data:/var/opt/memos # data dir",
    "    ports:",
    "      - \"5230:5230\"",
    "",
);

const FORMATTING_VARIANTS: ReadonlyArray<readonly [string, string]> = [
    ["memos (2-space)", MEMOS],
    ["memos (sequences flush with key)", MEMOS_FLUSH],
    ["memos (CRLF)", MEMOS_CRLF],
    ["memos (comments and quoting)", MEMOS_COMMENTED],
];

const CONVERT_DATA: [{originalPath: string; newPath: string; convert: boolean}] = [
    {originalPath: "./data", newPath: "./volumes/data", convert: true},
];

const PGDATA_SHORT = lines(
    "services:",
    "  db:",
    "    image: postgres:16",
    "    volumes:",
    "      - pgdata:/var/lib/postgresql/data",
    "volumes:",
    "  pgdata: {}",
    "",
);

describe("ComposeRewriter", () => {
    describe("rewrite (CR-03: long-form volume entries)", () => {
        it("should rewrite the source of a long-form bind mount selected for conversion", () => {
            const compose = `
services:
  app:
    image: nginx
    volumes:
      - type: bind
        source: /mnt/nas/data
        target: /app/data
`;
            const rewriter = new ComposeRewriter();
            const result = rewriter.rewrite(
                compose,
                [{originalPath: "/mnt/nas/data", newPath: "./volumes/data", convert: true}],
                new Map(),
            );

            const doc = parseYaml(result.rewrittenCompose);
            const [vol] = doc.services.app.volumes;
            expect(vol.type).toBe("bind");
            expect(vol.source).toBe("./volumes/data");
            expect(vol.target).toBe("/app/data");
        });

        it("should leave a long-form bind mount untouched when not selected for conversion", () => {
            const compose = `
services:
  app:
    image: nginx
    volumes:
      - type: bind
        source: /mnt/nas/data
        target: /app/data
`;
            const rewriter = new ComposeRewriter();
            const result = rewriter.rewrite(compose, [], new Map());

            const doc = parseYaml(result.rewrittenCompose);
            const [vol] = doc.services.app.volumes;
            expect(vol.source).toBe("/mnt/nas/data");
        });

        it("should convert a long-form named-volume entry to a bind mount when selected", () => {
            const compose = `
services:
  db:
    image: postgres
    volumes:
      - type: volume
        source: pgdata
        target: /var/lib/postgresql/data
volumes:
  pgdata:
`;
            const rewriter = new ComposeRewriter();
            const result = rewriter.rewrite(compose, [], new Map([["pgdata", true]]));

            const doc = parseYaml(result.rewrittenCompose);
            const [vol] = doc.services.db.volumes;
            expect(vol.type).toBe("bind");
            expect(vol.source).toBe("./volumes/pgdata");
            expect(vol.target).toBe("/var/lib/postgresql/data");
        });

        it("should keep a long-form named-volume entry unchanged when not converted, and mark it external", () => {
            const compose = `
services:
  db:
    image: postgres
    volumes:
      - type: volume
        source: pgdata
        target: /var/lib/postgresql/data
volumes:
  pgdata:
`;
            const rewriter = new ComposeRewriter();
            const result = rewriter.rewrite(compose, [], new Map([["pgdata", false]]));

            const doc = parseYaml(result.rewrittenCompose);
            const [vol] = doc.services.db.volumes;
            expect(vol.type).toBe("volume");
            expect(vol.source).toBe("pgdata");
            expect(doc.volumes.pgdata.external).toBe(true);
        });
    });

    describe("rewrite (G-18-4 B: source-preserving edits)", () => {
        const rewriter = new ComposeRewriter();

        describe.each(FORMATTING_VARIANTS)("%s", (_name, compose) => {
            it("returns the file byte-for-byte when nothing is selected", () => {
                const result = rewriter.rewrite(compose, [], new Map());

                expect(result.rewrittenCompose).toBe(compose);
                expect(result.extractedEnv).toBe("");
            });

            it("changes only the bind-mount scalar when ./data is converted", () => {
                const result = rewriter.rewrite(compose, CONVERT_DATA, new Map());

                expect(result.rewrittenCompose).toBe(
                    compose.replace("./data:/var/opt/memos", "./volumes/data:/var/opt/memos"),
                );
            });

            it("leaves the file unchanged when the mount is kept in place", () => {
                const result = rewriter.rewrite(
                    compose,
                    [{originalPath: "./data", newPath: "./data", convert: true}],
                    new Map(),
                );

                expect(result.rewrittenCompose).toBe(compose);
            });

            it("leaves the file unchanged when the selection is not converted", () => {
                const result = rewriter.rewrite(
                    compose,
                    [{originalPath: "./data", newPath: "./volumes/data", convert: false}],
                    new Map(),
                );

                expect(result.rewrittenCompose).toBe(compose);
            });
        });

        it("shows exactly one removed and one added line in the preview diff (UAT symptom)", () => {
            const result = rewriter.rewrite(MEMOS_FLUSH, CONVERT_DATA, new Map());
            const diff = computeUnifiedDiff(MEMOS_FLUSH, result.rewrittenCompose);
            const changed = diff.hunks.flatMap(hunk => hunk.lines).filter(line => line.kind !== "context");

            expect(diff.added).toBe(1);
            expect(diff.removed).toBe(1);
            expect(changed.map(line => [line.kind, line.text])).toEqual([
                ["removed", "    - ./data:/var/opt/memos"],
                ["added", "    - ./volumes/data:/var/opt/memos"],
            ]);
        });

        it("produces an empty diff when nothing is selected", () => {
            const result = rewriter.rewrite(MEMOS_FLUSH, [], new Map());

            expect(computeUnifiedDiff(MEMOS_FLUSH, result.rewrittenCompose)).toEqual({hunks: [], added: 0, removed: 0});
        });

        it("keeps a double-quoted entry double-quoted", () => {
            const compose = lines("services:", "  app:", "    volumes:", "      - \"./data:/var/opt/memos\"", "");

            const result = rewriter.rewrite(compose, CONVERT_DATA, new Map());

            expect(result.rewrittenCompose).toBe(
                lines("services:", "  app:", "    volumes:", "      - \"./volumes/data:/var/opt/memos\"", ""),
            );
        });

        it("keeps a single-quoted entry single-quoted", () => {
            const compose = lines("services:", "  app:", "    volumes:", "      - './data:/var/opt/memos'", "");

            const result = rewriter.rewrite(compose, CONVERT_DATA, new Map());

            expect(result.rewrittenCompose).toBe(
                lines("services:", "  app:", "    volumes:", "      - './volumes/data:/var/opt/memos'", ""),
            );
        });

        it("changes only the source line of a long-form bind mount and keeps its comments", () => {
            const compose = lines(
                "services:",
                "  app:",
                "    volumes:",
                "      - type: bind # long form",
                "        source: /mnt/nas/data # host dir",
                "        target: /app/data",
                "",
            );

            const result = rewriter.rewrite(
                compose,
                [{originalPath: "/mnt/nas/data", newPath: "./volumes/data", convert: true}],
                new Map(),
            );

            expect(result.rewrittenCompose).toBe(compose.replace("/mnt/nas/data", "./volumes/data"));
        });

        it("rewrites a converted short-form named volume and drops the emptied top-level block", () => {
            const result = rewriter.rewrite(PGDATA_SHORT, [], new Map([["pgdata", true]]));

            expect(result.rewrittenCompose).toBe(
                lines(
                    "services:",
                    "  db:",
                    "    image: postgres:16",
                    "    volumes:",
                    "      - ./volumes/pgdata:/var/lib/postgresql/data",
                    "",
                ),
            );
        });

        it("removes only the converted top-level entry and marks a sibling external", () => {
            const compose = lines(
                "services:",
                "  db:",
                "    volumes:",
                "      - pgdata:/var/lib/postgresql/data",
                "      - cache:/cache",
                "volumes:",
                "  pgdata:",
                "  cache:",
                "    driver: local",
                "",
            );

            const result = rewriter.rewrite(compose, [], new Map([["pgdata", true]]));

            expect(result.rewrittenCompose).toBe(
                lines(
                    "services:",
                    "  db:",
                    "    volumes:",
                    "      - ./volumes/pgdata:/var/lib/postgresql/data",
                    "      - cache:/cache",
                    "volumes:",
                    "  cache: {external: true}",
                    "",
                ),
            );
        });

        it("keeps CRLF on every line when a top-level entry is removed", () => {
            const compose = toCrlf(
                lines("services:", "  db:", "    image: x", "volumes:", "  pgdata:", "  cache:", "    driver: local", ""),
            );

            const result = rewriter.rewrite(compose, [], new Map([["pgdata", true]]));

            expect(result.rewrittenCompose).toBe(
                toCrlf(lines("services:", "  db:", "    image: x", "volumes:", "  cache: {external: true}", "")),
            );
        });

        it("leaves a top-level entry that already declares external true untouched", () => {
            const compose = lines(
                "services:",
                "  app:",
                "    volumes:",
                "      - shared:/shared",
                "volumes:",
                "  shared:",
                "    external: true",
                "",
            );

            const result = rewriter.rewrite(compose, [], new Map());

            expect(result.rewrittenCompose).toBe(compose);
        });

        it("keeps an inline comment on an unconverted empty top-level entry", () => {
            const compose = lines(
                "services:",
                "  app:",
                "    volumes:",
                "      - cache:/cache",
                "volumes:",
                "  cache: # keep me",
                "",
            );

            const result = rewriter.rewrite(compose, [], new Map());

            expect(result.rewrittenCompose).toBe(compose.replace("cache: #", "cache: {external: true} #"));
        });

        it("rebuilds a flow-style top-level volumes map", () => {
            const compose = lines(
                "services:",
                "  app:",
                "    volumes:",
                "      - pgdata:/data",
                "      - cache:/cache",
                "volumes: {pgdata: {}, cache: {}}",
                "",
            );

            const result = rewriter.rewrite(compose, [], new Map([["pgdata", true]]));

            expect(result.rewrittenCompose).toBe(
                lines(
                    "services:",
                    "  app:",
                    "    volumes:",
                    "      - ./volumes/pgdata:/data",
                    "      - cache:/cache",
                    "volumes: {cache: {external: true}}",
                    "",
                ),
            );
        });

        it("keeps the declared name of a legacy external volume", () => {
            const compose = lines(
                "services:",
                "  app:",
                "    volumes:",
                "      - shared:/shared",
                "volumes:",
                "  shared:",
                "    external:",
                "      name: other",
                "",
            );

            expect(rewriter.rewrite(compose, [], new Map()).rewrittenCompose).toBe(compose);
        });

        it.each([
            ["an empty document", ""],
            ["a null services node", "services:\n"],
            ["a YAML syntax error", "services:\n  app: [unclosed\n"],
        ])("returns %s unchanged without throwing", (_name, compose) => {
            const result = rewriter.rewrite(compose, CONVERT_DATA, new Map([["pgdata", true]]));

            expect(result.rewrittenCompose).toBe(compose);
            expect(result.extractedEnv).toBe("");
            expect(result.envVars).toEqual({});
        });
    });

    describe("rewrite (G-18-4 B: inline environment values move to .env)", () => {
        const rewriter = new ComposeRewriter(() => new Set());

        const ENV_APP = lines(
            "services:",
            "  app:",
            "    image: nginx",
            "    environment:",
            "      FOO: bar",
            "      PASS: \"s3cr#t\"",
            "      PORT: 8080",
            "      DEBUG: true",
            "      REF: ${REF}",
            "      EMPTY:",
            "      # keep this comment",
            "",
        );

        const ENV_APP_REWRITTEN = lines(
            "services:",
            "  app:",
            "    image: nginx",
            "    environment:",
            "      FOO: ${FOO}",
            "      PASS: \"${PASS}\"",
            "      PORT: ${PORT}",
            "      DEBUG: ${DEBUG}",
            "      REF: ${REF}",
            "      EMPTY:",
            "      # keep this comment",
            "",
        );

        it("replaces literal values by ${KEY}, keeps the map form and lists the values for .env", () => {
            const result = rewriter.rewrite(ENV_APP, [], new Map());

            expect(result.rewrittenCompose).toBe(ENV_APP_REWRITTEN);
            expect(result.extractedEnv).toBe("FOO=bar\nPASS=s3cr#t\nPORT=8080\nDEBUG=true");
            expect(result.envVars).toEqual({FOO: "bar", PASS: "s3cr#t", PORT: "8080", DEBUG: "true"});
        });

        it("keeps CRLF on every line", () => {
            const result = rewriter.rewrite(toCrlf(ENV_APP), [], new Map());

            expect(result.rewrittenCompose).toBe(toCrlf(ENV_APP_REWRITTEN));
        });

        it("keeps a trailing comment next to a replaced value", () => {
            const compose = lines("services:", "  app:", "    environment:", "      FOO: bar # the foo", "");

            const result = rewriter.rewrite(compose, [], new Map());

            expect(result.rewrittenCompose).toBe(
                lines("services:", "  app:", "    environment:", "      FOO: ${FOO} # the foo", ""),
            );
        });

        it("leaves list-form environment untouched and extracts nothing from it", () => {
            const compose = lines("services:", "  app:", "    environment:", "      - FOO=bar", "      - BAZ", "");

            const result = rewriter.rewrite(compose, [], new Map());

            expect(result.rewrittenCompose).toBe(compose);
            expect(result.extractedEnv).toBe("");
            expect(result.envVars).toEqual({});
        });

        it("collects the keys of several services in document order", () => {
            const compose = lines(
                "services:",
                "  web:",
                "    environment:",
                "      A: one",
                "      B: two",
                "  worker:",
                "    environment:",
                "      C: three",
                "",
            );

            const result = rewriter.rewrite(compose, [], new Map());

            expect(result.extractedEnv).toBe("A=one\nB=two\nC=three");
            expect(result.envVars).toEqual({A: "one", B: "two", C: "three"});
        });

        describe("keys that several services share (CR-02)", () => {
            const service = (name: string, ...entries: string[]): string[] => [
                `  ${name}:`,
                "    environment:",
                ...entries.map((entry) => `      ${entry}`),
            ];

            it("keeps each service's own value when the same key has different values", () => {
                const compose = lines(
                    "services:",
                    ...service("web", 'PORT: "80"', "DB_HOST: db1"),
                    ...service("worker", 'PORT: "9000"', "DB_HOST: db2"),
                    "",
                );

                const result = rewriter.rewrite(compose, [], new Map());

                expect(result.rewrittenCompose).toBe(
                    lines(
                        "services:",
                        ...service("web", 'PORT: "${PORT}"', "DB_HOST: ${DB_HOST}"),
                        ...service("worker", 'PORT: "${WORKER_PORT}"', "DB_HOST: ${WORKER_DB_HOST}"),
                        "",
                    ),
                );
                expect(result.extractedEnv).toBe("PORT=80\nDB_HOST=db1\nWORKER_PORT=9000\nWORKER_DB_HOST=db2");
                expect(result.envVars).toEqual({
                    PORT: "80",
                    DB_HOST: "db1",
                    WORKER_PORT: "9000",
                    WORKER_DB_HOST: "db2",
                });
            });

            it("shares one .env entry when the same key has the same value", () => {
                const compose = lines(
                    "services:",
                    ...service("web", "TZ: Europe/Berlin"),
                    ...service("worker", "TZ: Europe/Berlin"),
                    "",
                );

                const result = rewriter.rewrite(compose, [], new Map());

                expect(result.rewrittenCompose).toBe(
                    lines("services:", ...service("web", "TZ: ${TZ}"), ...service("worker", "TZ: ${TZ}"), ""),
                );
                expect(result.extractedEnv).toBe("TZ=Europe/Berlin");
            });

            it("moves to the next numbered name when the prefixed name is taken by another value", () => {
                const compose = lines(
                    "services:",
                    ...service("web", 'PORT: "80"'),
                    ...service("batch", 'WORKER_PORT: "1"'),
                    ...service("worker", 'PORT: "9000"'),
                    "",
                );

                const result = rewriter.rewrite(compose, [], new Map());

                expect(result.envVars).toEqual({PORT: "80", WORKER_PORT: "1", WORKER_PORT_2: "9000"});
            });

            it.each([
                ["my-app", "MY_APP_PORT"],
                ["web.v2", "WEB_V2_PORT"],
                ["1st", "_1ST_PORT"],
            ])("sanitises the service name %s into %s", (name, expected) => {
                const compose = lines(
                    "services:",
                    ...service("web", 'PORT: "80"'),
                    ...service(name, 'PORT: "9000"'),
                    "",
                );

                const result = rewriter.rewrite(compose, [], new Map());

                expect(result.envVars).toEqual({PORT: "80", [expected]: "9000"});
            });

            it("never uses a reserved name", () => {
                const reserved = new ComposeRewriter(() => new Set(["PORT"]));
                const compose = lines("services:", ...service("web", 'PORT: "80"'), "");

                const result = reserved.rewrite(compose, [], new Map());

                expect(result.rewrittenCompose).toBe(lines("services:", ...service("web", 'PORT: "${WEB_PORT}"'), ""));
                expect(result.extractedEnv).toBe("WEB_PORT=80");
            });

            it("reserves the variables of Docktor's own process environment by default", () => {
                vi.stubEnv("DOCKTOR_TEST_SHADOW", "x");
                try {
                    const compose = lines("services:", ...service("web", "DOCKTOR_TEST_SHADOW: y"), "");

                    const result = new ComposeRewriter().rewrite(compose, [], new Map());

                    expect(result.envVars).toEqual({WEB_DOCKTOR_TEST_SHADOW: "y"});
                } finally {
                    vi.unstubAllEnvs();
                }
            });
        });

        it("applies the bind-mount conversion and the env extraction in one pass and nothing else", () => {
            const compose = lines(
                "services:",
                "  memos:",
                "    image: neosmemo/memos:stable",
                "    volumes:",
                "      - ./data:/var/opt/memos",
                "    environment:",
                "      MEMOS_MODE: prod",
                "",
            );

            const result = rewriter.rewrite(compose, CONVERT_DATA, new Map());

            expect(result.rewrittenCompose).toBe(
                compose.replace("./data:", "./volumes/data:").replace("MEMOS_MODE: prod", "MEMOS_MODE: ${MEMOS_MODE}"),
            );
            expect(result.extractedEnv).toBe("MEMOS_MODE=prod");
        });
    });
});
