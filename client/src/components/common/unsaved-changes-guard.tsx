import {useEffect} from "react";
import {useBlocker} from "react-router";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface UnsavedChangesGuardProps {
    // Whether there are unsaved edits to protect right now.
    readonly when: boolean;
    // Body copy for the confirmation dialog — the UI-SPEC's "Discard unsaved
    // changes?" row names exactly which file(s) have unsaved edits.
    readonly description: string;
    // A navigation whose target pathname this returns true for is never
    // blocked, even while `when` is true (e.g. switching between a stack's
    // own tabs must never prompt).
    isSameContext?: (nextPathname: string) => boolean;
}

// D-02/GH-15: blocks in-app navigation away from unsaved Config-tab edits
// with the UI-SPEC "Discard unsaved changes?" confirmation, and asks the
// browser's own native prompt on reload/close via beforeunload. Requires a
// data router (useBlocker throws under a declarative BrowserRouter) — see
// 11-10-PLAN.md and router.tsx.
export function UnsavedChangesGuard({
    when,
    description,
    isSameContext,
}: Readonly<UnsavedChangesGuardProps>): React.JSX.Element {
    const blocker = useBlocker(
        ({currentLocation, nextLocation}) =>
            when &&
            currentLocation.pathname !== nextLocation.pathname &&
            !(isSameContext?.(nextLocation.pathname) ?? false),
    );

    useEffect(() => {
        if (!when) return;

        function handleBeforeUnload(event: BeforeUnloadEvent) {
            event.preventDefault();
        }

        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [when]);

    return (
        <AlertDialog open={blocker.state === "blocked"}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => blocker.reset?.()}>Keep editing</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => blocker.proceed?.()}>
                        Discard
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
