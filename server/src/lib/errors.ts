/**
 * Base of the typed error hierarchy. Wrap infrastructure errors (Docker, filesystem) in a typed
 * error and pass the original through `options.cause`; never assign `cause` after construction.
 */
export class AppError extends Error {
    constructor(
        message: string,
        public statusCode: number = 500,
        // Optional machine-readable discriminator, sent next to `error` by the global error handler.
        public code?: string,
        options?: ErrorOptions,
    ) {
        super(message, options);
        this.name = this.constructor.name;
    }
}

export class NotFoundError extends AppError {
    constructor(message = "Not found", options?: ErrorOptions) {
        super(message, 404, undefined, options);
    }
}

export class ConflictError extends AppError {
    constructor(message = "Conflict", options?: ErrorOptions) {
        super(message, 409, undefined, options);
    }
}

export class BadRequestError extends AppError {
    constructor(message = "Bad request", options?: ErrorOptions) {
        super(message, 400, undefined, options);
    }
}

export class ForbiddenError extends AppError {
    constructor(message = "Forbidden", code?: string, options?: ErrorOptions) {
        super(message, 403, code, options);
    }
}

export class UnauthorizedError extends AppError {
    constructor(message = "Unauthorized", options?: ErrorOptions) {
        super(message, 401, undefined, options);
    }
}

// Issue #18/D-01/D-03/T-12-01: thrown by StackService.updateStack when
// composeContent/envContent differs from what's on disk and the request
// doesn't carry confirmed: true — the server-side enforcement that makes the
// review-before-apply gate unbypassable by a direct API call. 428 (not 409)
// is the only place this status code appears in the codebase, matching the
// RFC 6585 "Precondition Required" semantics: the request is well-formed,
// but the server requires the client to carry out a precondition (reviewing
// the diff) that the request did not demonstrate.
export class ConfirmationRequiredError extends AppError {
    constructor(message = "Changes must be reviewed and confirmed before they are applied", options?: ErrorOptions) {
        super(message, 428, undefined, options);
    }
}

/** Narrows a Node errno error (e.g. `ENOENT`, `EEXIST`) without an unchecked cast. */
export function hasErrorCode(err: unknown, code: string): boolean {
    return typeof err === "object" && err !== null && "code" in err && err.code === code;
}
