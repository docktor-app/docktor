export class AppError extends Error {
    constructor(
        message: string,
        public statusCode: number = 500,
    ) {
        super(message);
        this.name = this.constructor.name;
    }
}

export class NotFoundError extends AppError {
    constructor(message = "Not found") {
        super(message, 404);
    }
}

export class ConflictError extends AppError {
    constructor(message = "Conflict") {
        super(message, 409);
    }
}

export class BadRequestError extends AppError {
    constructor(message = "Bad request") {
        super(message, 400);
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
    constructor(message = "Changes must be reviewed and confirmed before they are applied") {
        super(message, 428);
    }
}
