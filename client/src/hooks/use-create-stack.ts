import {useCallback, useState} from "react";
import type {CreateStackInput} from "@docktor/shared";
import {ApiError} from "@/lib/api";
import {previewNewStack, type NewStackPreview} from "@/lib/stacks-api";

// Issue #20/D-02: the create-page analog of use-stack-config-files.ts's
// StackConfigReview — holds the submitted form values alongside the
// findings-only preview the server returned, so confirmReview() can
// re-submit exactly what the user saw reviewed.
export interface CreateStackReview {
    readonly values: CreateStackInput;
    readonly preview: NewStackPreview;
}

export interface UseCreateStackOptions {
    // Injected so plan 12-09 can pass the template-create API instead of
    // stacks-api.ts's createStack — the hook itself is create-source-agnostic.
    readonly create: (input: CreateStackInput) => Promise<{id: string}>;
    readonly onCreated: (stackId: string) => void;
}

export interface UseCreateStackResult {
    readonly submitting: boolean;
    readonly error: string;
    readonly review: CreateStackReview | null;
    readonly submit: (values: CreateStackInput) => void;
    readonly confirmReview: () => void;
    readonly cancelReview: () => void;
}

function previewInputFrom(values: CreateStackInput) {
    return {
        displayName: values.displayName,
        composeContent: values.composeContent,
        envContent: values.envContent,
    };
}

/**
 * Issue #20 AC1/D-02: owns the Create Stack page's submit/review flow — a
 * findings-only preview before the first write, and the 428 recovery path
 * when the server's own check (the single source of truth) disagrees with
 * a preview that's gone stale between preview and submit.
 */
export function useCreateStack({create, onCreated}: UseCreateStackOptions): UseCreateStackResult {
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [review, setReview] = useState<CreateStackReview | null>(null);

    // Shared by submit() (first attempt, unconfirmed) and confirmReview()
    // (post-review, confirmed) — and by the 428 recovery path triggered from
    // either caller. Returns true on success (onCreated already called).
    const attemptCreate = useCallback(
        async (values: CreateStackInput, confirmed: boolean): Promise<boolean> => {
            try {
                const input = confirmed ? {...values, confirmed: true as const} : values;
                const stack = await create(input);
                onCreated(stack.id);
                return true;
            } catch (err: unknown) {
                if (err instanceof ApiError && err.status === 428) {
                    // The confirmation requirement changed server-side between
                    // preview and this create call — fetch a fresh preview and
                    // reopen the review instead of showing an error; the
                    // user's form values are not lost.
                    try {
                        const preview = await previewNewStack(previewInputFrom(values));
                        setReview({values, preview});
                    } catch (previewErr: unknown) {
                        setError(previewErr instanceof Error ? previewErr.message : "Failed to create stack");
                    }
                    return false;
                }
                setError(err instanceof Error ? err.message : "Failed to create stack");
                return false;
            }
        },
        [create, onCreated],
    );

    const submit = useCallback(
        (values: CreateStackInput) => {
            setError("");
            setSubmitting(true);
            void (async () => {
                try {
                    const preview = await previewNewStack(previewInputFrom(values));
                    if (preview.confirmationRequired) {
                        setReview({values, preview});
                        setSubmitting(false);
                        return;
                    }
                    await attemptCreate(values, false);
                } catch (err: unknown) {
                    setError(err instanceof Error ? err.message : "Failed to create stack");
                } finally {
                    setSubmitting(false);
                }
            })();
        },
        [attemptCreate],
    );

    const confirmReview = useCallback(() => {
        if (!review) return;
        const {values} = review;
        setReview(null);
        setSubmitting(true);
        void attemptCreate(values, true).finally(() => setSubmitting(false));
    }, [review, attemptCreate]);

    const cancelReview = useCallback(() => {
        setReview(null);
    }, []);

    return {submitting, error, review, submit, confirmReview, cancelReview};
}
