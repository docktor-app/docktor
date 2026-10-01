import * as React from "react";
import {cva, type VariantProps} from "class-variance-authority";

import {Badge} from "@/components/ui/badge";
import {cn} from "@/lib/utils";

export type Tone = "neutral" | "green" | "red" | "yellow" | "blue" | "orange";

export const toneBadgeVariants = cva("border-transparent", {
    variants: {
        tone: {
            neutral: "bg-muted text-muted-foreground",
            green: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
            red: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
            yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
            blue: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
            orange: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
        },
        pulse: {
            true: "animate-pulse motion-reduce:animate-none",
            false: "",
        },
    },
    defaultVariants: {
        tone: "neutral",
        pulse: false,
    },
});

export type ToneBadgeProps = Omit<React.ComponentProps<typeof Badge>, "variant"> &
    VariantProps<typeof toneBadgeVariants>;

/**
 * Generic status/config pill. Built on the shadcn Badge (outline variant) so
 * every pill in the app shares one size (fully rounded, `text-xs`, the
 * Badge component's own compact padding).
 * Domain components choose a `Tone`; this component owns no domain vocabulary.
 */
export function ToneBadge({tone, pulse, className, ...props}: Readonly<ToneBadgeProps>) {
    return (
        <Badge
            variant="outline"
            data-tone={tone ?? "neutral"}
            className={cn(toneBadgeVariants({tone, pulse}), className)}
            {...props}
        />
    );
}
