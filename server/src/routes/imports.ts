import type {FastifyPluginAsyncZod} from "fastify-type-provider-zod";
import {requireAuth} from "../lib/auth-middleware.js";
import {onboardingService} from "../application/onboarding-service.js";
import {migrationService} from "../application/migration-service.js";
import {migrationOperationService} from "../application/migration-operation-service.js";
import {
    brownfieldAdoptSchema,
    migrationExecuteSchema,
    migrationOperationParamsSchema,
    migrationPreviewSchema,
    wizardStep5Schema,
} from "@docktor/shared";

// T-05.1-32/T-05.1-33: this plugin gives an authenticated user, after the
// setup wizard has closed, its own reachable copy of the brownfield
// scan/adopt/migrate capability that server/src/routes/setup.ts exposes only
// while the wizard is incomplete. Every route here is gated by requireAuth
// as the plugin's very first statement — the exact regression guard against
// the original filed blocker (unauthenticated /api/setup/scan + /adopt).
const importRoutes: FastifyPluginAsyncZod = async (app) => {
    app.addHook("onRequest", requireAuth);

    // Scan filesystem for existing compose stacks
    app.post(
        "/api/stacks/import/scan",
        {
            schema: {
                body: wizardStep5Schema,
            },
        },
        async (request) => {
            const {directories} = request.body;
            const result = await onboardingService.scan(directories);
            return result;
        },
    );

    // Adopt a discovered stack in-place
    app.post(
        "/api/stacks/import/adopt",
        {
            schema: {
                body: brownfieldAdoptSchema,
            },
        },
        async (request) => {
            const {composePath, displayName} = request.body;
            const result = await onboardingService.adoptInPlace(composePath, displayName);
            return result;
        },
    );

    // Preview migration changes
    app.post(
        "/api/stacks/import/migrate/preview",
        {
            schema: {
                body: migrationPreviewSchema,
            },
        },
        async (request) => {
            const {namedVolumeSelections, ...rest} = request.body;
            return migrationService.previewMigration({
                ...rest,
                namedVolumeSelections: new Map(Object.entries(namedVolumeSelections)),
            });
        },
    );

    // Start a migration as a background operation (G-18-job): refusals answer
    // synchronously, an accepted migration answers 202 with its operation.
    app.post(
        "/api/stacks/import/migrate",
        {
            schema: {
                body: migrationExecuteSchema,
            },
        },
        async (request, reply) => {
            const {namedVolumeSelections, ...rest} = request.body;
            const operation = await migrationOperationService.start({
                ...rest,
                namedVolumeSelections: new Map(Object.entries(namedVolumeSelections)),
            });
            return reply.status(202).send(operation);
        },
    );

    // Read one operation, e.g. to resync after a reload
    app.get(
        "/api/stacks/import/migrations/:operationId",
        {
            schema: {
                params: migrationOperationParamsSchema,
            },
        },
        async (request) => migrationOperationService.get(request.params.operationId),
    );
};

export default importRoutes;
