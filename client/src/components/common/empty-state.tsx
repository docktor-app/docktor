import type {ReactNode} from "react";

export interface EmptyStateProps {
    readonly heading: string;
    readonly children?: ReactNode;
}

// Generic centered empty state: a heading and an optional explanatory body.
export function EmptyState({heading, children}: Readonly<EmptyStateProps>) {
    return (
        <div className="space-y-1 py-12 text-center">
            <h3 className="text-lg font-semibold">{heading}</h3>
            {children && <p className="text-sm text-muted-foreground">{children}</p>}
        </div>
    );
}
