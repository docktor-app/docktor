import type {JSX} from "react";
import {BookOpen, Github} from "lucide-react";
import {Button} from "@/components/ui/button";
import type {ProjectLinks} from "@/lib/project-links";

export interface SidebarVersionBlockProps {
    readonly version: string;
    readonly links: ProjectLinks;
}

export function SidebarVersionBlock({version, links}: Readonly<SidebarVersionBlockProps>): JSX.Element {
    return (
        <div
            role="group"
            aria-label="About Docktor"
            className="flex h-8 items-center justify-between gap-1 px-2 max-md:h-11 group-data-[collapsible=icon]:hidden"
        >
            <span className="min-w-0 truncate text-xs tabular-nums text-sidebar-foreground/70">
                v{version}
            </span>
            <div className="flex shrink-0 items-center gap-1">
                <Button
                    asChild
                    variant="ghost"
                    size="icon-sm"
                    className="max-md:size-11 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                >
                    <a
                        href={links.github}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Docktor on GitHub (opens in a new tab)"
                        title="GitHub"
                    >
                        <Github className="size-4" aria-hidden="true"/>
                    </a>
                </Button>
                <Button
                    asChild
                    variant="ghost"
                    size="icon-sm"
                    className="max-md:size-11 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                >
                    <a
                        href={links.docs}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Docktor documentation (opens in a new tab)"
                        title="Documentation"
                    >
                        <BookOpen className="size-4" aria-hidden="true"/>
                    </a>
                </Button>
            </div>
        </div>
    );
}
