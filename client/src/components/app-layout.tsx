import {Outlet} from "react-router";
import {SidebarInset, SidebarProvider} from "@/components/ui/sidebar";
import {AppSidebar} from "@/components/app-sidebar";
import {EnvironmentWarningsBanner} from "@/components/domain/environment/environment-warnings-banner";
import {useEnvironmentWarnings} from "@/hooks/use-environment-warnings";
import {docsUrl} from "@/lib/docs-links";

export function AppLayout() {
    const {warnings, dismiss, dismissAll} = useEnvironmentWarnings();

    return (
        <div>
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
                {/* #7/D-13: the wrapper only exists while there are warnings, so pages without warnings are unchanged. */}
                {warnings.length > 0 && (
                    <div className="px-6 pt-4">
                        <EnvironmentWarningsBanner
                            warnings={warnings}
                            onDismiss={dismiss}
                            onDismissAll={dismissAll}
                            docsHref={docsUrl("reference/deployment", "startup-checks")}
                        />
                    </div>
                )}
                <Outlet />
            </SidebarInset>
        </SidebarProvider>
        </div>
    );
}
