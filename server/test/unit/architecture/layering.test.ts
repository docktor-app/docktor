import {describe, expect, it} from "vitest";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

// This test reads the source tree from disk and asserts layering rules
// (CLAUDE.md "Architecture > Server — Layered DDD") as testable facts — no
// imports of the modules under test, no transpilation. A future layering
// regression fails this test instead of requiring a human reviewer to
// notice it. Rules are declared as named cases in RULES below; later plans
// in this phase (10-05, 10-07, 10-10, 10-13, 10-14) append cases here
// rather than writing a second architecture test file.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(__dirname, "../../../src");

function listTsFilesRecursive(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, {withFileTypes: true});
    const files: string[] = [];
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...listTsFilesRecursive(full));
        } else if (entry.isFile() && entry.name.endsWith(".ts")) {
            files.push(full);
        }
    }
    return files;
}

// Line-anchored so a mention inside a comment or a string literal elsewhere
// in the file can never satisfy or violate a rule — only an actual
// top-level `import` statement line is inspected.
function importLines(file: string): string[] {
    const content = fs.readFileSync(file, "utf-8");
    return content.split("\n").filter((line) => /^\s*import\b/.test(line));
}

function relative(file: string): string {
    return path.relative(SRC_ROOT, file).split(path.sep).join("/");
}

interface LayeringRule {
    describeName: string;
    files: string[];
    itName: (file: string) => string;
    forbidden: {label: string; pattern: RegExp}[];
}

const APPLICATION_DIR = path.join(SRC_ROOT, "application");
const APPLICATION_PORTS_DIR = path.join(SRC_ROOT, "application", "ports");
const DOMAIN_DIR = path.join(SRC_ROOT, "domain");
const REPOSITORIES_DIR = path.join(SRC_ROOT, "repositories");

// application/ports/ is excluded — port interfaces are pure type
// declarations, not the service code D-01/D-10 restrict.
const applicationFilesExcludingPorts = listTsFilesRecursive(APPLICATION_DIR).filter(
    (f) => !f.startsWith(APPLICATION_PORTS_DIR + path.sep),
);

const domainFiles = listTsFilesRecursive(DOMAIN_DIR);

const RULES: LayeringRule[] = [
    {
        describeName: "application layer never imports the Prisma client directly (D-10)",
        files: applicationFilesExcludingPorts,
        itName: (file) => `${relative(file)} has no top-level import of lib/db.js`,
        forbidden: [{label: "lib/db.js", pattern: /["'][^"']*\blib\/db\.js["']/}],
    },
    {
        describeName: "application layer never imports the mail transport library directly (D-07)",
        files: applicationFilesExcludingPorts,
        itName: (file) => `${relative(file)} has no top-level import of nodemailer`,
        forbidden: [{label: "nodemailer", pattern: /["']nodemailer["']/}],
    },
    {
        describeName: "domain layer stays pure — no Prisma, no infrastructure, no repositories",
        files: domainFiles,
        itName: (file) => `${relative(file)} has no top-level import of lib/db.js, infrastructure/, or repositories/`,
        forbidden: [
            {label: "lib/db.js", pattern: /["'][^"']*\blib\/db\.js["']/},
            {label: "infrastructure/", pattern: /["'][^"']*\/infrastructure\/[^"']*["']/},
            {label: "repositories/", pattern: /["'][^"']*\/repositories\/[^"']*["']/},
        ],
    },
];

describe("architecture: layering", () => {
    for (const rule of RULES) {
        describe(rule.describeName, () => {
            for (const file of rule.files) {
                it(rule.itName(file), () => {
                    const lines = importLines(file);
                    for (const forbidden of rule.forbidden) {
                        const violations = lines.filter((line) => forbidden.pattern.test(line));
                        expect(
                            violations,
                            `${relative(file)} has a forbidden top-level import of ${forbidden.label}: ${violations.join(", ")}`,
                        ).toHaveLength(0);
                    }
                });
            }
        });
    }

    describe("every repository singleton is published from repositories/index.ts (D-09)", () => {
        const repoFiles = fs
            .readdirSync(REPOSITORIES_DIR)
            .filter((f) => f.endsWith(".ts") && f !== "index.ts");
        const indexContent = fs.readFileSync(path.join(REPOSITORIES_DIR, "index.ts"), "utf-8");
        const indexExportLines = indexContent
            .split("\n")
            .filter((line) => /^\s*export\b/.test(line));

        for (const file of repoFiles) {
            const moduleSpecifier = `./${file.replace(/\.ts$/, ".js")}`;
            it(`repositories/index.ts re-exports a singleton from ${file}`, () => {
                const found = indexExportLines.some((line) => line.includes(moduleSpecifier));
                expect(
                    found,
                    `repositories/index.ts has no export from "${moduleSpecifier}" — every *.ts file under repositories/ other than index.ts must be re-exported as a singleton`,
                ).toBe(true);
            });
        }
    });
});
