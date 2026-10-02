import {afterEach, describe, expect, it} from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
    MAX_COMPOSE_BYTES,
    MAX_ICON_BYTES,
    MAX_VARIANTS_PER_REPO,
    TemplateSourceReader,
} from "../../../src/infrastructure/template-source-reader.js";

const VALID_TEMPLATE_YML = "schemaVersion: 1\nname: Whoami\ndescription: Shows request headers\ncategory: Utilities\n";
const VALID_VARIANT_YML = "name: Default\ndescription: The default variant\n";
const VALID_COMPOSE_YML = "services:\n  whoami:\n    image: traefik/whoami\n";

async function writeFixtureFile(root: string, relPath: string, content: string): Promise<void> {
    const fullPath = path.join(root, relPath);
    await fs.mkdir(path.dirname(fullPath), {recursive: true});
    await fs.writeFile(fullPath, content, "utf-8");
}

describe("TemplateSourceReader", () => {
    const tempDirs: string[] = [];

    async function mkTempDir(): Promise<string> {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), "docktor-template-reader-"));
        tempDirs.push(dir);
        return dir;
    }

    afterEach(async () => {
        for (const dir of tempDirs.splice(0)) {
            await fs.rm(dir, {recursive: true, force: true});
        }
    });

    it("reads one valid template with one valid variant back as a hashed index (tracer)", async () => {
        const root = await mkTempDir();
        await writeFixtureFile(
            root,
            "templates/whoami/template.yml",
            "schemaVersion: 1\nname: Whoami\ndescription: Shows request headers\ncategory: Utilities\n",
        );
        const composeContent = "services:\n  whoami:\n    image: traefik/whoami\n";
        await writeFixtureFile(root, "templates/whoami/default/variant.yml", "name: Default\ndescription: The default variant\n");
        await writeFixtureFile(root, "templates/whoami/default/docker-compose.yml", composeContent);

        const reader = new TemplateSourceReader();
        const index = await reader.readCheckout(root);

        expect(index.issues).toEqual([]);
        expect(index.templates).toHaveLength(1);
        const [template] = index.templates;
        expect(template).toMatchObject({
            slug: "whoami",
            name: "Whoami",
            category: "Utilities",
            iconDataUri: null,
        });
        expect(template.variants).toHaveLength(1);
        const [variant] = template.variants;
        expect(variant.slug).toBe("default");
        expect(variant.composeContent).toBe(composeContent);
        expect(variant.envContent).toBeNull();
        expect(variant.contentHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("reading the same checkout twice yields deep-equal output (deterministic)", async () => {
        const root = await mkTempDir();
        await writeFixtureFile(
            root,
            "templates/whoami/template.yml",
            "schemaVersion: 1\nname: Whoami\ndescription: Shows request headers\ncategory: Utilities\n",
        );
        await writeFixtureFile(root, "templates/whoami/default/variant.yml", "name: Default\ndescription: The default variant\n");
        await writeFixtureFile(root, "templates/whoami/default/docker-compose.yml", "services:\n  whoami:\n    image: traefik/whoami\n");

        const reader = new TemplateSourceReader();
        const first = await reader.readCheckout(root);
        const second = await reader.readCheckout(root);

        expect(second).toEqual(first);
    });

    it("returns zero templates and zero issues when the checkout has no templates/ directory", async () => {
        const root = await mkTempDir();
        const reader = new TemplateSourceReader();
        const index = await reader.readCheckout(root);
        expect(index).toEqual({templates: [], issues: []});
    });

    it("rejects a non-slug template directory name and still returns a valid sibling", async () => {
        const root = await mkTempDir();
        await writeFixtureFile(root, "templates/Bad_Name/template.yml", VALID_TEMPLATE_YML);
        await writeFixtureFile(root, "templates/Bad_Name/default/variant.yml", VALID_VARIANT_YML);
        await writeFixtureFile(root, "templates/Bad_Name/default/docker-compose.yml", VALID_COMPOSE_YML);
        await writeFixtureFile(root, "templates/good-one/template.yml", VALID_TEMPLATE_YML);
        await writeFixtureFile(root, "templates/good-one/default/variant.yml", VALID_VARIANT_YML);
        await writeFixtureFile(root, "templates/good-one/default/docker-compose.yml", VALID_COMPOSE_YML);

        const reader = new TemplateSourceReader();
        const index = await reader.readCheckout(root);

        expect(index.templates.map((t) => t.slug)).toEqual(["good-one"]);
        expect(index.issues).toEqual([{path: "templates/Bad_Name", message: "non-slug directory name"}]);
    });

    it("reports template.yml missing", async () => {
        const root = await mkTempDir();
        await writeFixtureFile(root, "templates/whoami/default/variant.yml", VALID_VARIANT_YML);
        await writeFixtureFile(root, "templates/whoami/default/docker-compose.yml", VALID_COMPOSE_YML);

        const reader = new TemplateSourceReader();
        const index = await reader.readCheckout(root);

        expect(index.templates).toHaveLength(0);
        expect(index.issues).toEqual([{path: "templates/whoami/template.yml", message: "template.yml missing"}]);
    });

    it("reports invalid YAML in template.yml", async () => {
        const root = await mkTempDir();
        await writeFixtureFile(root, "templates/whoami/template.yml", "schemaVersion: 1\nname: [unterminated\n");
        await writeFixtureFile(root, "templates/whoami/default/variant.yml", VALID_VARIANT_YML);
        await writeFixtureFile(root, "templates/whoami/default/docker-compose.yml", VALID_COMPOSE_YML);

        const reader = new TemplateSourceReader();
        const index = await reader.readCheckout(root);

        expect(index.templates).toHaveLength(0);
        expect(index.issues).toHaveLength(1);
        expect(index.issues[0].path).toBe("templates/whoami/template.yml");
        expect(index.issues[0].message).toMatch(/invalid YAML/);
    });

    it("reports a template.yml schema failure naming the failing field", async () => {
        const root = await mkTempDir();
        // Missing required "category" field.
        await writeFixtureFile(root, "templates/whoami/template.yml", "schemaVersion: 1\nname: Whoami\ndescription: d\n");
        await writeFixtureFile(root, "templates/whoami/default/variant.yml", VALID_VARIANT_YML);
        await writeFixtureFile(root, "templates/whoami/default/docker-compose.yml", VALID_COMPOSE_YML);

        const reader = new TemplateSourceReader();
        const index = await reader.readCheckout(root);

        expect(index.templates).toHaveLength(0);
        expect(index.issues).toHaveLength(1);
        expect(index.issues[0].path).toBe("templates/whoami/template.yml");
        expect(index.issues[0].message).toContain("category");
    });

    it("skips a variant missing required variant.yml `name` but keeps a valid sibling variant", async () => {
        const root = await mkTempDir();
        await writeFixtureFile(root, "templates/whoami/template.yml", VALID_TEMPLATE_YML);
        await writeFixtureFile(root, "templates/whoami/broken/variant.yml", "description: d\n");
        await writeFixtureFile(root, "templates/whoami/broken/docker-compose.yml", VALID_COMPOSE_YML);
        await writeFixtureFile(root, "templates/whoami/default/variant.yml", VALID_VARIANT_YML);
        await writeFixtureFile(root, "templates/whoami/default/docker-compose.yml", VALID_COMPOSE_YML);

        const reader = new TemplateSourceReader();
        const index = await reader.readCheckout(root);

        expect(index.templates).toHaveLength(1);
        expect(index.templates[0].variants.map((v) => v.slug)).toEqual(["default"]);
        expect(index.issues).toEqual([
            {path: "templates/whoami/broken/variant.yml", message: expect.stringContaining("name")},
        ]);
    });

    it("skips a variant with docker-compose.yml missing", async () => {
        const root = await mkTempDir();
        await writeFixtureFile(root, "templates/whoami/template.yml", VALID_TEMPLATE_YML);
        await writeFixtureFile(root, "templates/whoami/broken/variant.yml", VALID_VARIANT_YML);
        await writeFixtureFile(root, "templates/whoami/default/variant.yml", VALID_VARIANT_YML);
        await writeFixtureFile(root, "templates/whoami/default/docker-compose.yml", VALID_COMPOSE_YML);

        const reader = new TemplateSourceReader();
        const index = await reader.readCheckout(root);

        expect(index.templates).toHaveLength(1);
        expect(index.templates[0].variants.map((v) => v.slug)).toEqual(["default"]);
        expect(index.issues).toEqual([
            {path: "templates/whoami/broken/docker-compose.yml", message: "docker-compose.yml missing"},
        ]);
    });

    it("skips a variant whose compose has no services", async () => {
        const root = await mkTempDir();
        await writeFixtureFile(root, "templates/whoami/template.yml", VALID_TEMPLATE_YML);
        await writeFixtureFile(root, "templates/whoami/broken/variant.yml", VALID_VARIANT_YML);
        await writeFixtureFile(root, "templates/whoami/broken/docker-compose.yml", "version: '3'\n");
        await writeFixtureFile(root, "templates/whoami/default/variant.yml", VALID_VARIANT_YML);
        await writeFixtureFile(root, "templates/whoami/default/docker-compose.yml", VALID_COMPOSE_YML);

        const reader = new TemplateSourceReader();
        const index = await reader.readCheckout(root);

        expect(index.templates).toHaveLength(1);
        expect(index.templates[0].variants.map((v) => v.slug)).toEqual(["default"]);
        expect(index.issues).toHaveLength(1);
        expect(index.issues[0].path).toBe("templates/whoami/broken/docker-compose.yml");
        expect(index.issues[0].message).toMatch(/invalid compose file/);
    });

    it("skips a variant whose compose file exceeds MAX_COMPOSE_BYTES", async () => {
        const root = await mkTempDir();
        await writeFixtureFile(root, "templates/whoami/template.yml", VALID_TEMPLATE_YML);
        await writeFixtureFile(root, "templates/whoami/broken/variant.yml", VALID_VARIANT_YML);
        await writeFixtureFile(root, "templates/whoami/broken/docker-compose.yml", "x".repeat(MAX_COMPOSE_BYTES + 1));
        await writeFixtureFile(root, "templates/whoami/default/variant.yml", VALID_VARIANT_YML);
        await writeFixtureFile(root, "templates/whoami/default/docker-compose.yml", VALID_COMPOSE_YML);

        const reader = new TemplateSourceReader();
        const index = await reader.readCheckout(root);

        expect(index.templates).toHaveLength(1);
        expect(index.templates[0].variants.map((v) => v.slug)).toEqual(["default"]);
        expect(index.issues).toEqual([
            {path: "templates/whoami/broken/docker-compose.yml", message: expect.stringContaining("exceeds the maximum compose size")},
        ]);
    });

    it("rejects a docker-compose.yml that is a symlink", async (ctx) => {
        const root = await mkTempDir();
        await writeFixtureFile(root, "templates/whoami/template.yml", VALID_TEMPLATE_YML);
        await writeFixtureFile(root, "templates/whoami/default/variant.yml", VALID_VARIANT_YML);
        const realComposePath = path.join(root, "templates/whoami/default/real-compose.yml");
        await fs.writeFile(realComposePath, VALID_COMPOSE_YML, "utf-8");
        const linkPath = path.join(root, "templates/whoami/default/docker-compose.yml");
        try {
            await fs.symlink(realComposePath, linkPath);
        } catch {
            ctx.skip();
            return;
        }

        const reader = new TemplateSourceReader();
        const index = await reader.readCheckout(root);

        expect(index.templates).toHaveLength(0);
        expect(index.issues).toEqual([
            {path: "templates/whoami/default/docker-compose.yml", message: "not a regular file (symlinks are not allowed)"},
            {path: "templates/whoami", message: "no valid variants — template skipped"},
        ]);
    });

    it("keeps the template but nulls the icon when it exceeds MAX_ICON_BYTES", async () => {
        const root = await mkTempDir();
        await writeFixtureFile(root, "templates/whoami/template.yml", VALID_TEMPLATE_YML.trimEnd() + "\nicon: icon.svg\n");
        await writeFixtureFile(root, "templates/whoami/icon.svg", "x".repeat(MAX_ICON_BYTES + 1));
        await writeFixtureFile(root, "templates/whoami/default/variant.yml", VALID_VARIANT_YML);
        await writeFixtureFile(root, "templates/whoami/default/docker-compose.yml", VALID_COMPOSE_YML);

        const reader = new TemplateSourceReader();
        const index = await reader.readCheckout(root);

        expect(index.templates).toHaveLength(1);
        expect(index.templates[0].iconDataUri).toBeNull();
        expect(index.issues).toEqual([
            {path: "templates/whoami/icon.svg", message: expect.stringContaining("exceeds the maximum icon size")},
        ]);
    });

    it("embeds a small icon.svg as a data:image/svg+xml;base64 URI", async () => {
        const root = await mkTempDir();
        await writeFixtureFile(root, "templates/whoami/template.yml", VALID_TEMPLATE_YML.trimEnd() + "\nicon: icon.svg\n");
        await writeFixtureFile(root, "templates/whoami/icon.svg", "<svg></svg>");
        await writeFixtureFile(root, "templates/whoami/default/variant.yml", VALID_VARIANT_YML);
        await writeFixtureFile(root, "templates/whoami/default/docker-compose.yml", VALID_COMPOSE_YML);

        const reader = new TemplateSourceReader();
        const index = await reader.readCheckout(root);

        expect(index.templates[0].iconDataUri).toBe(`data:image/svg+xml;base64,${Buffer.from("<svg></svg>").toString("base64")}`);
    });

    it("embeds a small icon.png as a data:image/png;base64 URI", async () => {
        const root = await mkTempDir();
        await writeFixtureFile(root, "templates/whoami/template.yml", VALID_TEMPLATE_YML.trimEnd() + "\nicon: icon.png\n");
        const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
        await fs.mkdir(path.join(root, "templates/whoami"), {recursive: true});
        await fs.writeFile(path.join(root, "templates/whoami/icon.png"), pngBytes);
        await writeFixtureFile(root, "templates/whoami/default/variant.yml", VALID_VARIANT_YML);
        await writeFixtureFile(root, "templates/whoami/default/docker-compose.yml", VALID_COMPOSE_YML);

        const reader = new TemplateSourceReader();
        const index = await reader.readCheckout(root);

        expect(index.templates[0].iconDataUri).toBe(`data:image/png;base64,${pngBytes.toString("base64")}`);
    });

    it("skips a template whose variants are all invalid", async () => {
        const root = await mkTempDir();
        await writeFixtureFile(root, "templates/whoami/template.yml", VALID_TEMPLATE_YML);
        await writeFixtureFile(root, "templates/whoami/broken/variant.yml", "description: d\n");

        const reader = new TemplateSourceReader();
        const index = await reader.readCheckout(root);

        expect(index.templates).toHaveLength(0);
        expect(index.issues.some((i) => i.message === "no valid variants — template skipped" && i.path === "templates/whoami")).toBe(true);
    });

    it("caps variants at MAX_VARIANTS_PER_REPO with one summary issue, skipping the rest", async () => {
        const root = await mkTempDir();
        await writeFixtureFile(root, "templates/whoami/template.yml", VALID_TEMPLATE_YML);
        const variantCount = MAX_VARIANTS_PER_REPO + 1;
        for (let i = 0; i < variantCount; i++) {
            const slug = `v${String(i).padStart(4, "0")}`;
            await writeFixtureFile(root, `templates/whoami/${slug}/variant.yml`, VALID_VARIANT_YML);
            await writeFixtureFile(root, `templates/whoami/${slug}/docker-compose.yml`, VALID_COMPOSE_YML);
        }

        const reader = new TemplateSourceReader();
        const index = await reader.readCheckout(root);

        const totalVariants = index.templates.reduce((sum, t) => sum + t.variants.length, 0);
        expect(totalVariants).toBe(MAX_VARIANTS_PER_REPO);
        const capIssues = index.issues.filter((i) => i.message.includes("remaining variants were skipped"));
        expect(capIssues).toHaveLength(1);
    }, 20_000);
});
