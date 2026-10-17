import {StringDecoder} from "node:string_decoder";

/**
 * Decodes a newline-delimited JSON stream (NDJSON) chunk by chunk.
 *
 * Docker's events endpoint streams one JSON document per line; the HTTP
 * chunking is unrelated to event boundaries, so a chunk can carry several
 * events, or half of one. Bytes are decoded through a `StringDecoder` so a
 * multi-byte character split across chunks survives, and the trailing partial
 * line stays pending until its newline arrives.
 *
 * One decoder belongs to one stream: a reconnect must start from a new
 * instance so leftovers of the dead stream are never prefixed to its events.
 */
export class JsonLinesDecoder {
    private readonly utf8 = new StringDecoder("utf8");
    private pending = "";

    push(chunk: Buffer | string): unknown[] {
        this.pending += typeof chunk === "string" ? chunk : this.utf8.write(chunk);

        const lines = this.pending.split("\n");
        this.pending = lines.pop() ?? "";

        const values: unknown[] = [];
        for (const rawLine of lines) {
            const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
            if (line.trim() === "") continue;
            try {
                values.push(JSON.parse(line));
            } catch {
                // Length only: event labels can contain host paths.
                console.warn(`[JsonLinesDecoder] skipped malformed line (${line.length} characters)`);
            }
        }
        return values;
    }
}
