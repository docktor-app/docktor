import {describe, expect, it} from "vitest";
import {render, screen} from "@testing-library/react";
import {ServiceUpdateBadge, describeServiceUpdate} from "@/components/domain/stack/service-update-badge";

describe("describeServiceUpdate", () => {
    it("returns the concrete-tag copy when a latestTag is known", () => {
        expect(describeServiceUpdate(true, "1.2.3")).toBe("Update available → 1.2.3");
    });

    it('returns "Content updated" when updateAvailable is true but latestTag is null', () => {
        expect(describeServiceUpdate(true, null)).toBe("Content updated");
    });

    it("returns null when there is no update", () => {
        expect(describeServiceUpdate(false, "1.2.3")).toBeNull();
        expect(describeServiceUpdate(undefined, undefined)).toBeNull();
    });
});

describe("ServiceUpdateBadge", () => {
    it("renders the concrete-tag copy in the blue tone", () => {
        render(<ServiceUpdateBadge updateAvailable={true} latestTag="1.2.3" />);
        const badge = screen.getByText("Update available → 1.2.3");
        expect(badge).toHaveAttribute("data-tone", "blue");
    });

    it('renders "Content updated" when there is no latestTag', () => {
        render(<ServiceUpdateBadge updateAvailable={true} latestTag={null} />);
        expect(screen.getByText("Content updated")).toBeInTheDocument();
    });

    it("renders nothing when there is no update", () => {
        const {container} = render(<ServiceUpdateBadge updateAvailable={false} latestTag={null} />);
        expect(container).toBeEmptyDOMElement();
    });
});
