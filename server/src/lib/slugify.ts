export function slugify(input: string): string {
    return input
        .toLowerCase()
        .replaceAll(/[\s_]+/g, "-")
        .replaceAll(/[^a-z0-9-]/g, "")
        .replaceAll(/-{2,}/g, "-")
        .replace(/^-+/, "")
        .replace(/-+$/, "")
        .slice(0, 63)
        // The cut can land right after a hyphen; a slug never ends in one (the migration journal schema relies on it).
        .replace(/-+$/, "");
}
