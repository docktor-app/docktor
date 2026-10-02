import type {Rule} from "./rule.js";
import {PrivilegedRule} from "./privileged-rule.js";
import {DockerSocketRule} from "./docker-socket-rule.js";
import {BindOutsideStackRule} from "./bind-outside-stack-rule.js";
import {NamedVolumeRule} from "./named-volume-rule.js";
import {InlineEnvRule} from "./inline-env-rule.js";
import {MissingEnvFileRule} from "./missing-env-file-rule.js";

/**
 * D-12: the hardcoded registry of every built-in compose-check rule. This
 * array IS the evaluation/output order (probe #20 ordering) — registration
 * order here is findings order in ComposeRuleEngine.evaluate(). One line per
 * rule; adding a new built-in rule is a one-file change (the rule class)
 * plus one line here. No rule is ever loaded from outside this repository
 * at runtime — no plugin directory, no dynamic import, no user-supplied
 * rule code (D-12 / PROJECT.md "Plugin system" stays out of scope).
 */
export const BUILT_IN_COMPOSE_RULES: readonly Rule[] = [
    new PrivilegedRule(),
    new DockerSocketRule(),
    new BindOutsideStackRule(),
    new NamedVolumeRule(),
    new InlineEnvRule(),
    new MissingEnvFileRule(),
];
