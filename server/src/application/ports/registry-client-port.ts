/**
 * Port for the container-registry HTTP client dependency (D-07). Declared
 * here rather than consumers importing the concrete RegistryClient class,
 * so application services stay unit-testable with a plain fake and the
 * dependency arrow keeps pointing inward (application depends on a port,
 * not on infrastructure/).
 *
 * `RegistryUnavailableError` is deliberately not part of this port — it is
 * a typed error in the `lib/errors.ts` hierarchy that callers catch by
 * identity (see `jobs/update-checker.ts`), and stays exported from
 * `infrastructure/registry-client.ts` as today.
 */
export interface RegistryClientPort {
    listTags(imageRef: string): Promise<string[] | null>;
}
