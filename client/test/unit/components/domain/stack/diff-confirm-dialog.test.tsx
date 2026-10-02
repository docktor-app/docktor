import {describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {DiffConfirmDialog, type ReviewSubject} from "@/components/domain/stack/diff-confirm-dialog";
import type {ReviewFinding, UnifiedDiff} from "@/lib/stacks-api";

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

function makeFinding(overrides: Partial<ReviewFinding> = {}): ReviewFinding {
    return {
        ruleId: "privileged",
        severity: "danger",
        message: 'Service "web" runs with privileged: true, granting it full access to the host.',
        serviceName: "web",
        path: ["services", "web", "privileged"],
        line: 1,
        introduced: true,
        ...overrides,
    };
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

    describe("Issue #20/D-03: compose-check findings in the review dialog", () => {
        it("anchors a finding under its diff line via data-diff-annotation-for when the line is visible in the diff", () => {
            render(
                <DiffConfirmDialog
                    open
                    stackName="My App"
                    subject={makeSubject("compose")}
                    findings={[makeFinding({line: 1})]}
                    onConfirm={vi.fn()}
                    onCancel={vi.fn()}
                />,
            );

            const annotation = document.querySelector('[data-diff-annotation-for="1"]');
            expect(annotation).not.toBeNull();
            expect(annotation).toHaveTextContent("Privileged container");
            expect(annotation).toHaveTextContent('Service "web" runs with privileged: true');
        });

        it("lists a finding whose line isn't shown in any hunk, with its line number", () => {
            render(
                <DiffConfirmDialog
                    open
                    stackName="My App"
                    subject={makeSubject("compose")}
                    findings={[makeFinding({line: 42, ruleId: "namedVolume", severity: "warning", serviceName: null})]}
                    onConfirm={vi.fn()}
                    onCancel={vi.fn()}
                />,
            );

            expect(screen.getByText("Compose check warnings")).toBeVisible();
            expect(screen.getByText("Named volume")).toBeVisible();
            expect(screen.getByText("line 42")).toBeVisible();
            expect(document.querySelector('[data-diff-annotation-for="42"]')).toBeNull();
        });

        it("lists a finding with a null line (no anchor possible)", () => {
            render(
                <DiffConfirmDialog
                    open
                    stackName="My App"
                    subject={makeSubject("compose")}
                    findings={[makeFinding({line: null})]}
                    onConfirm={vi.fn()}
                    onCancel={vi.fn()}
                />,
            );

            expect(screen.getByText("Compose check warnings")).toBeVisible();
            expect(screen.queryByText(/^line /)).not.toBeInTheDocument();
        });

        it("lists every finding (never anchors) for an env subject, even when the line number matches a compose diff's shape", () => {
            render(
                <DiffConfirmDialog
                    open
                    stackName="My App"
                    subject={makeSubject("env")}
                    findings={[makeFinding({line: 1})]}
                    onConfirm={vi.fn()}
                    onCancel={vi.fn()}
                />,
            );

            expect(screen.getByText("Compose check warnings")).toBeVisible();
            expect(document.querySelector('[data-diff-annotation-for="1"]')).toBeNull();
        });

        it("shows a neutral 'new' badge next to an introduced finding, and omits it for a pre-existing one", () => {
            render(
                <DiffConfirmDialog
                    open
                    stackName="My App"
                    subject={makeSubject("compose")}
                    findings={[
                        makeFinding({line: 42, ruleId: "namedVolume", severity: "warning", introduced: true}),
                        makeFinding({
                            line: 43,
                            ruleId: "inlineEnv",
                            severity: "warning",
                            introduced: false,
                            message: "pre-existing finding",
                        }),
                    ]}
                    onConfirm={vi.fn()}
                    onCancel={vi.fn()}
                />,
            );

            expect(screen.getByText("new")).toBeVisible();
        });

        it("renders nothing finding-related when findings is omitted (backward-compatible optional prop)", () => {
            render(
                <DiffConfirmDialog
                    open
                    stackName="My App"
                    subject={makeSubject("compose")}
                    onConfirm={vi.fn()}
                    onCancel={vi.fn()}
                />,
            );

            expect(screen.queryByText("Compose check warnings")).not.toBeInTheDocument();
        });

        it("shows the YAML-error alert when composeParseError is set, without blocking Confirm & Apply", async () => {
            const onConfirm = vi.fn();
            render(
                <DiffConfirmDialog
                    open
                    stackName="My App"
                    subject={makeSubject("compose")}
                    composeParseError="bad indentation"
                    onConfirm={onConfirm}
                    onCancel={vi.fn()}
                />,
            );

            expect(screen.getByText(/This compose file has a YAML error: bad indentation/)).toBeVisible();

            await userEvent.click(screen.getByRole("button", {name: "Confirm & Apply"}));
            expect(onConfirm).toHaveBeenCalledTimes(1);
        });

        it("shows no YAML-error alert when composeParseError is null", () => {
            render(
                <DiffConfirmDialog
                    open
                    stackName="My App"
                    subject={makeSubject("compose")}
                    composeParseError={null}
                    onConfirm={vi.fn()}
                    onCancel={vi.fn()}
                />,
            );

            expect(screen.queryByText(/YAML error/)).not.toBeInTheDocument();
        });
    });

    describe("Issue #20/D-02: create-flow review subject", () => {
        const createSubject: ReviewSubject = {kind: "create"};

        it('shows the title "Review {stackName} before creating"', () => {
            render(
                <DiffConfirmDialog
                    open
                    stackName="My App"
                    subject={createSubject}
                    onConfirm={vi.fn()}
                    onCancel={vi.fn()}
                />,
            );
            expect(screen.getByText("Review My App before creating")).toBeVisible();
        });

        it("shows the create-flow description and lists findings, with no diff region", () => {
            render(
                <DiffConfirmDialog
                    open
                    stackName="My App"
                    subject={createSubject}
                    findings={[makeFinding()]}
                    onConfirm={vi.fn()}
                    onCancel={vi.fn()}
                />,
            );

            expect(
                screen.getByText(
                    "Docktor found compose-check warnings in this stack. Nothing is blocked — confirm to create it.",
                ),
            ).toBeVisible();
            expect(screen.getByText("Compose check warnings")).toBeVisible();
            expect(screen.getByText("Privileged container")).toBeVisible();
            expect(screen.queryByRole("region", {name: "Review diff"})).not.toBeInTheDocument();
        });

        it("still renders Keep Editing / Confirm & Apply for the create subject", async () => {
            const onConfirm = vi.fn();
            const onCancel = vi.fn();
            render(
                <DiffConfirmDialog
                    open
                    stackName="My App"
                    subject={createSubject}
                    onConfirm={onConfirm}
                    onCancel={onCancel}
                />,
            );

            await userEvent.click(screen.getByRole("button", {name: "Confirm & Apply"}));
            expect(onConfirm).toHaveBeenCalledTimes(1);

            await userEvent.click(screen.getByRole("button", {name: "Keep Editing"}));
            expect(onCancel).toHaveBeenCalledTimes(1);
        });
    });
});
