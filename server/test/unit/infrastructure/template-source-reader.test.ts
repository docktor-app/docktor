import {afterEach, describe, expect, it} from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {TemplateSourceReader} from "../../../src/infrastructure/template-source-reader.js";

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
});
