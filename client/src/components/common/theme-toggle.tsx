import {MoonIcon, SunIcon} from "lucide-react"
import {useTheme} from "next-themes"

import {Button} from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuCheckboxItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/**
 * Always-visible sun/moon dark-mode toggle (D-16). The visible icon is
 * driven purely by the `dark` class via CSS (`dark:` variants) rather than
 * React state, so it can never render the wrong icon before next-themes
 * resolves (UI-SPEC loading row).
 */
const THEME_OPTIONS = [
    {value: "light", label: "Light"},
    {value: "dark", label: "Dark"},
    {value: "system", label: "System"},
] as const

export function ThemeToggle(): React.JSX.Element {
    const {theme, setTheme} = useTheme()

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Toggle theme"
                    className="relative min-h-11 min-w-11 hover:text-primary md:min-h-9 md:min-w-9"
                >
                    <SunIcon className="scale-100 rotate-0 transition-transform dark:scale-0 dark:-rotate-90" />
                    <MoonIcon className="absolute scale-0 rotate-90 transition-transform dark:scale-100 dark:rotate-0" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                {THEME_OPTIONS.map(({value, label}) => (
                    <DropdownMenuCheckboxItem
                        key={value}
                        checked={theme === value}
                        onCheckedChange={() => setTheme(value)}
                    >
                        {label}
                    </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
