import {describe, expect, it} from "vitest";
import {render} from "@testing-library/react";
import {FormActions, FormStack} from "@/components/common/form-layout";

function tokens(element: Element | null): string[] {
    return (element?.className ?? "").split(/\s+/).filter(Boolean);
}

describe("FormStack", () => {
    it("owns the 16px field rhythm and the 8px label-to-control rule", () => {
        const {container} = render(
            <FormStack>
                <span>field</span>
            </FormStack>,
        );

        const stack = container.querySelector('[data-slot="form-stack"]');
        expect(stack).toBeInTheDocument();
        expect(stack).toHaveTextContent("field");
        expect(tokens(stack)).toEqual(
            expect.arrayContaining(["flex", "flex-col", "gap-4", "[&_[data-slot=form-item]]:gap-2"]),
        );
    });

    it("appends a passed className", () => {
        const {container} = render(
            <FormStack className="max-w-md">
                <span>field</span>
            </FormStack>,
        );

        expect(tokens(container.querySelector('[data-slot="form-stack"]'))).toContain("max-w-md");
    });
});

describe("FormActions", () => {
    it("defaults to an inline row with the 24px lead-in and no justification", () => {
        const {container} = render(
            <FormActions>
                <button type="button">Go</button>
            </FormActions>,
        );

        const actions = container.querySelector('[data-slot="form-actions"]');
        expect(actions).toBeInTheDocument();
        expect(tokens(actions)).toEqual(expect.arrayContaining(["flex", "items-center", "gap-2", "pt-2"]));
        expect(tokens(actions)).not.toContain("justify-end");
        expect(tokens(actions)).not.toContain("justify-between");
    });

    it("justifies to the end for align end", () => {
        const {container} = render(
            <FormActions align="end">
                <button type="button">Go</button>
            </FormActions>,
        );

        expect(tokens(container.querySelector('[data-slot="form-actions"]'))).toContain("justify-end");
    });

    it("spreads children for align between", () => {
        const {container} = render(
            <FormActions align="between">
                <button type="button">Back</button>
                <button type="button">Next</button>
            </FormActions>,
        );

        expect(tokens(container.querySelector('[data-slot="form-actions"]'))).toContain("justify-between");
    });

    it("mirrors the dialog footer layout for the dialog variant", () => {
        const {container} = render(
            <FormActions variant="dialog">
                <button type="button">Cancel</button>
            </FormActions>,
        );

        const actions = container.querySelector('[data-slot="form-actions"]');
        expect(tokens(actions)).toEqual(
            expect.arrayContaining(["flex-col-reverse", "pt-2", "sm:flex-row", "sm:justify-end"]),
        );
        expect(tokens(actions)).not.toContain("items-center");
    });

    it("appends a passed className", () => {
        const {container} = render(
            <FormActions className="w-full">
                <button type="button">Go</button>
            </FormActions>,
        );

        expect(tokens(container.querySelector('[data-slot="form-actions"]'))).toContain("w-full");
    });
});
