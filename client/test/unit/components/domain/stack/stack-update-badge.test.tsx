import {describe, expect, it} from "vitest";
import {render, screen} from "@testing-library/react";
import {StackUpdateBadge, hasStackUpdate} from "@/components/domain/stack/stack-update-badge";

describe("hasStackUpdate", () => {
    it("returns false for an empty service list", () => {
        expect(hasStackUpdate([])).toBe(false);
    });

    it("returns true when at least one service has updateAvailable true", () => {
        expect(hasStackUpdate([{updateAvailable: false}, {updateAvailable: true}])).toBe(true);
    });

    it("returns false when updateAvailable is undefined everywhere", () => {
        expect(hasStackUpdate([{updateAvailable: undefined}, {updateAvailable: undefined}])).toBe(false);
    });
});

describe("StackUpdateBadge", () => {
    it('renders "update available" in the blue tone when a service has an update', () => {
        render(<StackUpdateBadge services={[{updateAvailable: true}]} />);
        const badge = screen.getByText("update available");
        expect(badge).toHaveAttribute("data-tone", "blue");
    });

    it("renders exactly one badge however many services are flagged", () => {
        render(
            <StackUpdateBadge
                services={[{updateAvailable: true}, {updateAvailable: true}, {updateAvailable: true}]}
            />,
        );
        expect(screen.getAllByText("update available")).toHaveLength(1);
    });

    it("renders nothing when no service has an update", () => {
        const {container} = render(<StackUpdateBadge services={[{updateAvailable: false}]} />);
        expect(container).toBeEmptyDOMElement();
    });
});
