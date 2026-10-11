import {ToneBadge} from "@/components/common/tone-badge";
import {Alert, AlertDescription, AlertTitle} from "@/components/ui/alert";

/** Banner shown on the Account page when the instance requires 2FA and the user has none (D-01). */
export function EnrollmentRequiredAlert(): React.JSX.Element {
    return (
        <Alert>
            <AlertTitle className="flex flex-wrap items-center gap-2">
                Two-factor authentication is required
                <ToneBadge tone="orange">Setup required</ToneBadge>
            </AlertTitle>
            <AlertDescription>
                This Docktor instance requires every user to use two-factor authentication. Set it up to continue.
            </AlertDescription>
        </Alert>
    );
}
