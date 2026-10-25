import {describe, expect, it} from "vitest";
import {
    AppError,
    BadRequestError,
    ConfirmationRequiredError,
    ConflictError,
    ForbiddenError,
    hasErrorCode,
    NotFoundError,
    UnauthorizedError,
} from "../../../src/lib/errors.js";

describe("AppError", () => {
    it("has default status code 500", () => {
        const error = new AppError("Something went wrong");

        expect(error.message).toBe("Something went wrong");
        expect(error.statusCode).toBe(500);
        expect(error.name).toBe("AppError");
        expect(error).toBeInstanceOf(Error);
    });

    it("accepts custom status code", () => {
        const error = new AppError("Custom", 418);

        expect(error.statusCode).toBe(418);
    });
});

describe("NotFoundError", () => {
    it("has status code 404", () => {
        const error = new NotFoundError();

        expect(error.message).toBe("Not found");
        expect(error.statusCode).toBe(404);
        expect(error.name).toBe("NotFoundError");
        expect(error).toBeInstanceOf(AppError);
    });

    it("accepts custom message", () => {
        const error = new NotFoundError("Stack not found");

        expect(error.message).toBe("Stack not found");
        expect(error.statusCode).toBe(404);
    });
});

describe("ConflictError", () => {
    it("has status code 409", () => {
        const error = new ConflictError();

        expect(error.message).toBe("Conflict");
        expect(error.statusCode).toBe(409);
        expect(error.name).toBe("ConflictError");
        expect(error).toBeInstanceOf(AppError);
    });

    it("accepts custom message", () => {
        const error = new ConflictError("Already exists");

        expect(error.message).toBe("Already exists");
    });
});

describe("BadRequestError", () => {
    it("has status code 400", () => {
        const error = new BadRequestError();

        expect(error.message).toBe("Bad request");
        expect(error.statusCode).toBe(400);
        expect(error.name).toBe("BadRequestError");
        expect(error).toBeInstanceOf(AppError);
    });

    it("accepts custom message", () => {
        const error = new BadRequestError("Invalid input");

        expect(error.message).toBe("Invalid input");
    });
});

describe("ForbiddenError", () => {
    it("has status code 403 and an optional machine-readable code", () => {
        const error = new ForbiddenError("No way", "SOME_CODE");

        expect(error.message).toBe("No way");
        expect(error.statusCode).toBe(403);
        expect(error.code).toBe("SOME_CODE");
        expect(error.name).toBe("ForbiddenError");
        expect(error).toBeInstanceOf(AppError);
    });

    it("has a default message and no code", () => {
        const error = new ForbiddenError();

        expect(error.message).toBe("Forbidden");
        expect(error.code).toBeUndefined();
    });
});

describe("UnauthorizedError", () => {
    it("has status code 401 and the message the 401 body has always carried", () => {
        const error = new UnauthorizedError();

        expect(error.message).toBe("Unauthorized");
        expect(error.statusCode).toBe(401);
        expect(error.name).toBe("UnauthorizedError");
        expect(error).toBeInstanceOf(AppError);
    });
});

describe("error cause", () => {
    const cause = new Error("root cause");

    it("AppError carries the cause through the constructor and keeps status, code and name", () => {
        const error = new AppError("wrapped", 502, "CODE", {cause});

        expect(error.cause).toBe(cause);
        expect(error.statusCode).toBe(502);
        expect(error.code).toBe("CODE");
        expect(error.name).toBe("AppError");
    });

    it("AppError has no cause unless one is given", () => {
        expect(new AppError("plain").cause).toBeUndefined();
        expect(Object.hasOwn(new AppError("plain"), "cause")).toBe(false);
    });

    it.each([
        ["NotFoundError", (options: ErrorOptions) => new NotFoundError("missing", options), 404],
        ["ConflictError", (options: ErrorOptions) => new ConflictError("taken", options), 409],
        ["BadRequestError", (options: ErrorOptions) => new BadRequestError("invalid", options), 400],
        ["UnauthorizedError", (options: ErrorOptions) => new UnauthorizedError("who", options), 401],
        ["ConfirmationRequiredError", (options: ErrorOptions) => new ConfirmationRequiredError("confirm", options), 428],
    ])("%s carries options.cause and keeps its status code", (name, create, statusCode) => {
        const error = create({cause});

        expect(error.cause).toBe(cause);
        expect(error.statusCode).toBe(statusCode);
        expect(error.name).toBe(name);
    });

    it("ForbiddenError carries options.cause after the optional code", () => {
        const error = new ForbiddenError("No way", "SOME_CODE", {cause});

        expect(error.cause).toBe(cause);
        expect(error.code).toBe("SOME_CODE");
        expect(error.statusCode).toBe(403);
    });

    it("subclasses without options have no cause", () => {
        expect(new NotFoundError().cause).toBeUndefined();
        expect(new ForbiddenError("x", "C").cause).toBeUndefined();
    });
});

describe("error codes", () => {
    it("leaves other AppError subclasses without a code", () => {
        expect(new BadRequestError().code).toBeUndefined();
        expect(new AppError("x", 418).code).toBeUndefined();
    });
});

describe("hasErrorCode", () => {
    it("is true for an error carrying the requested code", () => {
        const err = Object.assign(new Error("missing"), {code: "ENOENT"});

        expect(hasErrorCode(err, "ENOENT")).toBe(true);
    });

    it("is false for an error carrying a different code", () => {
        const err = Object.assign(new Error("denied"), {code: "EACCES"});

        expect(hasErrorCode(err, "ENOENT")).toBe(false);
    });

    it("is false for values that are not errno-shaped objects", () => {
        expect(hasErrorCode(null, "ENOENT")).toBe(false);
        expect(hasErrorCode("ENOENT", "ENOENT")).toBe(false);
        expect(hasErrorCode(new Error("no code"), "ENOENT")).toBe(false);
        expect(hasErrorCode({code: 2}, "ENOENT")).toBe(false);
    });
});
