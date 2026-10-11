import {useEffect, useRef} from "react";
import {Navigate, useLocation} from "react-router";
import {useSession} from "@/lib/auth-client";
import {ENROLLMENT_REQUIRED_EVENT} from "@/lib/api";
import {accountSecurityStore, useAccountSecurity} from "@/hooks/use-account-security";
import {FirstRunGate} from "@/components/domain/auth/first-run-gate";

export interface ProtectedRouteProps {
    children: React.ReactNode;
}

const ACCOUNT_PATH = "/account";

function LoadingView(): React.JSX.Element {
    return (
        <div className="flex min-h-screen items-center justify-center">
            <p className="text-muted-foreground">Loading...</p>
        </div>
    );
}

/**
 * Gates every authenticated route: shows a loading state while the session
 * resolves, diverts a session-less visitor through FirstRunGate (which
 * routes to /setup on a first-run instance, or renders the /login redirect
 * otherwise), and renders the protected content once a session exists.
 *
 * When the instance requires two-factor and the signed-in user has none
 * (D-01), every route except /account redirects there. That redirect is UX
 * only: requireAuth answers 403 to every gated API call regardless of the
 * client, so a failed status fetch renders the children rather than blocking.
 */
export function ProtectedRoute({children}: Readonly<ProtectedRouteProps>): React.JSX.Element {
    const {data: session, isPending} = useSession();
    const {pathname} = useLocation();
    // enabled: false keeps signed-out visitors from requesting the status.
    const {status, loading, refresh} = useAccountSecurity({enabled: Boolean(session)});
    const userId = session?.user.id;
    const lastUserId = useRef<string | undefined>(undefined);

    // The status belongs to one user: drop it on sign-out or when another user signs in.
    useEffect(() => {
        const previous = lastUserId.current;
        lastUserId.current = userId;
        if (previous !== undefined && previous !== userId) {
            accountSecurityStore.reset();
            if (userId !== undefined) {
                void accountSecurityStore.refresh();
            }
        }
    }, [userId]);

    // The server was the first to notice (e.g. the requirement was switched on in another session).
    useEffect(() => {
        if (userId === undefined) {
            return undefined;
        }
        const onEnrollmentRequired = (): void => {
            void refresh();
        };
        globalThis.addEventListener(ENROLLMENT_REQUIRED_EVENT, onEnrollmentRequired);
        return () => globalThis.removeEventListener(ENROLLMENT_REQUIRED_EVENT, onEnrollmentRequired);
    }, [userId, refresh]);

    if (isPending) {
        return <LoadingView/>;
    }

    if (!session) {
        return (
            <FirstRunGate>
                <Navigate to="/login" replace />
            </FirstRunGate>
        );
    }

    if (status === null && loading) {
        return <LoadingView/>;
    }

    if (status?.enrollmentRequired && pathname !== ACCOUNT_PATH) {
        return <Navigate to="/account" replace />;
    }

    return <>{children}</>;
}
