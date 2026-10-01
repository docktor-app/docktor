import {useMemo} from "react";
import CodeMirror, {EditorView, type Extension} from "@uiw/react-codemirror";
import {useTheme} from "next-themes";
import {cn} from "@/lib/utils";

export interface CodeEditorProps {
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly ariaLabel: string;
    readonly height?: string;
    readonly extensions?: Extension[];
    readonly placeholder?: string;
    readonly readOnly?: boolean;
    readonly className?: string;
}

/**
 * Generic themed CodeMirror 6 wrapper (D-18). No domain vocabulary here —
 * plan 11-12 reuses this for the env editor's raw mode with no language
 * extension, so keep this component free of anything stack/compose-specific.
 *
 * Theme follows next-themes' resolved theme (D-15 integration): CodeMirror
 * has no "system" theme concept, so `resolvedTheme` (never `"system"`
 * itself) is what drives the light/dark choice.
 */
export function CodeEditor({
    value,
    onChange,
    ariaLabel,
    height = "400px",
    extensions = [],
    placeholder,
    readOnly = false,
    className,
}: Readonly<CodeEditorProps>): React.JSX.Element {
    const {resolvedTheme} = useTheme();

    const allExtensions = useMemo(
        () => [...extensions, EditorView.contentAttributes.of({"aria-label": ariaLabel})],
        [extensions, ariaLabel],
    );

    return (
        <div className={cn("overflow-hidden rounded-md border", className)}>
            <CodeMirror
                value={value}
                height={height}
                theme={resolvedTheme === "dark" ? "dark" : "light"}
                basicSetup={{lineNumbers: true, foldGutter: true, highlightActiveLine: true}}
                extensions={allExtensions}
                placeholder={placeholder}
                readOnly={readOnly}
                onChange={onChange}
            />
        </div>
    );
}
