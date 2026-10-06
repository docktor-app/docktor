import {describe, expect, it} from "vitest";
import type {ComposeRuleId} from "@docktor/shared";
import {COMPOSE_RULE_EXPLANATIONS, COMPOSE_RULE_LABELS, composeFindingTone} from "@/lib/compose-rules";

// Mirrors shared/src/validation/settings.ts's COMPOSE_RULE_IDS — this test
// deliberately hardcodes the list (rather than importing it) so it fails
// loudly if the shared constant and this client-only copy drift apart.
const ALL_RULE_IDS: ComposeRuleId[] = [
    "privileged",
    "dockerSocket",
    "bindOutsideStack",
    "namedVolume",
    "inlineEnv",
    "missingEnvFile",
];

describe("compose-rules", () => {
    describe("COMPOSE_RULE_LABELS / COMPOSE_RULE_EXPLANATIONS", () => {
        it.each(ALL_RULE_IDS)("has a non-empty label and explanation for %s", (ruleId) => {
            expect(COMPOSE_RULE_LABELS[ruleId]).toBeTruthy();
            expect(COMPOSE_RULE_EXPLANATIONS[ruleId]).toBeTruthy();
        });

        it("uses the exact UI-SPEC copy for the three always-on (red) findings", () => {
            expect(COMPOSE_RULE_LABELS.privileged).toBe("Privileged container");
            expect(COMPOSE_RULE_LABELS.dockerSocket).toBe("Docker socket mounted");
            expect(COMPOSE_RULE_LABELS.bindOutsideStack).toBe("Bind mount outside stack directory");
        });

        it("uses the exact UI-SPEC copy for the three configurable (yellow) findings", () => {
            expect(COMPOSE_RULE_LABELS.namedVolume).toBe("Named volume");
            expect(COMPOSE_RULE_LABELS.inlineEnv).toBe("Inline environment variable");
            expect(COMPOSE_RULE_LABELS.missingEnvFile).toBe(".env not referenced");
        });

        it("every label is short and carries no trailing punctuation (UI-SPEC: 'no punctuation')", () => {
            for (const ruleId of ALL_RULE_IDS) {
                expect(COMPOSE_RULE_LABELS[ruleId]).not.toMatch(/[.!?]$/);
            }
        });
    });

    describe("composeFindingTone", () => {
        it("maps danger to red", () => {
            expect(composeFindingTone("danger")).toBe("red");
        });

        it("maps warning to yellow", () => {
            expect(composeFindingTone("warning")).toBe("yellow");
        });
    });
});
