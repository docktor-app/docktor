import type {EnvironmentReport} from "@docktor/shared";

/**
 * Read model behind GET /api/settings/environment (#7, D-13). The report is
 * computed once at boot by the startup environment check; this service only
 * serves it, so the route never touches the process environment.
 */
export class EnvironmentStatusService {
    constructor(private readonly readReport: () => EnvironmentReport) {}

    getReport(): EnvironmentReport {
        return this.readReport();
    }
}
