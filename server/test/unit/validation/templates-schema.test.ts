import {describe, expect, it} from "vitest";
import {
    isAllowedGitRemoteUrl,
    templateManifestSchema,
    templateRepoUrlSchema,
    templateSlugSchema,
    templateVariantManifestSchema,
} from "@docktor/shared";

describe("templateRepoUrlSchema / isAllowedGitRemoteUrl", () => {
    it.each([
        "https://github.com/docktor-app/templates",
        "https://gitlab.example.com/org/repo.git",
        "git://example.com/repo.git",
        "ssh://example.com/repo.git",
    ])("accepts %s", (url) => {
        expect(templateRepoUrlSchema.safeParse(url).success).toBe(true);
        expect(isAllowedGitRemoteUrl(url)).toBe(true);
    });

    it.each([
        ["file:///etc", "file transport is not in the default allowlist"],
        ["ext::sh -c id", "ext:: transport-helper syntax"],
        ["-uhttps://x", "leading dash looks like a flag"],
        ["https://user:pw@host/repo.git", "embedded credentials"],
        // T-12-17: private repos (and the ssh://git@host shorthand used to
        // reach them) are explicitly out of scope for #19 — any embedded
        // username is rejected, even the conventional git-hosting "git" user.
        ["ssh://git@example.com/repo.git", "embedded ssh username"],
        ["", "empty string"],
        ["   ", "whitespace only"],
        ["not a url at all", "garbage, not a URL"],
        ["ftp://example.com/repo", "unsupported transport"],
    ])("rejects %s (%s)", (url) => {
        expect(templateRepoUrlSchema.safeParse(url).success).toBe(false);
        expect(isAllowedGitRemoteUrl(url)).toBe(false);
    });

    it("allows file:// only when explicitly opted into via the protocols argument", () => {
        expect(isAllowedGitRemoteUrl("file:///tmp/x")).toBe(false);
        expect(isAllowedGitRemoteUrl("file:///tmp/x", ["file"])).toBe(true);
    });
});

describe("templateSlugSchema", () => {
    it.each(["nextcloud", "with-redis", "a", "a1-b2"])("accepts %s", (slug) => {
        expect(templateSlugSchema.safeParse(slug).success).toBe(true);
    });

    it.each(["Nextcloud", "with_redis", "-leading-hyphen", "", "a".repeat(64)])("rejects %s", (slug) => {
        expect(templateSlugSchema.safeParse(slug).success).toBe(false);
    });
});

describe("templateManifestSchema", () => {
    it("accepts a valid manifest without an icon", () => {
        const result = templateManifestSchema.safeParse({
            schemaVersion: 1,
            name: "Nextcloud",
            description: "A self-hosted productivity platform",
            category: "Productivity",
        });
        expect(result.success).toBe(true);
    });

    it("accepts a valid manifest with an svg or png icon", () => {
        expect(
            templateManifestSchema.safeParse({
                schemaVersion: 1,
                name: "Nextcloud",
                description: "d",
                category: "Productivity",
                icon: "icon.svg",
            }).success,
        ).toBe(true);
        expect(
            templateManifestSchema.safeParse({
                schemaVersion: 1,
                name: "Nextcloud",
                description: "d",
                category: "Productivity",
                icon: "icon.png",
            }).success,
        ).toBe(true);
    });

    it("rejects a schemaVersion other than 1", () => {
        expect(
            templateManifestSchema.safeParse({
                schemaVersion: 2,
                name: "Nextcloud",
                description: "d",
                category: "Productivity",
            }).success,
        ).toBe(false);
    });

    it("rejects an icon filename with an unsupported extension", () => {
        expect(
            templateManifestSchema.safeParse({
                schemaVersion: 1,
                name: "Nextcloud",
                description: "d",
                category: "Productivity",
                icon: "icon.jpg",
            }).success,
        ).toBe(false);
    });

    it("rejects a missing required field", () => {
        expect(
            templateManifestSchema.safeParse({
                schemaVersion: 1,
                name: "Nextcloud",
                description: "d",
            }).success,
        ).toBe(false);
    });
});

describe("templateVariantManifestSchema", () => {
    it("accepts a valid variant manifest with and without usage", () => {
        expect(templateVariantManifestSchema.safeParse({name: "Default", description: "d"}).success).toBe(true);
        expect(
            templateVariantManifestSchema.safeParse({name: "Default", description: "d", usage: "Visit http://localhost"})
                .success,
        ).toBe(true);
    });

    it("rejects a manifest missing the required name field", () => {
        expect(templateVariantManifestSchema.safeParse({description: "d"}).success).toBe(false);
    });
});
