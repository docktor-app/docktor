import {useEffect, useMemo, useRef} from "react";
import {useForm, useWatch, type UseFormReturn} from "react-hook-form";
import {standardSchemaResolver} from "@hookform/resolvers/standard-schema";
import {healthProbeFormSchema, type HealthProbeFormValues} from "@docktor/shared";

import {
    readHealthProbes,
    removeHealthProbe,
    setHealthProbe,
    type HealthProbeRead,
    type HealthProbeValue,
} from "@/lib/compose-health-probe";
import {cn} from "@/lib/utils";
import {getServiceColor} from "@/lib/service-color";
import {Input} from "@/components/ui/input";
import {Switch} from "@/components/ui/switch";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";

const BEHAVIOR_NOTE =
    "Probes run every 30 seconds from Docktor. A service is marked unhealthy after 3 failed checks in a row, with a 60-second grace period after each start. Any 2xx or 3xx response counts as healthy. When a probe is set, it replaces the service's Docker healthcheck for status.";
const SAVE_HINT =
    "Edits change the compose file above. Use Save on the Compose File section to review and apply them.";

type ProbeRowValues = HealthProbeFormValues["probes"][number];

export interface HealthProbeFormProps {
    readonly composeContent: string;
    readonly onChange: (next: string) => void;
}

function toFormValues(read: HealthProbeRead): HealthProbeFormValues {
    if (!read.ok) {
        return {probes: []};
    }
    return {
        probes: read.services.map(({serviceName, probe}) => ({
            serviceName,
            enabled: probe !== null,
            url: probe === null ? "" : probe.url,
            timeout: probe === null || probe.timeout === null ? "" : String(probe.timeout),
        })),
    };
}

function toProbeValue(row: ProbeRowValues): HealthProbeValue {
    const timeout = row.timeout.trim();
    return {url: row.url.trim(), timeout: timeout === "" ? null : Number(timeout)};
}

function isSameProbe(content: string, serviceName: string, probe: HealthProbeValue): boolean {
    const read = readHealthProbes(content);
    if (!read.ok) {
        return false;
    }
    const current = read.services.find((service) => service.serviceName === serviceName)?.probe;
    return current !== undefined && current !== null && current.url === probe.url && current.timeout === probe.timeout;
}

/**
 * Computes the buffer that applying one form row would produce. An enabled
 * row with no URL yet writes nothing, and a row already matching the buffer
 * returns it untouched, so a blur never dirties the compose file for no change.
 */
function nextBuffer(base: string, row: ProbeRowValues): string {
    if (!row.enabled) {
        return removeHealthProbe(base, row.serviceName);
    }
    const probe = toProbeValue(row);
    if (probe.url === "" || isSameProbe(base, row.serviceName, probe)) {
        return base;
    }
    return setHealthProbe(base, row.serviceName, probe);
}

interface ProbeRowProps {
    readonly form: UseFormReturn<HealthProbeFormValues>;
    readonly index: number;
    readonly serviceName: string;
    readonly onToggle: (index: number, checked: boolean) => void;
    readonly onCommit: (index: number) => void;
}

function ProbeRow({form, index, serviceName, onToggle, onCommit}: Readonly<ProbeRowProps>): React.JSX.Element {
    const enabled = useWatch({control: form.control, name: `probes.${index}.enabled`});

    return (
        <li aria-label={serviceName} className="space-y-3 py-3 first:pt-0 last:pb-0">
            <FormField
                control={form.control}
                name={`probes.${index}.enabled`}
                render={({field}) => (
                    <FormItem className="flex items-center justify-between gap-3 space-y-0">
                        <div className="flex min-w-0 items-center gap-2">
                            <span
                                aria-hidden="true"
                                className={cn("size-2 shrink-0 rounded-full bg-current", getServiceColor(serviceName))}
                            />
                            <FormLabel className="truncate">{serviceName}</FormLabel>
                        </div>
                        <FormControl>
                            <Switch
                                aria-label={`Probe ${serviceName} over HTTP`}
                                checked={field.value}
                                onCheckedChange={(checked) => {
                                    field.onChange(checked);
                                    onToggle(index, checked);
                                }}
                            />
                        </FormControl>
                    </FormItem>
                )}
            />
            {enabled && (
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
                    <FormField
                        control={form.control}
                        name={`probes.${index}.url`}
                        render={({field}) => (
                            <FormItem className="min-w-0">
                                <FormLabel>Probe URL</FormLabel>
                                <FormControl>
                                    <Input
                                        {...field}
                                        placeholder="http://localhost:8080/health"
                                        inputMode="url"
                                        autoComplete="off"
                                        spellCheck={false}
                                        onBlur={() => {
                                            field.onBlur();
                                            onCommit(index);
                                        }}
                                    />
                                </FormControl>
                                <FormDescription>
                                    Use the port the app listens on inside the container, not a published port. The
                                    host must be localhost, 127.0.0.1, or [::1].
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name={`probes.${index}.timeout`}
                        render={({field}) => (
                            <FormItem className="min-w-0">
                                <FormLabel>Timeout (seconds)</FormLabel>
                                <FormControl>
                                    <Input
                                        {...field}
                                        inputMode="numeric"
                                        autoComplete="off"
                                        onBlur={() => {
                                            field.onBlur();
                                            onCommit(index);
                                        }}
                                    />
                                </FormControl>
                                <FormDescription>1 to 30. Defaults to 5.</FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
            )}
        </li>
    );
}

/**
 * D-01: edits each service's `x-docktor: health-probe:` block in the compose
 * buffer. It has no Save of its own — valid edits are written into the buffer
 * through `onChange`, and the Compose File Save routes them through the diff
 * review. The form tells its own writes apart from external code-editor edits
 * (`lastEmittedRef`, the same guard EnvEditor uses) and re-seeds only on the
 * latter, so typing never duplicates text or loses keystrokes.
 */
export function HealthProbeForm({composeContent, onChange}: Readonly<HealthProbeFormProps>): React.JSX.Element {
    const read = useMemo(() => readHealthProbes(composeContent), [composeContent]);
    // The latest buffer this form knows about: the last value it emitted, or
    // the last value it received from outside. Writes are computed from it, so
    // consecutive edits accumulate even before the parent re-renders.
    const lastEmittedRef = useRef(composeContent);

    const form = useForm<HealthProbeFormValues>({
        resolver: standardSchemaResolver(healthProbeFormSchema),
        mode: "onTouched",
        defaultValues: toFormValues(read),
    });

    useEffect(() => {
        if (composeContent !== lastEmittedRef.current) {
            lastEmittedRef.current = composeContent;
            form.reset(toFormValues(read));
        }
    }, [composeContent, read, form]);

    function emit(row: ProbeRowValues): void {
        const base = lastEmittedRef.current;
        const next = nextBuffer(base, row);
        if (next !== base) {
            lastEmittedRef.current = next;
            onChange(next);
        }
    }

    async function commitRow(index: number): Promise<void> {
        const valid = await form.trigger(`probes.${index}`);
        if (valid) {
            emit(form.getValues(`probes.${index}`));
        }
    }

    function handleToggle(index: number, checked: boolean): void {
        if (!checked) {
            form.clearErrors(`probes.${index}`);
            emit({...form.getValues(`probes.${index}`), enabled: false});
            return;
        }
        // Turning a row on with no URL yet must not flash an error: only a
        // blur surfaces one. A URL kept from an earlier "on" is re-applied.
        if (form.getValues(`probes.${index}.url`).trim() !== "") {
            void commitRow(index);
        }
    }

    const services = read.ok ? read.services : [];

    return (
        <Form {...form}>
            <div className="space-y-4">
                {services.length > 0 && (
                    <ul className="divide-y">
                        {services.map(({serviceName}, index) => (
                            <ProbeRow
                                key={serviceName}
                                form={form}
                                index={index}
                                serviceName={serviceName}
                                onToggle={handleToggle}
                                onCommit={(rowIndex) => void commitRow(rowIndex)}
                            />
                        ))}
                    </ul>
                )}
                <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">{BEHAVIOR_NOTE}</p>
                    <p className="text-xs text-muted-foreground">{SAVE_HINT}</p>
                </div>
            </div>
        </Form>
    );
}
