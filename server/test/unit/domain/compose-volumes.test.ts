import {describe, expect, it} from "vitest";

import {findAnonymousVolumes, resolveComposeVolumeNames} from "../../../src/domain/compose-volumes.js";
import type {ProjectContainer} from "../../../src/domain/compose-project.js";

function composeWithVolumes(volumesBlock: string): string {
    return `services:\n  web:\n    image: nginx\nvolumes:\n${volumesBlock}`;
}

function resolve(composeContent: string, envContent: string | null = null): Record<string, {name: string; external: boolean}> {
    return Object.fromEntries(resolveComposeVolumeNames({composeContent, envContent, projectName: "myproj"}));
}

describe("resolveComposeVolumeNames", () => {
    it.each([
        ["a plain entry gets the project prefix", "  data:\n", null, {data: {name: "myproj_data", external: false}}],
        ["an empty mapping gets the project prefix", "  data: {}\n", null, {data: {name: "myproj_data", external: false}}],
        ["name: overrides the prefixed name", "  data:\n    name: custom\n", null, {data: {name: "custom", external: false}}],
        [
            "name: is interpolated from the .env",
            '  data:\n    name: "${PREFIX}_db"\n',
            "PREFIX=x\n",
            {data: {name: "x_db", external: false}},
        ],
        [
            "name: falls back to its default",
            '  data:\n    name: "${PREFIX:-fallback}_db"\n',
            null,
            {data: {name: "fallback_db", external: false}},
        ],
        ["external: true uses the key", "  data:\n    external: true\n", null, {data: {name: "data", external: true}}],
        [
            "external: true with name: uses the name",
            "  data:\n    external: true\n    name: shared\n",
            null,
            {data: {name: "shared", external: true}},
        ],
        [
            "the legacy external: {name} form uses that name",
            "  data:\n    external:\n      name: old\n",
            null,
            {data: {name: "old", external: true}},
        ],
        [
            "several entries resolve independently",
            "  a:\n  b:\n    external: true\n",
            null,
            {a: {name: "myproj_a", external: false}, b: {name: "b", external: true}},
        ],
    ])("%s", (_label, block, env, expected) => {
        expect(resolve(composeWithVolumes(block), env)).toEqual(expected);
    });

    it("answers an empty map without a top-level volumes block", () => {
        expect(resolve("services:\n  web:\n    image: nginx\n")).toEqual({});
    });

    it("answers an empty map for YAML that does not parse", () => {
        expect(resolve("services: [unterminated\n")).toEqual({});
    });

    it("gives an unresolvable name an empty name instead of guessing", () => {
        expect(resolve(composeWithVolumes('  data:\n    name: "${MISSING}_db"\n'))).toEqual({
            data: {name: "", external: false},
        });
    });
});

function container(service: string | null, mounts: ProjectContainer["mounts"]): ProjectContainer {
    return {id: "c1", name: `proj-${service ?? "x"}-1`, service, running: true, mounts};
}

const HEX_ID = "a".repeat(64);

describe("findAnonymousVolumes", () => {
    it.each([
        ["a short-form path without a colon", "services:\n  db:\n    image: x\n    volumes:\n      - /var/lib/x\n", [{service: "db", containerPath: "/var/lib/x"}]],
        [
            "a long-form volume without a source",
            "services:\n  web:\n    image: x\n    volumes:\n      - type: volume\n        target: /cache\n",
            [{service: "web", containerPath: "/cache"}],
        ],
        [
            "named and bind mounts are not anonymous",
            "services:\n  web:\n    image: x\n    volumes:\n      - data:/data\n      - ./conf:/conf\n      - type: volume\n        source: data\n        target: /d2\n      - type: bind\n        source: ./x\n        target: /x\n",
            [],
        ],
    ])("%s", (_label, composeContent, expected) => {
        expect(findAnonymousVolumes({composeContent, containers: []})).toEqual(expected);
    });

    it("reads container mounts of type volume whose name is 64 hex characters", () => {
        const containers = [
            container("db", [
                {type: "volume", name: HEX_ID, source: "/var/lib/docker/volumes/x/_data", destination: "/var/lib/postgresql/data"},
                {type: "volume", name: "myproj_data", source: "/var/lib/docker/volumes/y/_data", destination: "/data"},
                {type: "bind", source: "/srv", destination: "/srv"},
            ]),
        ];

        expect(findAnonymousVolumes({composeContent: "services: {}\n", containers})).toEqual([
            {service: "db", containerPath: "/var/lib/postgresql/data"},
        ]);
    });

    it("deduplicates compose and container findings and sorts by service then path", () => {
        const composeContent =
            "services:\n  web:\n    image: x\n    volumes:\n      - /b\n      - /a\n  db:\n    image: x\n    volumes:\n      - /var/lib/x\n";
        const containers = [
            container("db", [{type: "volume", name: HEX_ID, source: "/s", destination: "/var/lib/x"}]),
            container("web", [{type: "volume", name: HEX_ID, source: "/s", destination: "/a"}]),
        ];

        expect(findAnonymousVolumes({composeContent, containers})).toEqual([
            {service: "db", containerPath: "/var/lib/x"},
            {service: "web", containerPath: "/a"},
            {service: "web", containerPath: "/b"},
        ]);
    });

    it("still reports container mounts when the compose file does not parse", () => {
        const containers = [container("db", [{type: "volume", name: HEX_ID, source: "/s", destination: "/d"}])];

        expect(findAnonymousVolumes({composeContent: "services: [unterminated\n", containers})).toEqual([
            {service: "db", containerPath: "/d"},
        ]);
    });
});
