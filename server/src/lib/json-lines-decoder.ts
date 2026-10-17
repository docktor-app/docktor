import {StringDecoder} from "node:string_decoder";

const DEFAULT_MAX_LINE_LENGTH = 1_048_576;

/**
 * Decodes a newline-delimited JSON stream (NDJSON) chunk by chunk.
 *
 * Docker's events endpoint streams one JSON document per line; the HTTP
 * chunking is unrelated to event boundaries, so a chunk can carry several
 * events, or half of one. Bytes are decoded through a `StringDecoder` so a
 * multi-byte character split across chunks survives, and the trailing partial
 * line stays pending until its newline arrives.
 *
 * The pending partial line is bounded by `maxLineLength`: a line that grows
 * past it is discarded and input is ignored up to the next newline, so a
 * stream that never terminates a line cannot grow memory without bound in this
 * long-lived subscription.
 *
 * One decoder belongs to one stream: a reconnect must start from a new
 * instance so leftovers of the dead stream are never prefixed to its events.
 */
export class JsonLinesDecoder {
    private readonly utf8 = new StringDecoder("utf8");
    private readonly maxLineLength: number;
    private pending = "";
    // True while the rest of an over-long line is being skipped up to its newline.
    private discarding = false;

    constructor(options: {maxLineLength?: number} = {}) {
        this.maxLineLength = options.maxLineLength ?? DEFAULT_MAX_LINE_LENGTH;
    }

    push(chunk: Buffer | string): unknown[] {
        const text = this.skipDiscardedPart(typeof chunk === "string" ? chunk : this.utf8.write(chunk));
        if (text === "") return [];

        const lines = (this.pending + text).split("\n");
        this.pending = lines.pop() ?? "";

        const values: unknown[] = [];
        for (const rawLine of lines) {
            const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
            if (line.trim() === "") continue;
            this.decodeLine(line, values);
        }

        if (this.pending.length > this.maxLineLength) {
            console.warn(`[JsonLinesDecoder] discarded an unterminated line over ${this.maxLineLength} characters`);
            this.pending = "";
            this.discarding = true;
        }
        return values;
    }

    // While discarding, input up to and including the next newline is dropped.
    private skipDiscardedPart(text: string): string {
        if (!this.discarding) return text;
        const newline = text.indexOf("\n");
        if (newline === -1) return "";
        this.discarding = false;
        return text.slice(newline + 1);
    }

    private decodeLine(line: string, values: unknown[]): void {
        // Lengths only in warnings: event labels can contain host paths.
        if (line.length > this.maxLineLength) {
            console.warn(`[JsonLinesDecoder] skipped over-long line (${line.length} characters)`);
            return;
        }
        try {
            values.push(JSON.parse(line));
        } catch {
            console.warn(`[JsonLinesDecoder] skipped malformed line (${line.length} characters)`);
        }
    }
}
