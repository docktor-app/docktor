import {useEffect, useRef, useState} from "react";
import {useFieldArray, useForm, useWatch, type Resolver} from "react-hook-form";
import {standardSchemaResolver} from "@hookform/resolvers/standard-schema";
import {z} from "zod";
import {envVariableRowSchema} from "@docktor/shared";
import {Eye, EyeOff, Plus, Trash2} from "lucide-react";
import {CodeEditor} from "@/components/common/code-editor";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {ScrollArea} from "@/components/ui/scroll-area";
import {Switch} from "@/components/ui/switch";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip";
import {
    applyTableRows,
    countPassthroughLines,
    isSecretKey,
    parseEnvFile,
    toTableRows,
    type EnvTableRow,
} from "@/lib/env-file";

export interface EnvEditorProps {
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly onValidityChange: (valid: boolean) => void;
    readonly ariaLabel?: string;
}

// Extension (not duplication, per plan Task 1 action item 3): the shared
// row schema owns key/value validation; `lineIndex` is a client-only
// bookkeeping field the shared schema has no reason to know about.
const clientEnvRowSchema = envVariableRowSchema.extend({
    lineIndex: z.number().int().nullable(),
});
const clientEnvTableFormSchema = z.object({
    variables: z.array(clientEnvRowSchema),
});
type ClientEnvTableFormInput = z.infer<typeof clientEnvTableFormSchema>;

const LONG_VALUE_THRESHOLD = 40;
const ROW_SCROLL_THRESHOLD = 8;
const ICON_BUTTON_CLASS = "min-h-11 min-w-11 md:min-h-9 md:min-w-9";

/**
 * D-06/D-20/D-21/D-22: the structured .env editor — an inline-editable
 * key/value table (default) and a lossless raw-text mode, switchable at
 * any time with no confirmation and no data loss (RESEARCH Pitfall 4).
 * No dialog, no form element of its own (it is always embedded inside a
 * parent form or a plain section — a nested `<form>` would be invalid
 * HTML).
 */
export function EnvEditor({
    value,
    onChange,
    onValidityChange,
    ariaLabel = "Environment Variables",
}: Readonly<EnvEditorProps>): React.JSX.Element {
    const [mode, setMode] = useState<"table" | "raw">("table");
    const [revealedIds, setRevealedIds] = useState<ReadonlySet<string>>(new Set());
    // `lastEmittedRef` distinguishes a self-caused `value` prop update (skip
    // reset) from a genuine external one (raw-mode edit, external reload —
    // reset the table). `baseLinesRef` is the document the *next*
    // `applyTableRows` call reconstructs from; it only ever advances on a
    // genuine external change, never on our own emission. Advancing it on
    // every self-emitted change would be wrong: a still-empty new row
    // doesn't match the variable pattern when re-parsed, so it would get
    // baked in as an unclaimed passthrough line on the next base, while the
    // same row (its `lineIndex` staying `null` in form state) gets appended
    // again as a *second*, duplicate line — corrupting the document a
    // keystroke at a time. Keeping the base stable across self-edits means
    // every row is reconstructed from its one live entry in `rows`, once.
    const lastEmittedRef = useRef(value);
    const baseLinesRef = useRef(parseEnvFile(value));
    const justAppendedRef = useRef(false);
    const keyInputRefs = useRef<(HTMLInputElement | null)[]>([]);

    const form = useForm<ClientEnvTableFormInput>({
        // Mirrors proxy-assign-dialog.tsx's established cast: the resolver's
        // runtime behavior matches ClientEnvTableFormInput exactly, this cast
        // just papers over standardSchemaResolver's generic inference.
        resolver: standardSchemaResolver(clientEnvTableFormSchema) as Resolver<ClientEnvTableFormInput>,
        mode: "onChange",
        defaultValues: {variables: toTableRows(baseLinesRef.current)},
    });
    const {fields, append, remove} = useFieldArray({control: form.control, name: "variables"});
    const watchedVariables = useWatch({control: form.control, name: "variables"});
    const isValid = form.formState.isValid;

    // External value changes (raw-mode edits, an external reload) reset the
    // table — but only when the incoming string isn't one EnvEditor itself
    // just emitted, or every keystroke would reset the form and loop.
    useEffect(() => {
        if (value !== lastEmittedRef.current) {
            lastEmittedRef.current = value;
            baseLinesRef.current = parseEnvFile(value);
            form.reset({variables: toTableRows(baseLinesRef.current)});
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    useEffect(() => {
        const subscription = form.watch((formValues) => {
            const rows: EnvTableRow[] = (formValues.variables ?? [])
                .filter((row): row is NonNullable<typeof row> => !!row && typeof row.key === "string")
                .map((row) => ({
                    key: row.key ?? "",
                    value: row.value ?? "",
                    lineIndex: row.lineIndex ?? null,
                }));
            const next = applyTableRows(baseLinesRef.current, rows);
            if (next !== lastEmittedRef.current) {
                lastEmittedRef.current = next;
                onChange(next);
            }
        });
        return () => subscription.unsubscribe();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        onValidityChange(mode === "raw" ? true : isValid);
    }, [mode, isValid, onValidityChange]);

    useEffect(() => {
        if (justAppendedRef.current) {
            justAppendedRef.current = false;
            keyInputRefs.current[fields.length - 1]?.focus();
        }
    }, [fields.length]);

    function handleAddVariable() {
        justAppendedRef.current = true;
        append({key: "", value: "", lineIndex: null});
    }

    function toggleReveal(fieldId: string) {
        setRevealedIds((prev) => {
            const next = new Set(prev);
            if (next.has(fieldId)) {
                next.delete(fieldId);
            } else {
                next.add(fieldId);
            }
            return next;
        });
    }

    const passthroughCount = countPassthroughLines(parseEnvFile(value));

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <Switch
                    id="env-editor-raw-mode"
                    checked={mode === "raw"}
                    onCheckedChange={(checked) => setMode(checked ? "raw" : "table")}
                />
                <Label htmlFor="env-editor-raw-mode">Raw text mode</Label>
            </div>

            {mode === "raw" ? (
                <CodeEditor value={value} onChange={onChange} ariaLabel={ariaLabel} height="300px" />
            ) : fields.length === 0 ? (
                <div className="space-y-3 rounded-md border border-dashed p-6 text-center">
                    <p className="text-sm font-semibold">No environment variables</p>
                    <p className="text-sm text-muted-foreground">
                        Add a variable, or switch to raw text mode to paste an existing .env file.
                    </p>
                    <Button type="button" variant="outline" onClick={handleAddVariable}>
                        <Plus className="h-4 w-4 mr-1" />
                        Add Variable
                    </Button>
                </div>
            ) : (
                <div className="space-y-3">
                    {(() => {
                        const table = (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Value</TableHead>
                                        <TableHead className="w-0" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {fields.map((field, index) => {
                                        const rowValues = watchedVariables?.[index];
                                        const key = rowValues?.key ?? "";
                                        const currentValue = rowValues?.value ?? "";
                                        const secret = isSecretKey(key);
                                        const revealed = revealedIds.has(field.id);
                                        const showAsPassword = secret && !revealed;
                                        const displayName = key || `variable ${index + 1}`;
                                        const keyError = form.formState.errors.variables?.[index]?.key;
                                        const keyErrorId = `${field.id}-key-error`;
                                        const keyRegister = form.register(`variables.${index}.key`);

                                        const valueInput = (
                                            <Input
                                                type={showAsPassword ? "password" : "text"}
                                                className="min-w-48"
                                                aria-label={`Value for ${displayName}`}
                                                {...form.register(`variables.${index}.value`)}
                                            />
                                        );

                                        return (
                                            <TableRow key={field.id}>
                                                <TableCell>
                                                    <Input
                                                        className="min-w-32"
                                                        aria-label={`Variable name ${index + 1}`}
                                                        aria-invalid={!!keyError}
                                                        aria-describedby={keyError ? keyErrorId : undefined}
                                                        {...keyRegister}
                                                        ref={(el) => {
                                                            keyRegister.ref(el);
                                                            keyInputRefs.current[index] = el;
                                                        }}
                                                    />
                                                    {keyError && (
                                                        <p id={keyErrorId} className="text-xs text-destructive mt-1">
                                                            {keyError.message as string}
                                                        </p>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {!showAsPassword && currentValue.length > LONG_VALUE_THRESHOLD ? (
                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>{valueInput}</TooltipTrigger>
                                                                <TooltipContent>{currentValue}</TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>
                                                    ) : (
                                                        valueInput
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-1">
                                                        {secret && (
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                className={ICON_BUTTON_CLASS}
                                                                aria-label={
                                                                    revealed
                                                                        ? `Hide value for ${key}`
                                                                        : `Show value for ${key}`
                                                                }
                                                                onClick={() => toggleReveal(field.id)}
                                                            >
                                                                {revealed ? (
                                                                    <EyeOff className="h-4 w-4" />
                                                                ) : (
                                                                    <Eye className="h-4 w-4" />
                                                                )}
                                                            </Button>
                                                        )}
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className={ICON_BUTTON_CLASS}
                                                            aria-label={`Remove ${displayName}`}
                                                            onClick={() => remove(index)}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        );
                        return fields.length > ROW_SCROLL_THRESHOLD ? (
                            <ScrollArea className="h-96">{table}</ScrollArea>
                        ) : (
                            table
                        );
                    })()}

                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={handleAddVariable}>
                            <Plus className="h-4 w-4 mr-1" />
                            Add Variable
                        </Button>
                        {passthroughCount > 0 && (
                            <p className="text-sm text-muted-foreground">
                                {passthroughCount} comment or unrecognised line(s) are kept as-is — switch to raw
                                text mode to edit them.
                            </p>
                        )}
                    </div>

                    <p className="text-xs text-muted-foreground">
                        Values for names containing password, secret, key or token are hidden on screen only — the
                        .env file itself is stored as plain text.
                    </p>
                </div>
            )}
        </div>
    );
}
