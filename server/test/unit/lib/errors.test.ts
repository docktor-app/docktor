import {describe, expect, it} from "vitest";
import {AppError, BadRequestError, ConflictError, ForbiddenError, NotFoundError, UnauthorizedError} from "../../../src/lib/errors.js";

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

describe("error codes", () => {
    it("leaves other AppError subclasses without a code", () => {
        expect(new BadRequestError().code).toBeUndefined();
        expect(new AppError("x", 418).code).toBeUndefined();
    });
});
