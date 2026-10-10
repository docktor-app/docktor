/**
 * Answers whether a service's health is owned by an HTTP probe (D-07).
 *
 * A health signal owned by a probe must not be overwritten by Docker
 * observations: StatePoller and the post-deploy catch-up keep tracking the
 * container's state for such a service, but never write Docker's healthcheck
 * value over the probe's. The port keeps both free of compose parsing; the
 * answer comes from whoever reads the compose files (HealthProbeJob).
 *
 * Synchronous on purpose: implementations answer from memory.
 */
export interface ProbeOwnershipPort {
    isProbeOwned(stackId: string, serviceName: string): boolean;
}
