import type {ReactElement} from "react";
import {describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import {AccountStep} from "../../../../src/routes/setup/components/account-step";
import {BackupStep} from "../../../../src/routes/setup/components/backup-step";
import {NotificationsStep} from "../../../../src/routes/setup/components/notifications-step";
import {ProxyStep} from "../../../../src/routes/setup/components/proxy-step";
import {SettingsStep} from "../../../../src/routes/setup/components/settings-step";

// jsdom has no ResizeObserver; Radix's Select / Popover measure on mount.
if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
}

interface StepCase {
    readonly name: string;
    readonly submitName: string;
    readonly hasBack: boolean;
    readonly element: ReactElement;
}

const asyncNoop = vi.fn().mockResolvedValue(undefined);

const STEPS: readonly StepCase[] = [
    {
        name: "AccountStep",
        submitName: "Next",
        hasBack: false,
        element: <AccountStep onNext={asyncNoop} loading={false}/>,
    },
    {
        name: "SettingsStep",
        submitName: "Next",
        hasBack: true,
        element: <SettingsStep onNext={asyncNoop} onBack={vi.fn()} loading={false}/>,
    },
    {
        name: "BackupStep",
        submitName: "Next",
        hasBack: true,
        element: <BackupStep onNext={asyncNoop} onBack={vi.fn()} onSkip={vi.fn()} loading={false}/>,
    },
    {
        name: "NotificationsStep",
        submitName: "Next",
        hasBack: true,
        element: <NotificationsStep onNext={asyncNoop} onBack={vi.fn()} onSkip={vi.fn()} loading={false}/>,
    },
    {
        name: "ProxyStep",
        submitName: "Deploy Proxy Stack",
        hasBack: true,
        element: (
            <ProxyStep onSubmit={asyncNoop} onBack={vi.fn()} onSkip={vi.fn()} loading={false} deployError={null}/>
        ),
    },
];

describe("setup step layout (UI-05)", () => {
    it.each(STEPS)("$name keeps fields and buttons in one FormStack with FormActions last", (step) => {
        const {container} = render(step.element);

        const form = container.querySelector("form");
        expect(form).toBeInTheDocument();
        const stacks = form?.querySelectorAll('[data-slot="form-stack"]') ?? [];
        expect(stacks).toHaveLength(1);

        const stack = stacks[0];
        const actions = screen.getByRole("button", {name: step.submitName}).closest('[data-slot="form-actions"]');
        expect(actions).toBeInTheDocument();
        expect(stack.lastElementChild).toBe(actions);
        expect(container.querySelector('[data-slot="card-footer"]')).not.toBeInTheDocument();
    });

    it.each(STEPS.filter((step) => step.hasBack))("$name puts Back in the same justify-between FormActions", (step) => {
        render(step.element);

        const actions = screen.getByRole("button", {name: "Back"}).closest('[data-slot="form-actions"]');
        expect(actions).toBe(screen.getByRole("button", {name: step.submitName}).closest('[data-slot="form-actions"]'));
        expect(actions?.className.split(/\s+/)).toContain("justify-between");
    });
});
