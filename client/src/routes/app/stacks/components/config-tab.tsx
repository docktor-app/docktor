import {useState} from "react";
import {Save} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Separator} from "@/components/ui/separator";
import {Section, SectionActions, SectionHeader, SectionTitle} from "@/components/common/layout/section";
import {ComposeEditor} from "@/components/domain/stack/compose-editor";
import {EnvEditor} from "@/components/domain/stack/env-editor";
import {DiffConfirmDialog, type ReviewSubject} from "@/components/domain/stack/diff-confirm-dialog";
import type {StackConfigFiles} from "@/hooks/use-stack-config-files";

export interface ConfigTabProps {
    readonly files: StackConfigFiles;
    readonly stackName: string;
}

// D-02/D-03: the merged Compose+Environment tab — a single stacked column of
// two flat Sections (UI-SPEC Discretion Decision 4), no Card, no nested Tabs.
// 11-09 gave Compose File a CodeMirror editor; 11-12 gives Environment
// Variables a table/raw EnvEditor (D-20/D-21/D-22) — both behind this same
// `files` prop. Issue #18/D-01/D-03: Save now routes through a diff review
// gate (DiffConfirmDialog) before either editor's PUT actually applies.
export function ConfigTab({files, stackName}: Readonly<ConfigTabProps>) {
    // EnvEditor validates its own table rows (invalid key -> can't save);
    // true by default so an untouched/raw-mode editor never blocks Save.
    const [envValid, setEnvValid] = useState(true);

    const reviewSubject: ReviewSubject | null = files.review
        ? {
              kind: "edit",
              file: files.review.file,
              diff: files.review.file === "compose" ? files.review.preview.compose! : files.review.preview.env!,
          }
        : null;

    return (
        <div className="space-y-6">
            <Section>
                <SectionHeader>
                    <SectionTitle>Compose File</SectionTitle>
                    <SectionActions>
                        <Button
                            size="sm"
                            disabled={!files.composeDirty || files.reviewPending}
                            aria-label="Save compose file"
                            onClick={files.saveCompose}
                        >
                            <Save className="h-4 w-4 mr-1" />
                            Save
                        </Button>
                    </SectionActions>
                </SectionHeader>
                <ComposeEditor value={files.composeContent} onChange={files.setComposeContent} />
            </Section>

            <Separator />

            <Section>
                <SectionHeader>
                    <SectionTitle>Environment Variables</SectionTitle>
                    <SectionActions>
                        <Button
                            size="sm"
                            disabled={!files.envDirty || !envValid || files.reviewPending}
                            aria-label="Save environment variables"
                            onClick={files.saveEnv}
                        >
                            <Save className="h-4 w-4 mr-1" />
                            Save
                        </Button>
                    </SectionActions>
                </SectionHeader>
                <EnvEditor
                    value={files.envContent}
                    onChange={files.setEnvContent}
                    onValidityChange={setEnvValid}
                />
            </Section>

            <DiffConfirmDialog
                open={files.review !== null}
                stackName={stackName}
                subject={reviewSubject}
                onConfirm={files.confirmReview}
                onCancel={files.cancelReview}
            />
        </div>
    );
}
