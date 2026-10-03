import {AlertTriangle} from "lucide-react";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {DeployWarningsAlert} from "@/components/domain/stack/deploy-warnings-alert";
import {hasDeployWarnings, parseDeployWarnings} from "@/lib/deploy-warnings";
import type {StackDetail} from "@/lib/stacks-api";

export interface StackAlertsProps {
    readonly stack: StackDetail;
}

// The stack detail page's configError/configChanged/deployWarnings alert
// banners. configError/configChanged were moved out verbatim
// (behaviour-preserving extraction); deployWarnings (Issue #21/D-14/D-15)
// renders after them, persisted independently of either flag — it survives
// a reload until the next deploy/restart/update/upgrade replaces it.
export function StackAlerts({stack}: Readonly<StackAlertsProps>) {
    const deployWarnings = parseDeployWarnings(stack.deployWarnings);

    return (
        <>
            {stack.configError && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4"/>
                    <AlertDescription>
                        Configuration file has an error: {stack.configError}
                    </AlertDescription>
                </Alert>
            )}

            {stack.configChanged && (
                <Alert className="bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900 dark:text-yellow-200 dark:border-yellow-800">
                    <AlertTriangle className="h-4 w-4"/>
                    <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                        Configuration has changed since last deployment.
                        Re-deploy to apply changes.
                    </AlertDescription>
                </Alert>
            )}

            {hasDeployWarnings(deployWarnings) && <DeployWarningsAlert warnings={deployWarnings}/>}
        </>
    );
}
