import {useCallback, useEffect, useState} from "react";
import {useSearchParams} from "react-router";
import type {CreateStackInput} from "@docktor/shared";
import {createStack} from "@/lib/stacks-api";
import {createStackFromTemplate, getTemplateVariant, type TemplateVariantDetail} from "@/lib/templates-api";

const BLANK_DEFAULTS: CreateStackInput = {
    displayName: "",
    description: "",
    composeContent: "",
    envContent: "",
};

export interface UseCreateStackSourceResult {
    readonly variantId: string | null;
    readonly variant: TemplateVariantDetail | null;
    readonly loading: boolean;
    readonly error: string | null;
    readonly defaultValues: CreateStackInput;
    readonly create: (input: CreateStackInput) => Promise<{id: string}>;
}

/**
 * Issue #19/D-06: reads `?variant=<id>` from the URL and, when present,
 * loads that template variant and prefills the Create Stack form from it.
 * `create` is create-source-agnostic — matching use-create-stack.ts's
 * injected `create` option — so the page composes the two hooks without
 * either one knowing about the other.
 */
export function useCreateStackSource(): UseCreateStackSourceResult {
    const [searchParams] = useSearchParams();
    const variantId = searchParams.get("variant");

    const [variant, setVariant] = useState<TemplateVariantDetail | null>(null);
    const [loading, setLoading] = useState(variantId !== null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!variantId) {
            setVariant(null);
            setLoading(false);
            setError(null);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);
        void (async () => {
            try {
                const data = await getTemplateVariant(variantId);
                if (cancelled) return;
                setVariant(data);
            } catch (err: unknown) {
                if (cancelled) return;
                setError(err instanceof Error ? err.message : "Failed to load template");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [variantId]);

    const create = useCallback(
        (input: CreateStackInput): Promise<{id: string}> => {
            if (variantId) return createStackFromTemplate(variantId, input);
            return createStack(input);
        },
        [variantId],
    );

    const defaultValues: CreateStackInput = variant
        ? {
              displayName: variant.template.name,
              description: "",
              composeContent: variant.composeContent,
              envContent: variant.envContent ?? "",
          }
        : BLANK_DEFAULTS;

    return {variantId, variant, loading, error, defaultValues, create};
}
