import {useCallback, useEffect, useRef, useState} from "react";
import {toast} from "sonner";
import {ApiError} from "@/lib/api";
import {getComposeContent, getEnvContent, previewStackChange, updateStack, type StackChangePreview} from "@/lib/stacks-api";

// Issue #18/D-01/D-03: the pending review surfaced between a Save click and
// a confirmed PUT — holds the file being reviewed and the diff the preview
// endpoint returned.
export interface StackConfigReview {
    readonly file: "compose" | "env";
    readonly preview: StackChangePreview;
}

export interface StackConfigFiles {
    readonly composeContent: string;
    readonly envContent: string;
    readonly composeDirty: boolean;
    readonly envDirty: boolean;
    readonly isDirty: boolean;
    // 11-10: human-readable summary of which file(s) have unsaved edits, for
    // the "Discard unsaved changes?" dialog's body copy; null when nothing
    // is dirty.
    readonly unsavedSummary: string | null;
    // Issue #18/D-01/D-03: non-null while a diff review is pending
    // confirmation; the Config tab renders DiffConfirmDialog from this.
    readonly review: StackConfigReview | null;
    // True while the preview request for a Save click is in flight — Save
    // buttons are disabled during this window (UI-SPEC).
    readonly reviewPending: boolean;
    setComposeContent(value: string): void;
    setEnvContent(value: string): void;
    saveCompose(): void;
    saveEnv(): void;
    confirmReview(): void;
    cancelReview(): void;
}

// Owns the Config tab's compose/env file state: loading, dirty-guarding
// (a background refresh must never clobber an unsaved edit — RESEARCH
// Pitfall 3), and saving through the existing PUT /api/stacks/:id endpoint
// — gated by a review-before-apply diff confirmation (Issue #18/D-01/D-03)
// when the server reports the edit actually changes something.
export function useStackConfigFiles(
    stackId: string,
    lastKnownHash: string | null | undefined,
    onSaved: () => void,
): StackConfigFiles {
    const [composeContent, setComposeContentState] = useState("");
    const [envContent, setEnvContentState] = useState("");
    const [composeDirty, setComposeDirtyState] = useState(false);
    const [envDirty, setEnvDirtyState] = useState(false);
    const [review, setReview] = useState<StackConfigReview | null>(null);
    const [reviewPending, setReviewPending] = useState(false);

    // The exact content that was previewed, captured alongside `review` so
    // confirmReview() applies precisely what the user saw diffed — not
    // whatever composeContent/envContent happens to hold at confirm time
    // (which could have changed if editing were ever re-enabled while a
    // review is open).
    const pendingContentRef = useRef<string>("");

    // Kept in lockstep with the dirty state *synchronously*, everywhere a
    // dirty flag is set — a load response's `.then` callback is a microtask
    // that can run before React flushes a `useEffect`, so it must read a ref
    // updated at the same time as the state, not one synced via its own
    // effect (which would still be observing a stale value at that point).
    const composeDirtyRef = useRef(false);
    const envDirtyRef = useRef(false);

    const setComposeDirty = useCallback((dirty: boolean) => {
        composeDirtyRef.current = dirty;
        setComposeDirtyState(dirty);
    }, []);

    const setEnvDirty = useCallback((dirty: boolean) => {
        envDirtyRef.current = dirty;
        setEnvDirtyState(dirty);
    }, []);

    useEffect(() => {
        if (!stackId) return;
        let cancelled = false;

        // Only reload a file the user hasn't started editing — and even
        // then, discard the response if it arrives after the file became
        // dirty (a load in flight when the user starts typing).
        if (!composeDirty) {
            getComposeContent(stackId).then((r) => {
                if (cancelled || composeDirtyRef.current) return;
                setComposeContentState(r.content);
            });
        }
        if (!envDirty) {
            getEnvContent(stackId).then((r) => {
                if (cancelled || envDirtyRef.current) return;
                setEnvContentState(r.content);
            });
        }

        return () => {
            cancelled = true;
        };
    }, [stackId, lastKnownHash, composeDirty, envDirty]);

    const setComposeContent = useCallback(
        (value: string) => {
            setComposeContentState(value);
            setComposeDirty(true);
        },
        [setComposeDirty],
    );

    const setEnvContent = useCallback(
        (value: string) => {
            setEnvContentState(value);
            setEnvDirty(true);
        },
        [setEnvDirty],
    );

    // Manual toast.loading/success/error/dismiss control (not toast.promise):
    // Issue #18/D-01's 428 re-review path needs to resolve this apply with
    // *neither* a success nor an error toast (the reopened review dialog is
    // the feedback) — toast.promise's success/error options are fixed at
    // call time and always render a toast once a `success` option is
    // present, even if its message is empty, so there is no toast.promise
    // shape that can express "sometimes no toast at all" for one call.
    const applyChange = useCallback(
        (file: "compose" | "env", content: string, confirmed: boolean): Promise<void> => {
            const loadingMessage = file === "compose" ? "Saving compose file…" : "Saving environment variables…";
            const successMessage = file === "compose" ? "Compose file saved" : "Environment variables saved";
            const toastId = toast.loading(loadingMessage);

            return (async () => {
                try {
                    const body = file === "compose" ? {composeContent: content} : {envContent: content};
                    await updateStack(stackId, confirmed ? {...body, confirmed: true} : body);
                    if (file === "compose") {
                        setComposeDirty(false);
                    } else {
                        setEnvDirty(false);
                    }
                    onSaved();
                    toast.success(successMessage, {id: toastId});
                } catch (err: unknown) {
                    if (confirmed && err instanceof ApiError && err.status === 428) {
                        // The file changed server-side between preview and
                        // confirm — re-run the preview and reopen the review
                        // instead of showing an error toast; the user's edit
                        // is not lost, they just need to look at the diff
                        // again before it can be applied.
                        toast.dismiss(toastId);
                        try {
                            const preview = await previewStackChange(
                                stackId,
                                file === "compose" ? {composeContent: content} : {envContent: content},
                            );
                            pendingContentRef.current = content;
                            setReview({file, preview});
                        } catch (previewErr: unknown) {
                            const message = previewErr instanceof Error ? previewErr.message : "Unknown error";
                            toast.error(`Couldn't refresh the review — ${message}. Try saving again.`);
                        }
                        return;
                    }
                    const message = err instanceof Error ? err.message : "Unknown error";
                    toast.error(
                        file === "compose"
                            ? `Couldn't save compose file — ${message}. Try again.`
                            : `Couldn't save environment variables — ${message}. Try again.`,
                        {id: toastId},
                    );
                }
            })();
        },
        [stackId, onSaved, setComposeDirty, setEnvDirty],
    );

    const saveCompose = useCallback(() => {
        setReviewPending(true);
        (async () => {
            try {
                const preview = await previewStackChange(stackId, {composeContent});
                if (preview.confirmationRequired) {
                    pendingContentRef.current = composeContent;
                    setReview({file: "compose", preview});
                } else {
                    await applyChange("compose", composeContent, false);
                }
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : "Unknown error";
                toast.error(`Couldn't review the compose file — ${message}. Try again.`);
            } finally {
                setReviewPending(false);
            }
        })();
    }, [stackId, composeContent, applyChange]);

    const saveEnv = useCallback(() => {
        setReviewPending(true);
        (async () => {
            try {
                const preview = await previewStackChange(stackId, {envContent});
                if (preview.confirmationRequired) {
                    pendingContentRef.current = envContent;
                    setReview({file: "env", preview});
                } else {
                    await applyChange("env", envContent, false);
                }
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : "Unknown error";
                toast.error(`Couldn't review the environment variables — ${message}. Try again.`);
            } finally {
                setReviewPending(false);
            }
        })();
    }, [stackId, envContent, applyChange]);

    const confirmReview = useCallback(() => {
        if (!review) return;
        const {file} = review;
        const content = pendingContentRef.current;
        setReview(null);
        void applyChange(file, content, true);
    }, [review, applyChange]);

    const cancelReview = useCallback(() => {
        setReview(null);
    }, []);

    const unsavedSummary =
        composeDirty && envDirty
            ? "the compose file and environment variables"
            : composeDirty
              ? "the compose file"
              : envDirty
                ? "the environment variables"
                : null;

    return {
        composeContent,
        envContent,
        composeDirty,
        envDirty,
        isDirty: composeDirty || envDirty,
        unsavedSummary,
        review,
        reviewPending,
        setComposeContent,
        setEnvContent,
        saveCompose,
        saveEnv,
        confirmReview,
        cancelReview,
    };
}
