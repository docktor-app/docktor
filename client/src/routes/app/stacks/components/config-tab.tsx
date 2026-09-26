import {Save} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {Separator} from "@/components/ui/separator";
import {Section, SectionActions, SectionHeader, SectionTitle} from "@/components/common/layout/section";
import type {StackConfigFiles} from "@/hooks/use-stack-config-files";

export interface ConfigTabProps {
    readonly files: StackConfigFiles;
}

// D-02/D-03: the merged Compose+Environment tab — a single stacked column of
// two flat Sections (UI-SPEC Discretion Decision 4), no Card, no nested Tabs.
// Plans 11-09 (CodeMirror) and 11-12 (table/raw env editor) swap the two
// text areas below for richer editors behind this same `files` prop.
export function ConfigTab({files}: Readonly<ConfigTabProps>) {
    return (
        <div className="space-y-6">
            <Section>
                <SectionHeader>
                    <SectionTitle>Compose File</SectionTitle>
                    <SectionActions>
                        <Button
                            size="sm"
                            disabled={!files.composeDirty}
                            aria-label="Save compose file"
                            onClick={files.saveCompose}
                        >
                            <Save className="h-4 w-4 mr-1" />
                            Save
                        </Button>
                    </SectionActions>
                </SectionHeader>
                <Textarea
                    aria-label="Docker Compose File"
                    value={files.composeContent}
                    onChange={(e) => files.setComposeContent(e.target.value)}
                    className="font-mono text-sm min-h-[400px]"
                />
            </Section>

            <Separator />

            <Section>
                <SectionHeader>
                    <SectionTitle>Environment Variables</SectionTitle>
                    <SectionActions>
                        <Button
                            size="sm"
                            disabled={!files.envDirty}
                            aria-label="Save environment variables"
                            onClick={files.saveEnv}
                        >
                            <Save className="h-4 w-4 mr-1" />
                            Save
                        </Button>
                    </SectionActions>
                </SectionHeader>
                <Textarea
                    aria-label="Environment Variables"
                    value={files.envContent}
                    onChange={(e) => files.setEnvContent(e.target.value)}
                    className="font-mono text-sm min-h-[300px]"
                />
            </Section>
        </div>
    );
}
