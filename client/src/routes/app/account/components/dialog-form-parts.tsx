import type {Control} from "react-hook-form";
import type {PasswordConfirmInput} from "@docktor/shared";

import {FormControl, FormField, FormItem, FormLabel, FormMessage} from "@/components/ui/form";
import {Input} from "@/components/ui/input";

/** Footer buttons stack full-width below sm so the tap area holds on phones (UI-SPEC). */
export const FOOTER_BUTTON_CLASS = "w-full sm:w-auto";

/** Inline `role="alert"` banner for a form-level failure; renders nothing without a message. */
export function ErrorBanner({message}: Readonly<{ message: string }>): React.JSX.Element | null {
    if (!message) {
        return null;
    }
    return (
        <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {message}
        </div>
    );
}

/** The password re-entry field shared by every Account dialog that needs D-07 confirmation. */
export function PasswordField({control}: Readonly<{ control: Control<PasswordConfirmInput> }>): React.JSX.Element {
    return (
        <FormField
            control={control}
            name="password"
            render={({field}) => (
                <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                        <Input type="password" autoComplete="current-password" autoFocus {...field}/>
                    </FormControl>
                    <FormMessage/>
                </FormItem>
            )}
        />
    );
}
