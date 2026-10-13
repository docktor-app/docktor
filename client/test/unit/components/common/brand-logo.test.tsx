import {describe, expect, it} from "vitest";
import {render} from "@testing-library/react";
import {BrandLogo} from "@/components/common/brand-logo";

describe("BrandLogo", () => {
    it("renders a light-background and a dark-background image, both named Docktor", () => {
        const {container} = render(<BrandLogo/>);

        const images = container.querySelectorAll("img");
        expect(images).toHaveLength(2);
        images.forEach((image) => expect(image).toHaveAttribute("alt", "Docktor"));
        expect(images[0]).toHaveClass("dark:hidden");
        expect(images[1]).toHaveClass("hidden", "dark:block");
        expect(images[0].getAttribute("src")).not.toBe(images[1].getAttribute("src"));
    });

    it("uses different artwork for the mark than for the full logo", () => {
        const logo = render(<BrandLogo variant="logo"/>).container.querySelector("img")?.getAttribute("src");
        const mark = render(<BrandLogo variant="mark"/>).container.querySelector("img")?.getAttribute("src");

        expect(logo).toBeTruthy();
        expect(mark).toBeTruthy();
        expect(mark).not.toBe(logo);
    });

    it("passes the class name to both images", () => {
        const {container} = render(<BrandLogo className="h-7 w-auto"/>);

        container.querySelectorAll("img").forEach((image) => expect(image).toHaveClass("h-7", "w-auto"));
    });
});
