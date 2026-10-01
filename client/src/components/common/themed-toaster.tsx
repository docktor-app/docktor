import {useTheme} from "next-themes";
import {Toaster} from "@/components/ui/sonner";

/**
 * Narrows next-themes' `theme` value (which can be "light" | "dark" | "system"
 * | undefined before the provider has resolved) down to the three values
 * sonner's `Toaster` accepts. Any unrecognized value falls back to "system"
 * rather than being cast.
 */
export function toSonnerTheme(theme: string | undefined): "light" | "dark" | "system" {
    switch (theme) {
        case "dark":
            return "dark";
        case "light":
            return "light";
        default:
            return "system";
    }
}

/** Renders the shared sonner Toaster wired to the active next-themes theme. */
export function ThemedToaster(): React.JSX.Element {
    const {theme} = useTheme();
    return <Toaster theme={toSonnerTheme(theme)} />;
}
