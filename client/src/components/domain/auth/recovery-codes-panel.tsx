import {useId} from "react";

import {Alert, AlertDescription} from "@/components/ui/alert";
import {Checkbox} from "@/components/ui/checkbox";
import {Label} from "@/components/ui/label";

export interface RecoveryCodesPanelProps {
    codes: readonly string[];
    saved: boolean;

    onSavedChange(saved: boolean): void;
}

/**
 * The one-time recovery code display shared by the enroll and regenerate
 * flows. The codes are plain selectable text; the "saved" checkbox is
 * controlled by the caller because it gates a dialog button.
 */
export function RecoveryCodesPanel({codes, saved, onSavedChange}: Readonly<RecoveryCodesPanelProps>): React.JSX.Element {
    const savedId = useId();

    return (
        <div className="space-y-4">
            <Alert>
                <AlertDescription>
                    You will not see these codes again. Each one works once. Use them to sign in if you lose
                    your authenticator app.
                </AlertDescription>
            </Alert>

            {/* role="list" restores list semantics that list-none removes in some browsers. */}
            <ul role="list" className="grid list-none grid-cols-2 gap-x-4 gap-y-2 rounded-md bg-muted p-4">
                {codes.map((code) => (
                    <li key={code} className="font-mono text-sm">
                        {code}
                    </li>
                ))}
            </ul>

            <div className="flex items-center gap-2">
                <Checkbox
                    id={savedId}
                    autoFocus
                    checked={saved}
                    onCheckedChange={(checked) => onSavedChange(checked === true)}
                />
                <Label htmlFor={savedId}>I have saved these recovery codes</Label>
            </div>
        </div>
    );
}
