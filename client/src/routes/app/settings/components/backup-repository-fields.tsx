import type {Control, FieldPath} from "react-hook-form";
import type {BackupSettingsInput} from "@docktor/shared";

import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage} from "@/components/ui/form";

interface RepositoryFieldProps {
    control: Control<BackupSettingsInput>
    name: FieldPath<BackupSettingsInput>
    label: string
    placeholder?: string
    description?: string
    /** Shown next to the label, e.g. "(key saved)" when a secret is already stored. */
    savedHint?: string
    type?: "text" | "password"
}

function RepositoryField({control, name, label, placeholder, description, savedHint, type = "text"}: Readonly<RepositoryFieldProps>) {
    return (
        <FormField
            control={control}
            name={name}
            render={({field}) => (
                <FormItem>
                    <FormLabel>
                        {label}
                        {savedHint && <span className="ml-2 text-xs text-muted-foreground">{savedHint}</span>}
                    </FormLabel>
                    <FormControl>
                        <Input {...field} value={field.value ?? ""} type={type} placeholder={placeholder} autoComplete={type === "password" ? "new-password" : "off"} />
                    </FormControl>
                    {description && <FormDescription>{description}</FormDescription>}
                    <FormMessage />
                </FormItem>
            )}
        />
    );
}

interface SavedSecretProps {
    control: Control<BackupSettingsInput>
    hasSecret: boolean
}

export function SftpFields({control, hasSecret}: Readonly<SavedSecretProps>) {
    return (
        <>
            <RepositoryField control={control} name="sftpHost" label="Host" placeholder="backup.example.com" />
            <RepositoryField control={control} name="sftpUser" label="Username" placeholder="backup" />
            <RepositoryField
                control={control}
                name="repoPath"
                label="Remote path"
                placeholder="/backups"
                description="Base directory on the server. Each stack gets its own repository in a subdirectory."
            />
            <FormField
                control={control}
                name="sftpKey"
                render={({field}) => (
                    <FormItem>
                        <FormLabel>
                            Private key
                            {hasSecret && <span className="ml-2 text-xs text-muted-foreground">(key saved)</span>}
                        </FormLabel>
                        <FormControl>
                            <Textarea
                                {...field}
                                value={field.value ?? ""}
                                rows={4}
                                className="font-mono text-xs"
                                placeholder={hasSecret ? "Leave blank to keep the saved key" : "-----BEGIN OPENSSH PRIVATE KEY-----"}
                            />
                        </FormControl>
                        <FormDescription>
                            The server's host key is pinned on the first connection.
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                )}
            />
        </>
    );
}

export function S3Fields({control, hasSecret}: Readonly<SavedSecretProps>) {
    return (
        <>
            <RepositoryField
                control={control}
                name="s3Endpoint"
                label="Endpoint"
                placeholder="s3.amazonaws.com"
                description="Leave blank for AWS S3. For MinIO and other S3-compatible services, enter host:port."
            />
            <RepositoryField control={control} name="s3Bucket" label="Bucket name" placeholder="docktor-backups" />
            <RepositoryField control={control} name="s3AccessKey" label="Access key" />
            <RepositoryField
                control={control}
                name="s3SecretKey"
                label="Secret key"
                type="password"
                savedHint={hasSecret ? "(secret saved)" : undefined}
                placeholder={hasSecret ? "Leave blank to keep the saved secret" : undefined}
            />
        </>
    );
}
