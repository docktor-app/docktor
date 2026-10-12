import type {JSX} from "react";

import logoDark from "@/assets/brand/docktor-logo.svg";
import logoLight from "@/assets/brand/docktor-logo-light.svg";
import markDark from "@/assets/brand/docktor-mark.svg";
import markLight from "@/assets/brand/docktor-mark-light.svg";
import {cn} from "@/lib/utils";

type BrandLogoVariant = "logo" | "mark";

interface BrandLogoProps {
    /** `logo` is the mark plus the wordmark; `mark` is the symbol alone. */
    variant?: BrandLogoVariant;
    className?: string;
}

// The "light" files are the ones drawn for dark backgrounds, so they are
// shown when the `dark` class is active (next-themes class strategy).
const SOURCES: Record<BrandLogoVariant, {onLight: string; onDark: string}> = {
    logo: {onLight: logoDark, onDark: logoLight},
    mark: {onLight: markDark, onDark: markLight},
};

export function BrandLogo({variant = "logo", className}: Readonly<BrandLogoProps>): JSX.Element {
    const {onLight, onDark} = SOURCES[variant];
    return (
        <>
            <img src={onLight} alt="Docktor" className={cn("dark:hidden", className)}/>
            <img src={onDark} alt="Docktor" className={cn("hidden dark:block", className)}/>
        </>
    );
}
