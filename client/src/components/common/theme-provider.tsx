import {ThemeProvider as NextThemesProvider} from "next-themes";

/**
 * localStorage key next-themes uses to persist the user's theme choice.
 * `client/index.html`'s pre-paint script reads the exact same key so the
 * first painted frame already matches whatever this provider will settle on.
 */
export const THEME_STORAGE_KEY = "theme";

export interface ThemeProviderProps {
    children: React.ReactNode;
}

/**
 * Thin wrapper around next-themes' ThemeProvider (D-15). Generic — no domain
 * imports — so it can wrap the whole app above the router.
 */
export function ThemeProvider({children}: Readonly<ThemeProviderProps>): React.JSX.Element {
    return (
        <NextThemesProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            storageKey={THEME_STORAGE_KEY}
            disableTransitionOnChange
        >
            {children}
        </NextThemesProvider>
    );
}
