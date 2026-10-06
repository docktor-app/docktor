import fs from "node:fs/promises";
import type {Stats} from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {parse as parseYaml} from "yaml";
import {
    TEMPLATE_SLUG_PATTERN,
    templateManifestSchema,
    templateVariantManifestSchema,
    type TemplateManifest,
    type TemplateVariantManifest,
} from "@docktor/shared";
import {createComposeConfig} from "../domain/compose-config.js";
import type {
    ParsedTemplate,
    ParsedTemplateVariant,
    TemplateSourceIndex,
    TemplateSourceIssue,
    TemplateSourceReaderPort,
} from "../application/ports/template-source-reader-port.js";

export const MAX_COMPOSE_BYTES = 256 * 1024;
export const MAX_ENV_BYTES = 64 * 1024;
export const MAX_MANIFEST_BYTES = 16 * 1024;
export const MAX_ICON_BYTES = 64 * 1024;
export const MAX_VARIANTS_PER_REPO = 500;

const TEMPLATES_SUBDIR = "templates";
const MANIFEST_FILE = "template.yml";
const VARIANT_MANIFEST_FILE = "variant.yml";
const COMPOSE_FILE = "docker-compose.yml";
const ENV_FILE = ".env.example";

async function lstatOrNull(filePath: string): Promise<Stats | null> {
    try {
        return await fs.lstat(filePath);
    } catch {
        return null;
    }
}

function iconMimeType(filename: string): string | null {
    if (filename.endsWith(".svg")) return "image/svg+xml";
    if (filename.endsWith(".png")) return "image/png";
    return null;
}

function firstZodIssueMessage(error: {issues: {path: PropertyKey[]; message: string}[]}): string {
    const issue = error.issues[0];
    if (!issue) return "failed schema validation";
    return issue.path.length > 0 ? `${issue.path.map(String).join(".")}: ${issue.message}` : issue.message;
}

/**
 * Walks a git checkout's `templates/<template>/template.yml` +
 * `templates/<template>/<variant>/` layout (D-06) and returns a validated,
 * deterministic index. Every file and directory it opens is checked with
 * `lstat` first — a symlink is never followed and is always rejected,
 * closing T-12-14 (a hostile repo cannot use a symlink to make Docktor read
 * an arbitrary host file into the template index). A malformed template or
 * variant never throws: it is excluded and reported in `issues` by relative
 * path, and a valid sibling still loads.
 */
export class TemplateSourceReader implements TemplateSourceReaderPort {
    async readCheckout(checkoutDir: string): Promise<TemplateSourceIndex> {
        const templatesDir = path.join(checkoutDir, TEMPLATES_SUBDIR);
        const templatesDirStat = await lstatOrNull(templatesDir);
        if (!templatesDirStat || !templatesDirStat.isDirectory()) {
            return {templates: [], issues: []};
        }

        const issues: TemplateSourceIssue[] = [];
        const templates: ParsedTemplate[] = [];
        let variantsAdded = 0;
        let variantCapReached = false;

        const templateSlugs = await this.listDirectoryNames(templatesDir);
        for (const entryName of templateSlugs) {
            if (variantCapReached) break;

            const templateDir = path.join(templatesDir, entryName);
            const relTemplateDir = this.relPath(checkoutDir, templateDir);
            const entryStat = await lstatOrNull(templateDir);

            if (!entryStat) continue;
            if (!entryStat.isDirectory()) {
                // Non-directory entries directly under templates/ (e.g.
                // README.md) are ignored silently; a symlink masquerading as
                // a directory is also rejected here (lstat never follows it).
                continue;
            }
            if (!TEMPLATE_SLUG_PATTERN.test(entryName)) {
                issues.push({path: relTemplateDir, message: "non-slug directory name"});
                continue;
            }

            const manifestResult = await this.loadTemplateManifest(checkoutDir, templateDir, issues);
            if (!manifestResult) continue;

            const variants: ParsedTemplateVariant[] = [];
            const variantSlugs = await this.listDirectoryNames(templateDir);
            for (const variantSlug of variantSlugs) {
                const variantDir = path.join(templateDir, variantSlug);
                const variantStat = await lstatOrNull(variantDir);
                if (!variantStat) continue;
                if (!variantStat.isDirectory()) continue; // manifest/icon files, or a rejected symlink
                if (!TEMPLATE_SLUG_PATTERN.test(variantSlug)) {
                    issues.push({path: this.relPath(checkoutDir, variantDir), message: "non-slug directory name"});
                    continue;
                }

                if (variantsAdded >= MAX_VARIANTS_PER_REPO) {
                    if (!variantCapReached) {
                        variantCapReached = true;
                        issues.push({
                            path: TEMPLATES_SUBDIR,
                            message: `More than ${MAX_VARIANTS_PER_REPO} variants found across this repository — remaining variants were skipped`,
                        });
                    }
                    break;
                }

                const variant = await this.loadVariant(checkoutDir, variantDir, variantSlug, issues);
                if (variant) {
                    variants.push(variant);
                    variantsAdded++;
                }
            }

            if (variants.length === 0) {
                issues.push({path: relTemplateDir, message: "no valid variants — template skipped"});
                if (variantCapReached) break;
                continue;
            }

            templates.push({
                slug: entryName,
                name: manifestResult.manifest.name,
                description: manifestResult.manifest.description,
                category: manifestResult.manifest.category,
                iconDataUri: manifestResult.iconDataUri,
                variants,
            });

            if (variantCapReached) break;
        }

        templates.sort((a, b) => a.slug.localeCompare(b.slug));
        return {templates, issues};
    }

    private relPath(checkoutDir: string, filePath: string): string {
        return path.relative(checkoutDir, filePath).split(path.sep).join("/");
    }

    private async listDirectoryNames(dir: string): Promise<string[]> {
        try {
            const names = await fs.readdir(dir);
            return [...names].sort((a, b) => a.localeCompare(b));
        } catch {
            return [];
        }
    }

    private async loadTemplateManifest(
        checkoutDir: string,
        templateDir: string,
        issues: TemplateSourceIssue[],
    ): Promise<{manifest: TemplateManifest; iconDataUri: string | null} | null> {
        const manifestPath = path.join(templateDir, MANIFEST_FILE);
        const relManifestPath = this.relPath(checkoutDir, manifestPath);
        const stat = await lstatOrNull(manifestPath);

        if (!stat) {
            issues.push({path: relManifestPath, message: "template.yml missing"});
            return null;
        }
        if (!stat.isFile()) {
            issues.push({path: relManifestPath, message: "not a regular file (symlinks are not allowed)"});
            return null;
        }
        if (stat.size > MAX_MANIFEST_BYTES) {
            issues.push({path: relManifestPath, message: `exceeds the maximum manifest size (${MAX_MANIFEST_BYTES} bytes)`});
            return null;
        }

        let parsed: unknown;
        try {
            const content = await fs.readFile(manifestPath, "utf-8");
            parsed = parseYaml(content);
        } catch (err) {
            issues.push({path: relManifestPath, message: `invalid YAML: ${(err as Error).message}`});
            return null;
        }

        const result = templateManifestSchema.safeParse(parsed);
        if (!result.success) {
            issues.push({path: relManifestPath, message: firstZodIssueMessage(result.error)});
            return null;
        }

        const iconDataUri = result.data.icon
            ? await this.loadIcon(checkoutDir, templateDir, result.data.icon, issues)
            : null;

        return {manifest: result.data, iconDataUri};
    }

    private async loadIcon(
        checkoutDir: string,
        templateDir: string,
        iconFilename: string,
        issues: TemplateSourceIssue[],
    ): Promise<string | null> {
        const iconPath = path.join(templateDir, iconFilename);
        const relIconPath = this.relPath(checkoutDir, iconPath);
        const stat = await lstatOrNull(iconPath);

        if (!stat) {
            issues.push({path: relIconPath, message: "icon file missing"});
            return null;
        }
        if (!stat.isFile()) {
            issues.push({path: relIconPath, message: "not a regular file (symlinks are not allowed)"});
            return null;
        }
        if (stat.size > MAX_ICON_BYTES) {
            issues.push({path: relIconPath, message: `exceeds the maximum icon size (${MAX_ICON_BYTES} bytes)`});
            return null;
        }

        const mimeType = iconMimeType(iconFilename);
        if (!mimeType) {
            // Unreachable given templateManifestSchema's icon regex, but kept
            // as a defensive fallback rather than an assertion.
            issues.push({path: relIconPath, message: "unsupported icon type"});
            return null;
        }

        const buffer = await fs.readFile(iconPath);
        return `data:${mimeType};base64,${buffer.toString("base64")}`;
    }

    private async loadVariant(
        checkoutDir: string,
        variantDir: string,
        slug: string,
        issues: TemplateSourceIssue[],
    ): Promise<ParsedTemplateVariant | null> {
        const manifest = await this.loadVariantManifest(checkoutDir, variantDir, issues);
        if (!manifest) return null;

        const composeContent = await this.loadComposeContent(checkoutDir, variantDir, issues);
        if (composeContent === null) return null;

        const envContent = await this.loadEnvContent(checkoutDir, variantDir, issues);
        if (envContent === undefined) return null; // undefined = present but invalid; null = legitimately absent

        const contentHash = createHash("sha256")
            .update(JSON.stringify({variant: manifest, compose: composeContent, env: envContent}))
            .digest("hex");

        return {
            slug,
            name: manifest.name,
            description: manifest.description,
            usage: manifest.usage ?? null,
            composeContent,
            envContent,
            contentHash,
        };
    }

    private async loadVariantManifest(
        checkoutDir: string,
        variantDir: string,
        issues: TemplateSourceIssue[],
    ): Promise<TemplateVariantManifest | null> {
        const manifestPath = path.join(variantDir, VARIANT_MANIFEST_FILE);
        const relManifestPath = this.relPath(checkoutDir, manifestPath);
        const stat = await lstatOrNull(manifestPath);

        if (!stat) {
            issues.push({path: relManifestPath, message: "variant.yml missing"});
            return null;
        }
        if (!stat.isFile()) {
            issues.push({path: relManifestPath, message: "not a regular file (symlinks are not allowed)"});
            return null;
        }
        if (stat.size > MAX_MANIFEST_BYTES) {
            issues.push({path: relManifestPath, message: `exceeds the maximum manifest size (${MAX_MANIFEST_BYTES} bytes)`});
            return null;
        }

        let parsed: unknown;
        try {
            const content = await fs.readFile(manifestPath, "utf-8");
            parsed = parseYaml(content);
        } catch (err) {
            issues.push({path: relManifestPath, message: `invalid YAML: ${(err as Error).message}`});
            return null;
        }

        const result = templateVariantManifestSchema.safeParse(parsed);
        if (!result.success) {
            issues.push({path: relManifestPath, message: firstZodIssueMessage(result.error)});
            return null;
        }
        return result.data;
    }

    private async loadComposeContent(
        checkoutDir: string,
        variantDir: string,
        issues: TemplateSourceIssue[],
    ): Promise<string | null> {
        const composePath = path.join(variantDir, COMPOSE_FILE);
        const relComposePath = this.relPath(checkoutDir, composePath);
        const stat = await lstatOrNull(composePath);

        if (!stat) {
            issues.push({path: relComposePath, message: "docker-compose.yml missing"});
            return null;
        }
        if (!stat.isFile()) {
            issues.push({path: relComposePath, message: "not a regular file (symlinks are not allowed)"});
            return null;
        }
        if (stat.size > MAX_COMPOSE_BYTES) {
            issues.push({path: relComposePath, message: `exceeds the maximum compose size (${MAX_COMPOSE_BYTES} bytes)`});
            return null;
        }

        const content = await fs.readFile(composePath, "utf-8");
        try {
            createComposeConfig(content);
        } catch (err) {
            issues.push({path: relComposePath, message: `invalid compose file: ${(err as Error).message}`});
            return null;
        }
        return content;
    }

    /** Returns null when legitimately absent, a string when present and valid, or undefined on a validation failure. */
    private async loadEnvContent(
        checkoutDir: string,
        variantDir: string,
        issues: TemplateSourceIssue[],
    ): Promise<string | null | undefined> {
        const envPath = path.join(variantDir, ENV_FILE);
        const relEnvPath = this.relPath(checkoutDir, envPath);
        const stat = await lstatOrNull(envPath);

        if (!stat) return null;
        if (!stat.isFile()) {
            issues.push({path: relEnvPath, message: "not a regular file (symlinks are not allowed)"});
            return undefined;
        }
        if (stat.size > MAX_ENV_BYTES) {
            issues.push({path: relEnvPath, message: `exceeds the maximum env size (${MAX_ENV_BYTES} bytes)`});
            return undefined;
        }

        return fs.readFile(envPath, "utf-8");
    }
}

export const templateSourceReader = new TemplateSourceReader();
