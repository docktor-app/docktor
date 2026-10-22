import {describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {MigrationReviewStep} from "@/routes/setup/components/migration-review-step";
import type {CodeEditorProps} from "@/components/common/code-editor";
import type {UnifiedDiff} from "@/lib/stacks-api";

// CodeMirror has its own tests — a textarea with the same aria-label is enough here.
vi.mock("@/components/common/code-editor", () => ({
    CodeEditor: ({value, ariaLabel}: CodeEditorProps) => (
        <textarea aria-label={ariaLabel} value={value} readOnly onChange={() => undefined} />
    ),
}));

function diffOf(...lines: Array<["added" | "removed" | "context", string]>): UnifiedDiff {
    return {
        added: lines.filter(([kind]) => kind === "added").length,
        removed: lines.filter(([kind]) => kind === "removed").length,
        hunks: [
            {
                oldStart: 1,
                oldLines: lines.length,
                newStart: 1,
                newLines: lines.length,
                lines: lines.map(([kind, text], index) => ({
                    kind,
                    text,
                    oldLine: kind === "added" ? null : index + 1,
                    newLine: kind === "removed" ? null : index + 1,
                })),
            },
        ],
    };
}

const secretDiff = diffOf(
    ["removed", "      POSTGRES_PASSWORD: hunter2"],
    ["added", "      - DATABASE_URL=postgres://app:s3cret@db/app"],
);

describe("MigrationReviewStep secret masking (#103)", () => {
    it("masks secrets in removed and added diff lines and in the .env preview until revealed", async () => {
        const {container} = render(
            <MigrationReviewStep diff={secretDiff} extractedEnv="API_KEY=xyz" emptySources={[]} />,
        );

        expect(container).not.toHaveTextContent("hunter2");
        expect(container).not.toHaveTextContent("s3cret");
        expect(screen.getByRole("textbox", {name: "Extracted .env preview"})).toHaveValue("API_KEY=••••••••");

        expect(screen.getAllByRole("button", {name: "Show secrets"})).toHaveLength(1);
        await userEvent.click(screen.getByRole("button", {name: "Show secrets"}));

        expect(container).toHaveTextContent("hunter2");
        expect(container).toHaveTextContent("s3cret");
        expect(screen.getByRole("textbox", {name: "Extracted .env preview"})).toHaveValue("API_KEY=xyz");
        expect(screen.getByRole("button", {name: "Hide secrets"})).toHaveAttribute("aria-pressed", "true");
    });

    it("offers the toggle when only the diff holds a secret", () => {
        render(<MigrationReviewStep diff={secretDiff} extractedEnv="" emptySources={[]} />);

        expect(screen.getByRole("button", {name: "Show secrets"})).toBeInTheDocument();
    });

    it("offers the toggle when only the .env preview holds a secret", () => {
        render(<MigrationReviewStep diff={diffOf(["added", "    image: x"])} extractedEnv="API_KEY=xyz" emptySources={[]} />);

        expect(screen.getByRole("button", {name: "Show secrets"})).toBeInTheDocument();
    });

    it("shows no toggle when nothing is secret", () => {
        render(<MigrationReviewStep diff={diffOf(["added", "    image: x"])} extractedEnv="PORT=80" emptySources={[]} />);

        expect(screen.queryByRole("button", {name: /secrets/})).toBeNull();
    });

    it("keeps variable references visible", () => {
        const {container} = render(
            <MigrationReviewStep
                diff={diffOf(["added", "      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}"])}
                extractedEnv=""
                emptySources={[]}
            />,
        );

        expect(container).toHaveTextContent("${POSTGRES_PASSWORD}");
    });
});
