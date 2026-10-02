import {describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {DiffConfirmDialog, type ReviewSubject} from "@/components/domain/stack/diff-confirm-dialog";
import type {UnifiedDiff} from "@/lib/stacks-api";

const sampleDiff: UnifiedDiff = {
    added: 1,
    removed: 1,
    hunks: [
        {
            oldStart: 1,
            oldLines: 1,
            newStart: 1,
            newLines: 1,
            lines: [
                {kind: "removed", text: "old line", oldLine: 1, newLine: null},
                {kind: "added", text: "new line", oldLine: null, newLine: 1},
            ],
        },
    ],
};

function makeSubject(file: "compose" | "env", diff: UnifiedDiff = sampleDiff): ReviewSubject {
    return {kind: "edit", file, diff};
}

describe("DiffConfirmDialog", () => {
    it("shows the compose title when subject.file is compose", () => {
        render(
            <DiffConfirmDialog
                open
                stackName="My App"
                subject={makeSubject("compose")}
                onConfirm={vi.fn()}
                onCancel={vi.fn()}
            />,
        );
        expect(screen.getByText("Review changes to My App")).toBeVisible();
    });

    it("shows the env title (with 's environment) when subject.file is env", () => {
        render(
            <DiffConfirmDialog
                open
                stackName="My App"
                subject={makeSubject("env")}
                onConfirm={vi.fn()}
                onCancel={vi.fn()}
            />,
        );
        expect(screen.getByText("Review changes to My App's environment")).toBeVisible();
    });

    it("Keep Editing calls onCancel", async () => {
        const onCancel = vi.fn();
        render(
            <DiffConfirmDialog
                open
                stackName="My App"
                subject={makeSubject("compose")}
                onConfirm={vi.fn()}
                onCancel={onCancel}
            />,
        );
        await userEvent.click(screen.getByRole("button", {name: "Keep Editing"}));
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("Confirm & Apply calls onConfirm and never onCancel", async () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        render(
            <DiffConfirmDialog
                open
                stackName="My App"
                subject={makeSubject("compose")}
                onConfirm={onConfirm}
                onCancel={onCancel}
            />,
        );
        await userEvent.click(screen.getByRole("button", {name: "Confirm & Apply"}));
        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(onCancel).not.toHaveBeenCalled();
    });

    it("renders the diff content via UnifiedDiffView", () => {
        render(
            <DiffConfirmDialog
                open
                stackName="My App"
                subject={makeSubject("compose")}
                onConfirm={vi.fn()}
                onCancel={vi.fn()}
            />,
        );
        expect(screen.getByText("old line")).toBeVisible();
        expect(screen.getByText("new line")).toBeVisible();
    });

    it("shows the added/removed line counts", () => {
        render(
            <DiffConfirmDialog
                open
                stackName="My App"
                subject={makeSubject("compose")}
                onConfirm={vi.fn()}
                onCancel={vi.fn()}
            />,
        );
        expect(screen.getByText("1 line(s) added, 1 line(s) removed.")).toBeVisible();
    });

    it("renders nothing when not open", () => {
        render(
            <DiffConfirmDialog
                open={false}
                stackName="My App"
                subject={makeSubject("compose")}
                onConfirm={vi.fn()}
                onCancel={vi.fn()}
            />,
        );
        expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    describe("T-12-02: env secret masking", () => {
        const secretDiff: UnifiedDiff = {
            added: 2,
            removed: 0,
            hunks: [
                {
                    oldStart: 1,
                    oldLines: 0,
                    newStart: 1,
                    newLines: 2,
                    lines: [
                        {kind: "added", text: "DB_PASSWORD=hunter2", oldLine: null, newLine: 1},
                        {kind: "added", text: "TZ=UTC", oldLine: null, newLine: 2},
                    ],
                },
            ],
        };

        it("masks a secret-looking env line and shows the reveal toggle", () => {
            render(
                <DiffConfirmDialog
                    open
                    stackName="My App"
                    subject={makeSubject("env", secretDiff)}
                    onConfirm={vi.fn()}
                    onCancel={vi.fn()}
                />,
            );
            expect(screen.getByText("DB_PASSWORD=••••••••")).toBeVisible();
            expect(screen.queryByText("DB_PASSWORD=hunter2")).not.toBeInTheDocument();
            expect(screen.getByText("TZ=UTC")).toBeVisible();
            expect(screen.getByRole("button", {name: "Show secret values"})).toBeVisible();
        });

        it("reveals the secret value after clicking 'Show secret values', then hides it again", async () => {
            render(
                <DiffConfirmDialog
                    open
                    stackName="My App"
                    subject={makeSubject("env", secretDiff)}
                    onConfirm={vi.fn()}
                    onCancel={vi.fn()}
                />,
            );

            await userEvent.click(screen.getByRole("button", {name: "Show secret values"}));
            expect(screen.getByText("DB_PASSWORD=hunter2")).toBeVisible();

            await userEvent.click(screen.getByRole("button", {name: "Hide secret values"}));
            expect(screen.getByText("DB_PASSWORD=••••••••")).toBeVisible();
        });

        it("renders no reveal toggle when no line was masked", () => {
            const noSecretDiff: UnifiedDiff = {
                added: 1,
                removed: 0,
                hunks: [
                    {
                        oldStart: 1,
                        oldLines: 0,
                        newStart: 1,
                        newLines: 1,
                        lines: [{kind: "added", text: "TZ=UTC", oldLine: null, newLine: 1}],
                    },
                ],
            };
            render(
                <DiffConfirmDialog
                    open
                    stackName="My App"
                    subject={makeSubject("env", noSecretDiff)}
                    onConfirm={vi.fn()}
                    onCancel={vi.fn()}
                />,
            );
            expect(screen.queryByRole("button", {name: /show secret values/i})).not.toBeInTheDocument();
        });

        it("never masks a compose diff, even if a line happens to match KEY=value shape", () => {
            const composeLikeSecret: UnifiedDiff = {
                added: 1,
                removed: 0,
                hunks: [
                    {
                        oldStart: 1,
                        oldLines: 0,
                        newStart: 1,
                        newLines: 1,
                        lines: [{kind: "added", text: "DB_PASSWORD=hunter2", oldLine: null, newLine: 1}],
                    },
                ],
            };
            render(
                <DiffConfirmDialog
                    open
                    stackName="My App"
                    subject={makeSubject("compose", composeLikeSecret)}
                    onConfirm={vi.fn()}
                    onCancel={vi.fn()}
                />,
            );
            expect(screen.getByText("DB_PASSWORD=hunter2")).toBeVisible();
            expect(screen.queryByRole("button", {name: /show secret values/i})).not.toBeInTheDocument();
        });

        it("resets revealSecrets to false when the dialog closes and reopens", async () => {
            const {rerender} = render(
                <DiffConfirmDialog
                    open
                    stackName="My App"
                    subject={makeSubject("env", secretDiff)}
                    onConfirm={vi.fn()}
                    onCancel={vi.fn()}
                />,
            );
            await userEvent.click(screen.getByRole("button", {name: "Show secret values"}));
            expect(screen.getByText("DB_PASSWORD=hunter2")).toBeVisible();

            rerender(
                <DiffConfirmDialog
                    open={false}
                    stackName="My App"
                    subject={makeSubject("env", secretDiff)}
                    onConfirm={vi.fn()}
                    onCancel={vi.fn()}
                />,
            );
            rerender(
                <DiffConfirmDialog
                    open
                    stackName="My App"
                    subject={makeSubject("env", secretDiff)}
                    onConfirm={vi.fn()}
                    onCancel={vi.fn()}
                />,
            );

            expect(screen.getByText("DB_PASSWORD=••••••••")).toBeVisible();
        });
    });
});
