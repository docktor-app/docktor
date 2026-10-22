import {CST, isMap, isScalar, isSeq, parseDocument, Scalar, type YAMLMap} from "yaml";
import {dockerCliEnvironment} from "../lib/compose-env.js";
import {AppError} from "../lib/errors.js";
import {parseEnvAssignments} from "../domain/host-ports.js";
import type {ComposeRewriterPort} from "../application/ports/compose-rewriter-port.js";
import {isVariableReference} from "./compose-analyzer.js";
import {formatDotenvLine, isDotenvSafeValue, isInterpolationName} from "./dotenv-format.js";

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

/** The entry of a kept volume nothing is known about: compose is told it exists elsewhere. */
const EXTERNAL_FLOW = "{external: true}";

/** Plain scalars compose reads back with the same text: booleans and canonical decimal integers. */
const CANONICAL_PLAIN_SCALAR = /^(?:true|false|-?(?:0|[1-9][0-9]*))$/;

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

/** Optional knowledge about the old stack that the rewrite cannot read from the files (#104). */
export interface RewriteOptions {
	/**
	 * `~` bind sources as the compose file spells them, mapped to the host directory the old
	 * containers mount. A `~` source that is kept becomes that absolute path; without an entry
	 * a `~` source is left as it is.
	 */
	readonly homeSources?: ReadonlyMap<string, string>;
	/**
	 * Top-level volume keys mapped to the Docker volume they really refer to (#101). A kept volume
	 * is then written with that name, as external when Docker already has it and as a named
	 * volume Docker will create when it does not, so the new stack uses the old stack's data.
	 * A key without an entry is declared `{external: true}` as before.
	 */
	readonly volumes?: ReadonlyMap<string, KeptVolume>;
}

/** The real Docker volume behind a top-level compose volume key, and whether Docker has it yet. */
export interface KeptVolume {
	readonly name: string;
	readonly exists: boolean;
}

/** Lookup of which volume references the user chose to convert (the rewrite rules, no text handling). */
class VolumeRules {
	private readonly bindRewrites = new Map<string, string>();

	constructor(
		volumeSelections: VolumeSelection[],
		private readonly namedVolumeSelections: Map<string, boolean>,
		private readonly homeSources: ReadonlyMap<string, string> = new Map(),
		private readonly volumes: ReadonlyMap<string, KeptVolume> = new Map(),
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

	/** The converted destination, else the host directory a `~` source stands for, else nothing. */
	bindTarget(hostPath: string): string | undefined {
		const newPath = this.bindRewrites.get(hostPath);
		return newPath || this.homeSources.get(hostPath) || undefined;
	}

	/** The flow-map text a kept top-level volume is declared with: its real name when it is known. */
	keptVolumeText(volumeKey: string): string {
		const volume = this.volumes.get(volumeKey);
		if (volume === undefined) {
			return EXTERNAL_FLOW;
		}
		// A JSON string is a valid double-quoted YAML scalar.
		const name = JSON.stringify(volume.name);
		return volume.exists ? `{external: true, name: ${name}}` : `{name: ${name}}`;
	}

	namedTarget(volumeName: string): string {
		return `./volumes/${volumeName}`;
	}

	/** New text of a short-form entry (`host:container[:mode]`), or undefined when it stays as it is. */
	shortForm(entry: string): string | undefined {
		const [hostPath, ...rest] = entry.split(":");
		// A `~` source is a host path the shell expands, never a named volume.
		const isNamedReference = !/^[./~]/.test(hostPath);
		const target = isNamedReference
			? (this.isConverted(hostPath) ? this.namedTarget(hostPath) : undefined)
			: this.bindTarget(hostPath);
		return target === undefined ? undefined : [target, ...rest].join(":");
	}
}

/** Highest numeric suffix tried for a name (`<SERVICE>_KEY_2` ... `<SERVICE>_KEY_99`). */
const MAX_NAME_SUFFIX = 99;

/** `web.v2` -> `WEB_V2`, `1st` -> `_1ST`: a service name made usable inside a variable name. */
function variablePrefix(serviceName: string): string {
	const upper = serviceName.toUpperCase().replaceAll(/[^A-Z0-9_]/g, "_");
	return /^[0-9]/.test(upper) ? `_${upper}` : upper;
}

/** Prefixes compose reads from `.env` to configure itself (project name, files, the daemon). */
const COMPOSE_CONFIG_PREFIXES = ["COMPOSE_", "DOCKER_"];

/** Variable names a compose file references (`$NAME`, `${NAME}`, `${NAME:-x}`). Over-matching is harmless. */
function referencedNames(compose: string): Set<string> {
	return new Set([...compose.matchAll(/\$\{?([A-Za-z_][A-Za-z0-9_]*)/g)].map(match => match[1]));
}

interface NameConstraints {
	/** Names that can never carry an extracted value (Docktor's own process environment). */
	reserved: ReadonlySet<string>;
	/** The old stack's `.env` assignments: such a name is reusable only for the same value. */
	existingEnv: Readonly<Record<string, string>>;
	/** Names the original compose file already references: a new `.env` entry would change them. */
	referenced: ReadonlySet<string>;
}

/**
 * Decides which `.env` name carries each extracted literal. A name is never reused for a
 * different value and never changes how anything else resolves, so every `${NAME}` keeps
 * resolving to the literal it replaced.
 */
class EnvNameAllocator {
	// Insertion-ordered: the order in which names were first emitted. Names reused from the
	// old .env are not in here: their line already exists.
	private readonly assigned = new Map<string, string>();

	constructor(private readonly constraints: NameConstraints) {}

	/** The name for `key`'s literal in `serviceName`, or undefined when no candidate is usable. */
	allocate(serviceName: string, key: string, value: string): string | undefined {
		const prefixed = `${variablePrefix(serviceName)}_${key}`;
		const candidates = [key, prefixed];
		for (let suffix = 2; suffix <= MAX_NAME_SUFFIX; suffix++) {
			candidates.push(`${prefixed}_${suffix}`);
		}
		const name = candidates.find(candidate => this.isUsable(candidate, value));
		if (name !== undefined && !this.isReusedFromExistingEnv(name)) {
			this.assigned.set(name, value);
		}
		return name;
	}

	entries(): ReadonlyMap<string, string> {
		return this.assigned;
	}

	private isReusedFromExistingEnv(name: string): boolean {
		return Object.hasOwn(this.constraints.existingEnv, name);
	}

	private isUsable(name: string, value: string): boolean {
		const {reserved, existingEnv, referenced} = this.constraints;
		if (reserved.has(name) || COMPOSE_CONFIG_PREFIXES.some(prefix => name.startsWith(prefix))) {
			return false;
		}
		const emitted = this.assigned.get(name);
		if (emitted !== undefined) {
			return emitted === value;
		}
		if (this.isReusedFromExistingEnv(name)) {
			return existingEnv[name] === value;
		}
		return !referenced.has(name);
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
		private readonly names: EnvNameAllocator,
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

	/**
	 * Inline literal values of a map-form `environment` move to `.env`: each value scalar becomes
	 * `${NAME}` in place, where NAME is the key unless another value already owns it. List-form entries, null values, values that already reference a variable
	 * and block scalars stay as they are.
	 */
	extractServiceEnvironment(serviceName: string, service: YAMLMap): void {
		const environment = service.get("environment", true);
		if (!isMap(environment)) {
			return;
		}
		for (const pair of environment.items) {
			if (!isScalar(pair.key) || !isScalar(pair.value)) {
				continue;
			}
			const key = String(pair.key.value);
			const literal = this.literalEnvValue(key, pair.value);
			const name = literal === undefined ? undefined : this.names.allocate(serviceName, key, literal);
			if (name !== undefined) {
				this.edits.replaceScalar(pair.value, `\${${name}}`);
			}
		}
	}

	/** The text to move to `.env`, or undefined when the entry must stay inline (see dotenv-format.ts). */
	private literalEnvValue(key: string, node: Scalar): string | undefined {
		const range = node.range;
		const isEditable = node.type === Scalar.PLAIN || node.type === Scalar.QUOTE_DOUBLE || node.type === Scalar.QUOTE_SINGLE;
		if (!range || !isEditable || node.value === null || node.value === undefined || !isInterpolationName(key)) {
			return undefined;
		}
		// A plain number or boolean keeps its source spelling (`0x1F`, `1e3`), not the parsed value.
		const text = typeof node.value === "string" ? node.value : this.source.slice(range[0], range[1]);
		const readsBackUnchanged =
			typeof node.value === "string" ? isDotenvSafeValue(text) : CANONICAL_PLAIN_SCALAR.test(text);
		return readsBackUnchanged && !isVariableReference(text) ? text : undefined;
	}

	extractedEnv(): {extractedEnv: string; envVars: Record<string, string>} {
		const entries = this.names.entries();
		return {
			extractedEnv: [...entries].map(([name, value]) => formatDotenvLine(name, value)).join("\n"),
			envVars: Object.fromEntries(entries),
		};
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
			this.edits.add({start, end: this.entryEnd(pair), text: ` ${this.rules.keptVolumeText(String(pair.key.value))}`});
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
			? `${key}: ${this.rules.keptVolumeText(String(pair.key.value))}`
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
	 * @param reservedNames names that can never carry an extracted value, read once per rewrite.
	 *   Shell variables override `.env` in compose, but compose children only receive the
	 *   allowlisted variables (see lib/compose-env.ts), so only those can override a value in the
	 *   stack's `.env` and only those are reserved by default.
	 */
	constructor(
		private readonly reservedNames: () => ReadonlySet<string> = () => new Set(Object.keys(dockerCliEnvironment(process.env))),
	) {}

	/**
	 * Rewrite compose file:
	 * 1. Update volume paths based on selections
	 * 2. Mark unconverted named volumes as external
	 * 3. Move inline literal `environment` values to `.env`
	 *
	 * `options.homeSources` resolves `~` bind sources (#104).
	 *
	 * Behaviour change (G-18-4 B): the previous implementation replaced a map-form `environment`
	 * by a list of bare `${KEY}` entries, which Compose reads as interpolated values without keys.
	 * The map form now stays and each value becomes `KEY: ${KEY}`, which Compose interpolates from
	 * the stack's `.env`.
	 *
	 * A document that does not parse, or has no `services` map, is returned unchanged.
	 */
	rewrite(
		originalCompose: string,
		volumeSelections: VolumeSelection[],
		namedVolumeSelections: Map<string, boolean>, // volumeName -> convert (true = bind mount, false = keep as named)
		existingEnv?: string,
		options: RewriteOptions = {},
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

		const plan = new ComposeEditPlan(
			originalCompose,
			new VolumeRules(volumeSelections, namedVolumeSelections, options.homeSources, options.volumes),
			new EnvNameAllocator({
				reserved: this.reservedNames(),
				existingEnv: parseEnvAssignments(existingEnv ?? ""),
				referenced: referencedNames(originalCompose),
			}),
		);
		for (const pair of services.items) {
			if (isMap(pair.value)) {
				plan.rewriteServiceVolumes(pair.value);
				plan.extractServiceEnvironment(String(isScalar(pair.key) ? pair.key.value : ""), pair.value);
			}
		}
		plan.rewriteTopLevelVolumes(root);

		return {rewrittenCompose: plan.apply(), ...plan.extractedEnv()};
	}
}

export const composeRewriter = new ComposeRewriter();
