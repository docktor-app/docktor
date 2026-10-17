import {describe, expect, it} from "vitest";

import {composeProjectDirectory} from "../../../src/domain/compose-labels.js";

const WORKING_DIR = "com.docker.compose.project.working_dir";
const CONFIG_FILES = "com.docker.compose.project.config_files";

describe("composeProjectDirectory", () => {
    it("prefers the trimmed working_dir", () => {
        expect(composeProjectDirectory({[WORKING_DIR]: "  /srv/app  ", [CONFIG_FILES]: "/other/c.yml"})).toBe("/srv/app");
    });

    it("falls back to config_files when working_dir is empty", () => {
        expect(composeProjectDirectory({[WORKING_DIR]: "  ", [CONFIG_FILES]: "/srv/app/docker-compose.yml"})).toBe("/srv/app");
    });

    it("uses the directory of the first absolute config_files entry", () => {
        expect(composeProjectDirectory({[CONFIG_FILES]: "a.yml, /srv/app/docker-compose.yml,/srv/app/override.yml"})).toBe("/srv/app");
    });

    it("returns null when only relative config_files entries exist", () => {
        expect(composeProjectDirectory({[CONFIG_FILES]: "a.yml,b/c.yml"})).toBeNull();
    });

    it("returns null without location labels or labels", () => {
        expect(composeProjectDirectory({})).toBeNull();
        expect(composeProjectDirectory(undefined)).toBeNull();
    });
});
