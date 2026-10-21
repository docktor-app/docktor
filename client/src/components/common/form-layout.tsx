import type {ReactNode} from "react";
import {cn} from "@/lib/utils";

// Single owner of form spacing (UI-05, CONTEXT D-09, UI-SPEC R-04):
//   - 8px  label to control: the FormItem descendant rule below (FormItem is `grid gap-2`)
//   - 16px field to field:   gap-4 on FormStack
//   - 24px last field to actions: gap-4 + pt-2 on FormActions
// components/ui/form.tsx is shadcn-managed and is not edited; change the rhythm here only.
// Usage: the <form> carries no spacing class, FormStack is its single layout child and
// FormActions is the last child of FormStack. The dialog variant mirrors the shadcn
// DialogFooter layout so dialogs share the same 24px without touching components/ui.

export interface FormStackProps {
    readonly children: ReactNode;
    readonly className?: string;
}

export function FormStack({children, className}: Readonly<FormStackProps>): React.JSX.Element {
    return (
        <div
            data-slot="form-stack"
            className={cn("flex flex-col gap-4 [&_[data-slot=form-item]]:gap-2", className)}
        >
            {children}
        </div>
    );
}

export interface FormActionsProps {
    readonly children: ReactNode;
    readonly align?: "start" | "end" | "between";
    readonly variant?: "inline" | "dialog";
    readonly className?: string;
}

export function FormActions({
    children,
    align = "start",
    variant = "inline",
    className,
}: Readonly<FormActionsProps>): React.JSX.Element {
    return (
        <div
            data-slot="form-actions"
            className={cn(
                variant === "dialog"
                    ? "flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end"
                    : cn(
                        "flex items-center gap-2 pt-2",
                        align === "end" && "justify-end",
                        align === "between" && "justify-between",
                    ),
                className,
            )}
        >
            {children}
        </div>
    );
}
