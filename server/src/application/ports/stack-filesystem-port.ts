/**
 * Port for the stacks-directory filesystem dependency (D-07). Declared
 * here rather than consumers importing the concrete StackFilesystem
 * class, so application services stay unit-testable with a plain fake and
 * the dependency arrow keeps pointing inward (application depends on a
 * port, not on infrastructure/).
 */
export interface StackFilesystemPort {
    getStackDirectory(stackId: string): string;

    createDirectory(stackId: string): Promise<string>;

    writeCompose(stackId: string, content: string): Promise<void>;

    readCompose(stackId: string): Promise<string>;

    writeEnv(stackId: string, content: string): Promise<void>;

    readEnv(stackId: string): Promise<string>;

    removeEnv(stackId: string): Promise<void>;

    removeDirectory(stackId: string): Promise<void>;
}
