import {Navigate} from "react-router";
import {useSession} from "@/lib/auth-client";
import {FirstRunGate} from "@/components/domain/auth/first-run-gate";

export interface ProtectedRouteProps {
    children: React.ReactNode;
}

/**
 * Gates every authenticated route: shows a loading state while the session
 * resolves, diverts a session-less visitor through FirstRunGate (which
 * routes to /setup on a first-run instance, or renders the /login redirect
 * otherwise), and renders the protected content once a session exists.
 */
export function ProtectedRoute({children}: Readonly<ProtectedRouteProps>): React.JSX.Element {
    const {data: session, isPending} = useSession();

    if (isPending) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <p className="text-muted-foreground">Loading...</p>
            </div>
        );
    }

    if (!session) {
        return (
            <FirstRunGate>
                <Navigate to="/login" replace />
            </FirstRunGate>
        );
    }

    return <>{children}</>;
}
