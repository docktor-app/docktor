export interface ManagedStackLocation {
    readonly id: string;
    readonly displayName: string;
    readonly hostPath: string;
}

export interface ManagedStackRef {
    readonly id: string;
    readonly displayName: string;
}

export function findManagingStack(_composePath: string, _managed: readonly ManagedStackLocation[]): ManagedStackRef | null {
    return null;
}

export function annotateManagedStacks<T extends {readonly path: string}>(
    rows: readonly T[],
    _managed: readonly ManagedStackLocation[],
): Array<T & {managedStack: ManagedStackRef | null}> {
    return rows.map((row) => ({...row, managedStack: null}));
}
