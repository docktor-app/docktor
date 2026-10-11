function formatLocalDate(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
}

/** The downloadable text: title, generation date, a blank line, then one code per line. */
export function buildRecoveryCodesFile(codes: readonly string[], generatedAt: Date): string {
    return [
        "Docktor recovery codes",
        `Generated ${formatLocalDate(generatedAt)}. Each code works once.`,
        "",
        ...codes,
        "",
    ].join("\n");
}

/** Saves text as a file through a temporary object URL, which is revoked straight away. */
export function downloadTextFile(filename: string, text: string): void {
    const url = URL.createObjectURL(new Blob([text], {type: "text/plain"}));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}
