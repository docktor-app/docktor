import type {AnalysisResult, BindMountInfo} from "../../infrastructure/compose-analyzer.js";

/**
 * Port for the compose-file compatibility-analysis dependency (D-07).
 * Declared here rather than consumers importing the concrete
 * ComposeAnalyzer class, so application services stay unit-testable with a
 * plain fake and the dependency arrow keeps pointing inward (application
 * depends on a port, not on infrastructure/).
 */
export interface ComposeAnalyzerPort {
    analyzeCompatibility(content: string): AnalysisResult;

    extractNamedVolumes(doc: any): string[];

    extractBindMounts(doc: any): BindMountInfo[];

    extractInlineEnvVars(doc: any): {serviceName: string; vars: Record<string, string>}[];
}

export type {AnalysisResult, BindMountInfo};
