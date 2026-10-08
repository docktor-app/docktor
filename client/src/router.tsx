import * as ReactRouterCore from "react-router";
import {createRoutesFromElements, Navigate, Route} from "react-router";
import {AppLayout} from "@/components/app-layout";
import {FirstRunGate} from "@/components/domain/auth/first-run-gate";
import {ProtectedRoute} from "@/components/domain/auth/protected-route";
import Dashboard from "@/routes/app/dashboard";
import StacksPage from "@/routes/app/stacks/index";
import CreateStackPage from "@/routes/app/stacks/create";
import TemplateBrowsePage from "@/routes/app/stacks/templates";
import ImportStackPage from "@/routes/app/stacks/import";
import StackDetailPage from "@/routes/app/stacks/[id]";
import SettingsPage from "@/routes/app/settings";
import StoragePage from "@/routes/app/storage";
import BackupDetailPage from "@/routes/app/stacks/backups/[backupId]";
import LoginPage from "@/routes/auth/login";
import SignupPage from "@/routes/auth/signup";
import SetupPage from "@/routes/setup";

// D-router (11-10): the app's single route tree, now served through a data
// router so react-router's useBlocker (the unsaved-changes guard) is
// available — useBlocker throws under the declarative BrowserRouter this
// replaces. Same paths, same elements, same order as before the conversion.
//
// The router-constructor export below is reached through the namespace
// import above (rather than a named import) so the export line is the only
// place its name appears in this file — do not "simplify" this to a named
// import without re-checking 11-10-PLAN.md's router.tsx acceptance criteria.
export const router = ReactRouterCore.createBrowserRouter(
    createRoutesFromElements(
        <>
            <Route
                path="/login"
                element={
                    <FirstRunGate>
                        <LoginPage />
                    </FirstRunGate>
                }
            />
            <Route
                path="/signup"
                element={
                    <FirstRunGate>
                        <SignupPage />
                    </FirstRunGate>
                }
            />
            <Route path="/setup" element={<SetupPage />} />
            <Route
                element={
                    <ProtectedRoute>
                        <AppLayout />
                    </ProtectedRoute>
                }
            >
                <Route path="/" element={<Dashboard />} />
                <Route path="/stacks" element={<StacksPage />} />
                <Route path="/stacks/create" element={<CreateStackPage />} />
                <Route path="/stacks/create/templates" element={<TemplateBrowsePage />} />
                <Route path="/stacks/import" element={<ImportStackPage />} />
                <Route path="/stacks/:id/backups/:backupId" element={<BackupDetailPage />} />
                <Route path="/stacks/:id/:tab?" element={<StackDetailPage />} />
                <Route path="/storage" element={<StoragePage />} />
                <Route path="/settings" element={<Navigate to="/settings/general" replace />} />
                <Route path="/settings/:tab" element={<SettingsPage />} />
            </Route>
        </>,
    ),
);
