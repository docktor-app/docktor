import {linter, type Diagnostic} from "@codemirror/lint";
import {parseDocument} from "yaml";

/**
 * Pure YAML syntax diagnostics (D-19). Parse-errors only — no docker-compose
 * schema/service/key linting is applied here or anywhere else (tracked
 * separately by the configurable-compose-linting todo). Each diagnostic's
 * `message` is the `yaml` package's own error message verbatim.
 *
 * Positions are clamped to `[0, max(source.length, 1)]` with `from < to`
 * always, so CodeMirror never receives a range outside the document even if
 * a future `yaml` release reports an edge-case position.
 */
export function yamlSyntaxDiagnostics(source: string): Diagnostic[] {
    const doc = parseDocument(source);
    const maxPos = Math.max(source.length, 1);

    return doc.errors.map((error): Diagnostic => {
        const [rawFrom, rawTo] = error.pos ?? [0, maxPos];
        const from = Math.min(Math.max(rawFrom, 0), maxPos - 1);
        const to = Math.min(Math.max(rawTo, from + 1), maxPos);

        return {
            from,
            to,
            severity: "error",
            message: error.message,
        };
    });
}

/** CodeMirror lint extension wiring {@link yamlSyntaxDiagnostics} into the editor. */
export const yamlSyntaxLinter = linter((view) => yamlSyntaxDiagnostics(view.state.doc.toString()));
