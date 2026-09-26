import {describe, expect, it} from "vitest";
import {
    decideDomainAssignment,
    filterUnadoptedDomains,
    resolveCertificateBinding,
    type ProxyConfigRowLike,
} from "../../../src/domain/proxy-idempotency.js";
import {BadRequestError} from "../../../src/lib/errors.js";

describe("decideDomainAssignment", () => {
    it("decides to create a new row with nothing to repoint when no rows exist for the service", () => {
        const decision = decideDomainAssignment([], "web", "app.example.com", 8080);

        expect(decision).toEqual({action: "create", repointRowIds: []});
    });

    it("reuses the row matching the requested domain and lists every sibling row whose internal port differs for repointing", () => {
        const rows: ProxyConfigRowLike[] = [
            {id: "row-a", domain: "app.example.com", internalPort: 8080},
            {id: "row-b", domain: "b.example.com", internalPort: 9090},
            {id: "row-c", domain: "c.example.com", internalPort: 8080},
        ];

        const decision = decideDomainAssignment(rows, "web", "app.example.com", 9090);

        expect(decision).toEqual({
            action: "reuse",
            existingRowId: "row-a",
            repointRowIds: ["row-c"],
        });
    });

    it("reuses the row matching the requested domain and requested port, listing nothing to repoint", () => {
        const rows: ProxyConfigRowLike[] = [
            {id: "row-a", domain: "app.example.com", internalPort: 8080},
            {id: "row-b", domain: "b.example.com", internalPort: 8080},
        ];

        const decision = decideDomainAssignment(rows, "web", "app.example.com", 8080);

        expect(decision).toEqual({action: "reuse", existingRowId: "row-a", repointRowIds: []});
    });

    it("refuses with a BadRequestError naming the conflicting port when no row matches the domain and a sibling row uses a different internal port", () => {
        const rows: ProxyConfigRowLike[] = [{id: "row-a", domain: "existing.example.com", internalPort: 8080}];

        expect(() => decideDomainAssignment(rows, "web", "new.example.com", 9090)).toThrow(BadRequestError);
        expect(() => decideDomainAssignment(rows, "web", "new.example.com", 9090)).toThrow(
            'Service "web" is already proxied on port 8080 — all domains for one service must share the same internal port',
        );
    });

    it("decides to create a new row with nothing to repoint when no row matches the domain but every sibling row already uses the requested internal port", () => {
        const rows: ProxyConfigRowLike[] = [
            {id: "row-a", domain: "a.example.com", internalPort: 8080},
            {id: "row-b", domain: "b.example.com", internalPort: 8080},
        ];

        const decision = decideDomainAssignment(rows, "web", "new.example.com", 8080);

        expect(decision).toEqual({action: "create", repointRowIds: []});
    });
});

describe("resolveCertificateBinding", () => {
    it("returns a null certificate reference for the automatic source regardless of any id supplied", () => {
        expect(resolveCertificateBinding("acme", "cert-1")).toEqual({certSource: "acme", certificateId: null});
        expect(resolveCertificateBinding("acme", undefined)).toEqual({certSource: "acme", certificateId: null});
        expect(resolveCertificateBinding(undefined, "cert-1")).toEqual({certSource: "acme", certificateId: null});
    });

    it("refuses with a BadRequestError naming the missing id when the custom source has no certificateId", () => {
        expect(() => resolveCertificateBinding("custom", undefined)).toThrow(BadRequestError);
        expect(() => resolveCertificateBinding("custom", undefined)).toThrow(
            "certificateId is required when certSource is custom",
        );
        expect(() => resolveCertificateBinding("custom", null)).toThrow(
            "certificateId is required when certSource is custom",
        );
    });

    it("returns the custom source with its certificateId when one is supplied", () => {
        expect(resolveCertificateBinding("custom", "cert-1")).toEqual({certSource: "custom", certificateId: "cert-1"});
    });
});

describe("filterUnadoptedDomains", () => {
    it("returns only the domains not already assigned, preserving input order", () => {
        const discovered = ["c.example.com", "a.example.com", "b.example.com"];
        const alreadyAssigned = new Set(["a.example.com"]);

        expect(filterUnadoptedDomains(discovered, alreadyAssigned)).toEqual(["c.example.com", "b.example.com"]);
    });

    it("returns every discovered domain when none are already assigned", () => {
        const discovered = ["a.example.com", "b.example.com"];

        expect(filterUnadoptedDomains(discovered, new Set())).toEqual(discovered);
    });

    it("returns an empty list when every discovered domain is already assigned", () => {
        const discovered = ["a.example.com", "b.example.com"];

        expect(filterUnadoptedDomains(discovered, new Set(discovered))).toEqual([]);
    });
});
