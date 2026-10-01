import {useMemo} from "react";
import {yaml} from "@codemirror/lang-yaml";
import {lintGutter} from "@codemirror/lint";
import {CodeEditor} from "@/components/common/code-editor";
import {yamlSyntaxLinter} from "@/lib/yaml-syntax-linter";

export interface ComposeEditorProps {
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly ariaLabel?: string;
    readonly height?: string;
}

/**
 * D-18/D-19: CodeMirror YAML editor for docker-compose content, with inline
 * syntax-error diagnostics (no docker-compose schema linting). Used on both
 * compose-editing surfaces — the Config tab and the Create Stack page.
 */
export function ComposeEditor({
    value,
    onChange,
    ariaLabel = "Docker Compose File",
    height = "400px",
}: Readonly<ComposeEditorProps>): React.JSX.Element {
    const extensions = useMemo(() => [yaml(), yamlSyntaxLinter, lintGutter()], []);

    return (
        <CodeEditor
            value={value}
            onChange={onChange}
            ariaLabel={ariaLabel}
            height={height}
            extensions={extensions}
            placeholder="services:"
        />
    );
}
