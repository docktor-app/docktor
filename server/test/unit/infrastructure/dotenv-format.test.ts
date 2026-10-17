import {describe, it, expect} from "vitest";
import {parseEnvAssignments} from "../../../src/domain/host-ports.js";
import {formatDotenvLine, isDotenvSafeValue, isInterpolationName} from "../../../src/infrastructure/dotenv-format.js";

describe("dotenv-format", () => {
    describe("isInterpolationName", () => {
        it.each(["FOO", "_x1", "A_B_2"])("accepts %s", (name) => {
            expect(isInterpolationName(name)).toBe(true);
        });

        it.each(["spring.datasource.url", "my-key", "1ABC", ""])("rejects %j", (name) => {
            expect(isInterpolationName(name)).toBe(false);
        });
    });

    describe("isDotenvSafeValue", () => {
        it.each(["bar", "s3cr#t", "hello world", "", "  padded  "])("accepts %j", (value) => {
            expect(isDotenvSafeValue(value)).toBe(true);
        });

        it.each([
            ["a dollar sign", "pa$$word"],
            ["a backslash", String.raw`C:\temp`],
            ["a single quote", "it's"],
            ["a double quote", 'say "hi"'],
            ["a line feed", "a\nb"],
            ["a carriage return", "a\rb"],
            ["a NUL character", "a\0b"],
        ])("rejects a value containing %s", (_label, value) => {
            expect(isDotenvSafeValue(value)).toBe(false);
        });
    });

    describe("formatDotenvLine", () => {
        it.each([
            ["FOO", "bar", "FOO=bar"],
            ["URL", "http://db:5432/app", "URL=http://db:5432/app"],
            ["EMPTY", "", "EMPTY="],
            ["PASS", "s3cr#t", "PASS='s3cr#t'"],
            ["GREETING", "hello world", "GREETING='hello world'"],
            ["PAD", "  padded  ", "PAD='  padded  '"],
        ])("writes %s as a line", (name, value, expected) => {
            expect(formatDotenvLine(name, value)).toBe(expected);
        });

        it.each(["bar", "http://db:5432/app", "", "s3cr#t", "hello world", "  padded  ", "a=b,c", "x y # z"])(
            "reads %j back unchanged",
            (value) => {
                expect(parseEnvAssignments(formatDotenvLine("KEY", value)).KEY).toBe(value);
            },
        );
    });
});
