import type {PoolConfig} from "pg";

/** A connect that cannot succeed (an unresolvable host) fails after this long. */
export const DB_CONNECTION_TIMEOUT_MS = 10_000;

/** How long a connection is idle before TCP keep-alive probes start. */
export const DB_KEEPALIVE_INITIAL_DELAY_MS = 10_000;

/**
 * Pool settings that keep Docktor's database connections usable while the
 * Docker daemon is stalled (UAT G-14-1).
 *
 * - Idle reaping is off (a zero idle timeout). pg-pool closes a connection
 *   after 10 s of idleness by default, and every new connection resolves the
 *   `db` host through Docker's embedded DNS, which dockerd serves. During a
 *   daemon freeze that lookup fails (EAI_AGAIN) after about 10 s. Established
 *   connections run over the kernel-side bridge and survive a freeze, so
 *   keeping them open keeps the database reachable.
 * - A connect is bounded (`connectionTimeoutMillis`), so a lookup that cannot
 *   succeed fails in at most 10 s instead of waiting without limit.
 * - TCP keep-alive detects a dead peer and keeps idle connections open.
 * - `max` is deliberately left at pg's default of 10. Postgres has no other
 *   client in Docktor's compose, so holding up to 10 idle connections is fine.
 */
export function buildPoolConfig(connectionString: string): PoolConfig {
    return {
        connectionString,
        idleTimeoutMillis: 0,
        keepAlive: true,
        keepAliveInitialDelayMillis: DB_KEEPALIVE_INITIAL_DELAY_MS,
        connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
    };
}
