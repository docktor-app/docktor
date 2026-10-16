import {CST, isMap, isScalar, isSeq, parseDocument, Scalar, type YAMLMap} from "yaml";
import {AppError} from "../lib/errors.js";
import type {ComposeRewriterPort} from "../application/ports/compose-rewriter-port.js";

export interface VolumeSelection {
	originalPath: string;
	newPath: string;
	convert: boolean; // true = copy and rewrite, false = leave as-is
}

export interface RewriteResult {
	rewrittenCompose: string;
	extractedEnv: string;
	envVars: Record<string, string>;
}

/** A replacement of `source[start, end)` by `text`. An insertion has `start === end`. */
interface Splice {
	start: number;
	end: number;
	text: string;
}

const EXTERNAL_FLOW = "{external: true}";

/** Offset of the first character of the line that contains `offset`. */
function lineStart(source: string, offset: number): number {
	return source.lastIndexOf("\n", offset - 1) + 1;
}

/** Offset just past the line terminator of the line that contains `offset` (end of text when unterminated). */
function lineEnd(source: string, offset: number): number {
	const terminator = source.indexOf("\n", offset);
	return terminator === -1 ? source.length : terminator + 1;
}

/** Moves `offset` back over trailing whitespace (spaces, tabs, CR, LF) but never below `floor`. */
function trimEnd(source: string, offset: number, floor: number): number {
	let end = offset;
	while (end > floor && /\s/.test(source.charAt(end - 1))) {
		end--;
	}
	return end;
}

/**
 * Collects edits against the ORIGINAL text and applies them in one pass.
 *
 * The output is never produced by the yaml document's `toString()` or its stringify
 * function: both re-indent and normalise line endings, which is exactly the noise
 * G-18-4 (B) removes. Every byte outside a splice is copied verbatim.
 */
class SourceEdits {
	private readonly splices: Splice[] = [];

	constructor(private readonly source: string) {}

	add(splice: Splice): void {
		this.splices.push(splice);
	}

	/**
	 * Replaces a plain or quoted scalar's value, keeping its quote style and any trailing
	 * comment (the comment lies outside the scalar's `range`). Block scalars are never edited.
	 */
	replaceScalar(node: Scalar, value: string): void {
		const range = node.range;
		const token = node.srcToken;
		if (!range || !token || node.value === value) {
			return;
		}
		if (token.type !== "scalar" && token.type !== "single-quoted-scalar" && token.type !== "double-quoted-scalar") {
			return;
		}
		const replacement = structuredClone(token);
		replacement.end = []; // trailing space/comment/newline stay in the original text
		CST.setScalarValue(replacement, value);
		const text = CST.stringify(replacement);
		if (text === this.source.slice(range[0], range[1])) {
			return;
		}
		this.add({start: range[0], end: range[1], text});
	}

	/** Removes every line from the one containing `from` through the one holding `contentEnd`. */
	removeLines(from: number, contentEnd: number): void {
		this.add({start: lineStart(this.source, from), end: lineEnd(this.source, contentEnd), text: ""});
	}

	apply(): string {
		const ordered = [...this.splices].sort((a, b) => a.start - b.start || a.end - b.end);
		let result = "";
		let cursor = 0;
		for (const splice of ordered) {
			if (splice.start < cursor) {
				throw new AppError("Compose rewrite produced overlapping edits");
			}
			result += this.source.slice(cursor, splice.start) + splice.text;
			cursor = splice.end;
		}
		return result + this.source.slice(cursor);
	}
}

/** Lookup of which volume references the user chose to convert (the rewrite rules, no text handling). */
class VolumeRules {
	private readonly bindRewrites = new Map<string, string>();

	constructor(
		volumeSelections: VolumeSelection[],
		private readonly namedVolumeSelections: Map<string, boolean>,
	) {
		for (const selection of volumeSelections) {
			if (selection.convert) {
				this.bindRewrites.set(selection.originalPath, selection.newPath);
			}
		}
	}

	isConverted(volumeName: string): boolean {
		return this.namedVolumeSelections.get(volumeName) === true;
	}

	bindTarget(hostPath: string): string | undefined {
		const newPath = this.bindRewrites.get(hostPath);
		return newPath || undefined;
	}

	namedTarget(volumeName: string): string {
		return `./volumes/${volumeName}`;
	}

	/** New text of a short-form entry (`host:container[:mode]`), or undefined when it stays as it is. */
	shortForm(entry: string): string | undefined {
		const [hostPath, ...rest] = entry.split(":");
		const isNamedReference = !hostPath.startsWith(".") && !hostPath.startsWith("/");
		const target = isNamedReference
			? (this.isConverted(hostPath) ? this.namedTarget(hostPath) : undefined)
			: this.bindTarget(hostPath);
		return target === undefined ? undefined : [target, ...rest].join(":");
	}
}

/** Position of the `:` that follows a mapping key, as the offset just past it. */
function colonEnd(source: string, keyEnd: number): number {
	return source.indexOf(":", keyEnd) + 1;
}

function declaresExternal(value: unknown): boolean {
	if (!isMap(value)) {
		return false;
	}
	const external = value.get("external");
	return external === true || isMap(external); // legacy `external: {name: ...}` is still external
}

type VolumeEntry = YAMLMap["items"][number];

/** Plans the edits for one compose document. */
class ComposeEditPlan {
	private readonly edits: SourceEdits;

	constructor(
		private readonly source: string,
		private readonly rules: VolumeRules,
	) {
		this.edits = new SourceEdits(source);
	}

	rewriteServiceVolumes(service: YAMLMap): void {
		const volumes = service.get("volumes", true);
		if (!isSeq(volumes)) {
			return;
		}
		for (const entry of volumes.items) {
			if (isScalar(entry) && typeof entry.value === "string") {
				const rewritten = this.rules.shortForm(entry.value);
				if (rewritten !== undefined) {
					this.edits.replaceScalar(entry, rewritten);
				}
			} else if (isMap(entry)) {
				this.rewriteLongForm(entry);
			}
		}
	}

	// CR-03: long-form entries ({type, source, target}) rewrite only their `source` (and `type`
	// for a converted named volume), so migrated data and the compose file agree.
	private rewriteLongForm(entry: YAMLMap): void {
		const source = entry.get("source", true);
		if (!isScalar(source) || typeof source.value !== "string") {
			return;
		}
		const type = entry.get("type", true);
		const kind = isScalar(type) ? type.value : undefined;
		if (kind === "bind") {
			const target = this.rules.bindTarget(source.value);
			if (target !== undefined) {
				this.edits.replaceScalar(source, target);
			}
		} else if (kind === "volume" && this.rules.isConverted(source.value) && isScalar(type)) {
			this.edits.replaceScalar(type, "bind");
			this.edits.replaceScalar(source, this.rules.namedTarget(source.value));
		}
	}

	/** Top-level `volumes:` — converted entries disappear, every other one is declared external. */
	rewriteTopLevelVolumes(root: YAMLMap): void {
		const block = root.items.find(pair => isScalar(pair.key) && pair.key.value === "volumes");
		if (!block || !isScalar(block.key) || !block.key.range || !isMap(block.value) || !block.value.range) {
			return;
		}
		const entries = block.value.items;
		if (entries.length === 0) {
			return;
		}
		const kept = entries.filter(pair => !this.isConvertedEntry(pair));
		if (kept.length === 0) {
			// Every entry became a bind mount: drop the `volumes:` key with its whole block.
			this.edits.removeLines(block.key.range[0], this.contentEnd(block.value.range[1], block.key.range[1]));
		} else if (block.value.flow) {
			this.rewriteFlowVolumes(block.value, kept);
		} else {
			for (const pair of entries) {
				if (this.isConvertedEntry(pair)) {
					this.removeEntry(pair);
				} else if (this.needsExternal(pair)) {
					this.markExternal(pair);
				}
			}
		}
	}

	private isConvertedEntry(pair: VolumeEntry): boolean {
		return isScalar(pair.key) && this.rules.isConverted(String(pair.key.value));
	}

	private needsExternal(pair: VolumeEntry): boolean {
		return isScalar(pair.key) && !declaresExternal(pair.value);
	}

	private contentEnd(rangeEnd: number, floor: number): number {
		return trimEnd(this.source, rangeEnd, floor);
	}

	/** End of the last content character the entry occupies (its key's `:` when the value is empty). */
	private entryEnd(pair: VolumeEntry): number {
		const keyEnd = isScalar(pair.key) && pair.key.range ? pair.key.range[1] : 0;
		const floor = colonEnd(this.source, keyEnd);
		const range = isScalar(pair.value) || isMap(pair.value) ? pair.value.range : undefined;
		return range && range[1] > range[0] ? this.contentEnd(range[1], floor) : floor;
	}

	private removeEntry(pair: VolumeEntry): void {
		if (isScalar(pair.key) && pair.key.range) {
			this.edits.removeLines(pair.key.range[0], this.entryEnd(pair));
		}
	}

	private markExternal(pair: VolumeEntry): void {
		if (isScalar(pair.key) && pair.key.range) {
			const start = colonEnd(this.source, pair.key.range[1]);
			this.edits.add({start, end: this.entryEnd(pair), text: ` ${EXTERNAL_FLOW}`});
		}
	}

	/** `volumes: {a: {}, b: {}}` has no lines of its own to cut, so the one flow map is rebuilt. */
	private rewriteFlowVolumes(volumes: YAMLMap, kept: VolumeEntry[]): void {
		const range = volumes.range;
		const texts = kept.map(pair => this.flowEntryText(pair));
		const changed = kept.length < volumes.items.length || kept.some(pair => this.needsExternal(pair));
		if (!range || !changed || texts.some(text => text === undefined)) {
			return;
		}
		this.edits.add({start: range[0], end: this.contentEnd(range[1], range[0]), text: `{${texts.join(", ")}}`});
	}

	private flowEntryText(pair: VolumeEntry): string | undefined {
		if (!isScalar(pair.key) || !pair.key.range) {
			return undefined;
		}
		const key = this.source.slice(pair.key.range[0], pair.key.range[1]);
		return this.needsExternal(pair)
			? `${key}: ${EXTERNAL_FLOW}`
			: this.source.slice(pair.key.range[0], this.entryEnd(pair));
	}

	apply(): string {
		return this.edits.apply();
	}
}

/**
 * Rewrites a compose file for the migration flow (MIG-02, G-18-4 B).
 *
 * The rewrite edits only the nodes it must change and leaves every other byte of the user's
 * file in place: indentation, comments, quoting and line endings survive, so the review
 * step's line diff shows exactly the real changes.
 */
export class ComposeRewriter implements ComposeRewriterPort {
	/**
	 * Rewrite compose file:
	 * 1. Update volume paths based on selections
	 * 2. Mark unconverted named volumes as external
	 *
	 * A document that does not parse, or has no `services` map, is returned unchanged.
	 */
	rewrite(
		originalCompose: string,
		volumeSelections: VolumeSelection[],
		namedVolumeSelections: Map<string, boolean>, // volumeName -> convert (true = bind mount, false = keep as named)
	): RewriteResult {
		const unchanged: RewriteResult = {rewrittenCompose: originalCompose, extractedEnv: "", envVars: {}};
		const doc = parseDocument(originalCompose, {keepSourceTokens: true});
		const root = doc.contents;
		if (doc.errors.length > 0 || !isMap(root)) {
			return unchanged;
		}
		const services = root.get("services", true);
		if (!isMap(services)) {
			return unchanged;
		}

		const plan = new ComposeEditPlan(originalCompose, new VolumeRules(volumeSelections, namedVolumeSelections));
		for (const pair of services.items) {
			if (isMap(pair.value)) {
				plan.rewriteServiceVolumes(pair.value);
			}
		}
		plan.rewriteTopLevelVolumes(root);

		return {...unchanged, rewrittenCompose: plan.apply()};
	}
}

export const composeRewriter = new ComposeRewriter();
