import type {FastifyPluginAsyncZod} from "fastify-type-provider-zod";
import {z} from "zod";
import {onboardingService} from "../application/onboarding-service.js";
import {migrationService} from "../application/migration-service.js";
import {
    wizardStep1Schema,
    wizardStep2Schema,
    wizardStep3Schema,
    wizardStep4Schema,
    wizardStep5Schema,
    wizardStep6Schema,
} from "@docktor/shared";

const setupRoutes: FastifyPluginAsyncZod = async (app) => {
    // CR-01/T-05-09: every /api/setup/* route beyond step 1 must stop being
    // reachable once the wizard is genuinely finished — otherwise an
    // unauthenticated caller can rewrite backup/SMTP credentials or trigger
    // filesystem scans/migrations forever. Gate on the durable
    // `isWizardComplete()` marker, NOT on `userCount > 0`: step1 creates the
    // admin, so userCount becomes 1 the instant step1 succeeds — long before
    // steps 2-5/adopt/migrate are actually done. Gating on userCount alone
    // 410s the just-created admin out of their own wizard after step 1.
    app.addHook("preHandler", async (request, reply) => {
        if (request.method === "GET" && request.url === "/api/setup/status") return;
        if (request.url === "/api/setup/step1") return;

        if (await onboardingService.isWizardComplete()) {
            return reply.status(410).send({error: "Setup already complete"});
        }
    });

    // Check if setup is complete (users exist)
    app.get("/api/setup/status", async () => {
        const setupComplete = await onboardingService.hasAnyUser();
        return {setupComplete};
    });

    // Step 1: Create admin account (public)
    app.post(
        "/api/setup/step1",
        {
            schema: {
                body: wizardStep1Schema,
            },
        },
        async (request, reply) => {
            // Prevent creating more users if setup is complete
            if (await onboardingService.hasAnyUser()) {
                return reply.status(400).send({error: "Setup already complete"});
            }

            // WR-07: the concurrency guard (an atomic lock-row insert whose
            // uniqueness violation rejects a losing concurrent request) now
            // lives in OnboardingService.createAdminWithLock() — see its
            // doc comment for the full race-window explanation.
            return onboardingService.createAdminWithLock(request.body);
        },
    );

    // Step 2: Configure instance settings (requires auth after step 1)
    app.post(
        "/api/setup/step2",
        {
            schema: {
                body: wizardStep2Schema,
            },
        },
        async (request) => {
            await onboardingService.handleWizardStep2(request.body);
            return {success: true};
        },
    );

    // Step 3: Configure backup repository (optional)
    app.post(
        "/api/setup/step3",
        {
            schema: {
                body: wizardStep3Schema,
            },
        },
        async (request) => {
            await onboardingService.handleWizardStep3(request.body);
            return {success: true};
        },
    );

    // Step 4: Configure SMTP (optional)
    app.post(
        "/api/setup/step4",
        {
            schema: {
                body: wizardStep4Schema,
            },
        },
        async (request) => {
            await onboardingService.handleWizardStep4(request.body);
            return {success: true};
        },
    );

    // Step 5: Brownfield scan
    app.post(
        "/api/setup/scan",
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

    // Adopt stack in-place
    app.post(
        "/api/setup/adopt",
        {
            schema: {
                body: z.object({
                    composePath: z.string(),
                    displayName: z.string().min(1),
                }),
            },
        },
        async (request) => {
            const {composePath, displayName} = request.body;
            // WR-05: file I/O now lives in OnboardingService.adoptInPlace —
            // the route only extracts/validates the body and delegates.
            const result = await onboardingService.adoptInPlace(composePath, displayName);
            return result;
        },
    );

    // Preview migration changes
    app.post(
        "/api/setup/migrate/preview",
        {
            schema: {
                body: z.object({
                    composePath: z.string(),
                    volumeSelections: z.array(z.object({
                        originalPath: z.string(),
                        newPath: z.string(),
                        convert: z.boolean(),
                    })),
                    namedVolumeSelections: z.record(z.string(), z.boolean()),
                }),
            },
        },
        async (request) => {
            const {composePath, volumeSelections, namedVolumeSelections} = request.body;
            const namedVolMap = new Map(Object.entries(namedVolumeSelections) as [string, boolean][]);
            const result = await migrationService.previewMigration(composePath, volumeSelections, namedVolMap);
            return result;
        },
    );

    // Execute migration
    app.post(
        "/api/setup/migrate",
        {
            schema: {
                body: z.object({
                    composePath: z.string(),
                    displayName: z.string().min(1),
                    volumeSelections: z.array(z.object({
                        originalPath: z.string(),
                        newPath: z.string(),
                        convert: z.boolean(),
                    })),
                    namedVolumeSelections: z.record(z.string(), z.boolean()),
                }),
            },
        },
        async (request) => {
            const {composePath, displayName, volumeSelections, namedVolumeSelections} = request.body;
            const namedVolMap = new Map(Object.entries(namedVolumeSelections) as [string, boolean][]);
            const result = await migrationService.migrate({
                composePath,
                displayName,
                volumeSelections,
                namedVolumeSelections: namedVolMap,
            });
            return result;
        },
    );

    // Step 6: Deploy the managed proxy stack (optional, terminal step — D-09/D-10)
    app.post(
        "/api/setup/step6",
        {
            schema: {
                body: wizardStep6Schema,
            },
        },
        async (request, reply) => {
            // The plugin's preHandler above only closes this route once the
            // wizard is *finished* (isWizardComplete()) — before an admin
            // exists it would otherwise stay reachable, since hasAnyUser()
            // only becomes true once step1 succeeds. Mirrors
            // /api/setup/complete's own guard below.
            if (!(await onboardingService.hasAnyUser())) {
                return reply
                    .status(400)
                    .send({error: "Cannot deploy the proxy stack before creating an admin account"});
            }

            await onboardingService.handleWizardStep6(request.body);
            return {success: true};
        },
    );

    // T-05-09: mark the wizard as fully complete. Called once by the client
    // at the very end of the wizard (Finish, or Skip on the final step).
    // After this succeeds, the preHandler above permanently closes every
    // /api/setup/* route beyond /status, same as the old (broken)
    // "userCount > 0" gate intended.
    app.post("/api/setup/complete", async (_request, reply) => {
        if (!(await onboardingService.hasAnyUser())) {
            return reply
                .status(400)
                .send({error: "Cannot complete setup before creating an admin account"});
        }

        await onboardingService.completeWizard();
        return reply.send({success: true});
    });
};

export default setupRoutes;
