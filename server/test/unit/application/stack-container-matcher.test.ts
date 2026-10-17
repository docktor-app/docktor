import {describe, expect, it} from "vitest";

import type {OwnMountsPort, OwnMountsView} from "../../../src/application/ports/own-mounts-port.js";
import {StackContainerMatcher} from "../../../src/application/stack-container-matcher.js";
import {DirectoryIdentityResolver} from "../../../src/infrastructure/directory-identity-resolver.js";
import {hostViewDirectories} from "../../helpers/host-directory-identity.js";

const WORKING_DIR = "com.docker.compose.project.working_dir";

function containerView(view: OwnMountsView): StackContainerMatcher {
    const ownMounts: OwnMountsPort = {ownMounts: () => Promise.resolve(view)};
    return new StackContainerMatcher(new DirectoryIdentityResolver(ownMounts, (p) => Promise.resolve(p)));
}

describe("StackContainerMatcher", () => {
    describe("host view", () => {
        const matcher = new StackContainerMatcher(hostViewDirectories());
        const stack = {id: "app", hostPath: "/srv/app"};

        it("accepts a container started from the stack's directory", async () => {
            await expect(matcher.belongsTo(stack, {[WORKING_DIR]: "/srv/app"})).resolves.toBe(true);
        });

        it("rejects a container started from another directory", async () => {
            await expect(matcher.belongsTo(stack, {[WORKING_DIR]: "/home/u/app"})).resolves.toBe(false);
        });

        it("accepts a container without location labels (project rule)", async () => {
            await expect(matcher.belongsTo(stack, {})).resolves.toBe(true);
            await expect(matcher.belongsTo(stack, undefined)).resolves.toBe(true);
        });
    });

    describe("container view", () => {
        const matcher = containerView({
            kind: "container",
            mounts: [
                {type: "bind", source: "/", destination: "/host"},
                {type: "bind", source: "/opt/docktor/stacks", destination: "/opt/docktor/stacks"},
            ],
        });

        it("matches an adopted stack seen through /host to its host working_dir", async () => {
            const stack = {id: "app", hostPath: "/host/srv/app"};
            await expect(matcher.belongsTo(stack, {[WORKING_DIR]: "/srv/app"})).resolves.toBe(true);
        });

        it("matches a migrated stack at the same-path mount", async () => {
            const stack = {id: "memos", hostPath: "/opt/docktor/stacks/memos"};
            await expect(matcher.belongsTo(stack, {[WORKING_DIR]: "/opt/docktor/stacks/memos"})).resolves.toBe(true);
        });

        it("rejects the old copy of a migrated stack", async () => {
            const stack = {id: "memos", hostPath: "/opt/docktor/stacks/memos"};
            await expect(matcher.belongsTo(stack, {[WORKING_DIR]: "/srv/memos"})).resolves.toBe(false);
        });
    });

    it("falls back to the project rule while Docktor's own mounts are unknown", async () => {
        const matcher = containerView({kind: "unknown"});
        const stack = {id: "memos", hostPath: "/opt/docktor/stacks/memos"};
        await expect(matcher.belongsTo(stack, {[WORKING_DIR]: "/srv/memos"})).resolves.toBe(true);
    });
});
