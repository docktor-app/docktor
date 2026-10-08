import type {ProbeOutcome} from "../../domain/health-probe.js";

/** One HTTP probe to run against a service's own container. */
export interface ProbeRequest {
    containerId: string;
    /** The URL from the compose file; the transport re-validates it before any I/O. */
    url: string;
    timeoutMs: number;
}

/**
 * The result of one probe. `containerStartedAt` is the container's
 * `State.StartedAt` as read for this probe (null when the container could not
 * be inspected); the consumer compares it to spot a restarted container.
 */
export interface ProbeObservation {
    containerStartedAt: string | null;
    outcome: ProbeOutcome;
}

/**
 * Port for issuing an HTTP probe against a container (D-07: application code
 * and jobs depend on this interface, never the concrete ProbeTransport class,
 * so they stay unit-testable with a plain fake).
 *
 * The adapter never rejects: every failure, including an invalid URL or an
 * unreachable container, is reported as a failed ProbeOutcome (fail-closed,
 * D-02).
 */
export interface ProbeTransportPort {
    probe(request: ProbeRequest): Promise<ProbeObservation>;
}
