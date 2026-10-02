import {useEffect, useState} from "react";
import {useForm} from "react-hook-form";
import {standardSchemaResolver} from "@hookform/resolvers/standard-schema";
import {toast} from "sonner";
import {
    CONFIGURABLE_COMPOSE_RULE_IDS,
    COMPOSE_RULE_IDS,
    composeCheckSettingsSchema,
    type ComposeCheckSettings,
    type ComposeRuleId,
} from "@docktor/shared";

import {getComposeCheckSettings, saveComposeCheckSettings} from "@/lib/settings-api";
import {COMPOSE_RULE_LABELS} from "@/lib/compose-rules";
import {Card, CardContent, CardFooter, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Switch} from "@/components/ui/switch";
import {Skeleton} from "@/components/ui/skeleton";
import {ToneBadge} from "@/components/common/tone-badge";
import {Form, FormControl, FormDescription, FormField, FormItem, FormLabel} from "@/components/ui/form";

// Issue #20/D-10/D-11: the three always-on rules have no switch and no key
// in composeCheckSettingsSchema — this is COMPOSE_RULE_IDS minus
// CONFIGURABLE_COMPOSE_RULE_IDS, computed once rather than hardcoded so a
// future rule addition to either tuple can't silently fall out of sync here.
const ALWAYS_ON_RULE_IDS: readonly ComposeRuleId[] = COMPOSE_RULE_IDS.filter(
    (id): boolean => !(CONFIGURABLE_COMPOSE_RULE_IDS as readonly ComposeRuleId[]).includes(id),
);

// UI-SPEC Copywriting Contract: verb-first, matching the rule's action, not
// its internal rule id.
const CONFIGURABLE_SWITCH_LABELS: Record<(typeof CONFIGURABLE_COMPOSE_RULE_IDS)[number], string> = {
    namedVolume: "Flag named volumes",
    inlineEnv: "Flag inline environment variables",
    missingEnvFile: "Flag .env files with no env_file reference",
};

/**
 * Issue #20/D-10/D-11, D-04: per-check enable/disable for the three
 * configurable compose checks, the three always-on checks shown as
 * non-toggleable red badges, and the skip-review-step toggle — copied from
 * ProxySettingsCard's structure, CLAUDE.md's named target pattern for
 * settings cards (RHF + standardSchemaResolver + Skeleton + toast.promise,
 * no per-field local state).
 */
export function ComposeChecksCard() {
    const [loading, setLoading] = useState(true);

    const form = useForm<ComposeCheckSettings>({
        resolver: standardSchemaResolver(composeCheckSettingsSchema),
        defaultValues: {
            skipReview: false,
            checks: {namedVolume: true, inlineEnv: true, missingEnvFile: true},
        },
    });

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            try {
                const data = await getComposeCheckSettings();
                if (cancelled) return;
                form.reset(data);
            } catch {
                // silently fail — mirrors proxy-settings-card.tsx's load effect
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        void load();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function handleSave(data: ComposeCheckSettings) {
        toast.promise(saveComposeCheckSettings(data).then((saved) => form.reset(saved)), {
            loading: "Saving compose checks…",
            success: "Compose checks saved",
            error: (err: Error) => `Couldn't save compose checks — ${err?.message ?? "unknown error"}. Try again.`,
        });
    }

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Compose Checks</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-6 w-48" />
                        <Skeleton className="h-6 w-48" />
                        <Skeleton className="h-6 w-48" />
                    </div>
                    <Skeleton className="h-6 w-64" />
                    <Skeleton className="h-6 w-64" />
                    <Skeleton className="h-6 w-64" />
                    <Skeleton className="h-6 w-80" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Compose Checks</CardTitle>
            </CardHeader>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSave)}>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <p className="text-sm font-semibold">Always on</p>
                            <div className="flex flex-col gap-2">
                                {ALWAYS_ON_RULE_IDS.map((ruleId) => (
                                    <div key={ruleId} className="flex items-center gap-3">
                                        <ToneBadge tone="red">{COMPOSE_RULE_LABELS[ruleId]}</ToneBadge>
                                        <span className="text-sm text-muted-foreground">
                                            Always checked — warns but never blocks
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-3">
                            {CONFIGURABLE_COMPOSE_RULE_IDS.map((ruleId) => (
                                <FormField
                                    key={ruleId}
                                    control={form.control}
                                    name={`checks.${ruleId}`}
                                    render={({field}) => (
                                        <FormItem className="flex items-center gap-3 space-y-0">
                                            <FormControl>
                                                <Switch
                                                    checked={field.value ?? false}
                                                    onCheckedChange={field.onChange}
                                                />
                                            </FormControl>
                                            <ToneBadge tone="yellow">{COMPOSE_RULE_LABELS[ruleId]}</ToneBadge>
                                            <FormLabel className="font-semibold">
                                                {CONFIGURABLE_SWITCH_LABELS[ruleId]}
                                            </FormLabel>
                                        </FormItem>
                                    )}
                                />
                            ))}
                        </div>

                        <FormField
                            control={form.control}
                            name="skipReview"
                            render={({field}) => (
                                <FormItem className="flex items-center gap-3 space-y-0">
                                    <FormControl>
                                        <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
                                    </FormControl>
                                    <div>
                                        <FormLabel className="font-semibold">
                                            Skip the review step before applying compose/.env changes
                                        </FormLabel>
                                        <FormDescription>
                                            Changes are applied immediately without a diff preview. You can turn
                                            this back on at any time. Edits that introduce a compose-check warning
                                            still open the review.
                                        </FormDescription>
                                    </div>
                                </FormItem>
                            )}
                        />
                    </CardContent>
                    <CardFooter>
                        <Button type="submit">Save Compose Checks</Button>
                    </CardFooter>
                </form>
            </Form>
        </Card>
    );
}
