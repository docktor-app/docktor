import {describe, expect, it} from "vitest";
import * as repositoriesIndex from "../../../src/repositories/index.js";
import {stackRepository} from "../../../src/repositories/stack-repository.js";
import {stackEventRepository} from "../../../src/repositories/stack-event-repository.js";
import {settingsRepository} from "../../../src/repositories/settings-repository.js";
import {notificationRepository} from "../../../src/repositories/notification-repository.js";
import {backupRepository} from "../../../src/repositories/backup-repository.js";
import {proxyRepository} from "../../../src/repositories/proxy-repository.js";
import {certificateRepository} from "../../../src/repositories/certificate-repository.js";
import {imageUpdateCheckRepository} from "../../../src/repositories/image-update-check-repository.js";
import {userRepository} from "../../../src/repositories/user-repository.js";

// repositories/index.ts is the single source of repository singletons for
// the whole composition root (D-09). Every export here must be
// reference-identical to the singleton its own module exports — a second
// instance constructed anywhere is a correctness bug (split in-memory
// state), not a style choice.
describe("repositories/index.ts", () => {
    const expectedSingletons: Array<[string, unknown]> = [
        ["stackRepository", stackRepository],
        ["stackEventRepository", stackEventRepository],
        ["settingsRepository", settingsRepository],
        ["notificationRepository", notificationRepository],
        ["backupRepository", backupRepository],
        ["proxyRepository", proxyRepository],
        ["certificateRepository", certificateRepository],
        ["imageUpdateCheckRepository", imageUpdateCheckRepository],
        ["userRepository", userRepository],
    ];

    for (const [name, ownModuleSingleton] of expectedSingletons) {
        it(`exports a defined ${name}`, () => {
            expect((repositoriesIndex as Record<string, unknown>)[name]).toBeDefined();
        });

        it(`${name} is reference-identical to the singleton exported by its own module`, () => {
            expect((repositoriesIndex as Record<string, unknown>)[name]).toBe(ownModuleSingleton);
        });
    }
});
