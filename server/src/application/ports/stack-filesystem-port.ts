/**
 * Port for the stacks-directory filesystem dependency (D-07). Declared
 * here rather than consumers importing the concrete StackFilesystem
 * class, so application services stay unit-testable with a plain fake and
 * the dependency arrow keeps pointing inward (application depends on a
 * port, not on infrastructure/).
 */
export interface StackFilesystemPort {
    getStackDirectory(stackId: string): string;

    /** Creates the stack directory (mkdir -p); succeeds when it already exists. */
    createDirectory(stackId: string): Promise<string>;

    /**
     * Creates the stack directory only if it does not exist yet (leaf mkdir
     * without recursive) and rejects with ConflictError when it does, so a
     * caller that removes the directory on rollback only ever removes one it
     * created itself (D-09, CR-02).
     */
    createDirectoryExclusive(stackId: string): Promise<string>;

    writeCompose(stackId: string, content: string): Promise<void>;

    readCompose(stackId: string): Promise<string>;

    writeEnv(stackId: string, content: string): Promise<void>;

    readEnv(stackId: string): Promise<string>;

    removeEnv(stackId: string): Promise<void>;

    removeDirectory(stackId: string): Promise<void>;

    /**
     * Marks the stack directory as created by the migration run `ownerId` (a
     * marker file inside it). A rollback only removes a directory it still owns,
     * so a journal replayed after a restart can never delete a restored original
     * or a stack that has been in use since (CR-01, CR-02).
     */
    claimDirectory(stackId: string, ownerId: string): Promise<void>;

    /** Removes the ownership marker once the migration succeeded; a missing marker is not an error. */
    releaseDirectory(stackId: string, ownerId: string): Promise<void>;

    /** True only while the stack directory carries the marker of `ownerId`. A missing directory or marker is not owned. */
    ownsDirectory(stackId: string, ownerId: string): Promise<boolean>;
}
