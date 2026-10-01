import {useEffect, useRef} from "react";
import Ansi from "ansi-to-react";

import {getServiceColor} from "@/lib/service-color";
import {cn} from "@/lib/utils";

/**
 * A single normalized log line. `service` and `timestamp` are optional so
 * this same shape covers both stack container logs (LogLineEvent, which
 * always has a service) and backup/restic output (a plain string with
 * neither) — see 11-RESEARCH.md Pattern 2.
 */
export interface LogTerminalLine {
    line: string;
    service?: string;
    timestamp?: string;
}

export interface LogTerminalProps {
    lines: LogTerminalLine[];
    autoScroll: boolean;
    lineWrap?: boolean;
    showTimestamps?: boolean;
    showServicePrefix?: boolean;
    emptyMessage?: string;
    testId?: string;
    className?: string;
}

/** Formats an ISO timestamp as a local HH:MM:SS string. */
export function formatLogTimestamp(iso: string): string {
    const ts = new Date(iso);
    const hh = ts.getHours().toString().padStart(2, "0");
    const mm = ts.getMinutes().toString().padStart(2, "0");
    const ss = ts.getSeconds().toString().padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
}

/**
 * Presentational terminal shared by the stack log viewer and the backup
 * detail page (11-RESEARCH.md Pattern 2). Owns only rendering and
 * auto-scroll; each caller owns its own data-fetching hook.
 */
export function LogTerminal({
    lines,
    autoScroll,
    lineWrap = false,
    showTimestamps = false,
    showServicePrefix = true,
    emptyMessage = "No log output yet...",
    testId = "log-terminal",
    className,
}: Readonly<LogTerminalProps>) {
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (autoScroll && scrollRef.current) {
            const el = scrollRef.current;
            if (typeof el.scrollTo === "function") {
                el.scrollTo(0, el.scrollHeight);
            } else {
                el.scrollTop = el.scrollHeight;
            }
        }
    }, [lines, autoScroll]);

    return (
        <div
            data-testid={testId}
            ref={scrollRef}
            aria-live={autoScroll ? "polite" : "off"}
            className={cn(
                "bg-black rounded font-mono text-sm text-white h-96 overflow-auto p-2 w-full",
                className,
            )}
        >
            {lines.length === 0 ? (
                <span className="text-gray-500">{emptyMessage}</span>
            ) : (
                lines.map((line, i) => (
                    <div
                        key={i}
                        className={lineWrap ? "whitespace-pre-wrap break-all" : "whitespace-pre"}
                    >
                        {showTimestamps && line.timestamp && (
                            <span className="text-gray-400">{formatLogTimestamp(line.timestamp)} </span>
                        )}
                        {showServicePrefix && line.service && (
                            <span className={getServiceColor(line.service)}>[{line.service}] </span>
                        )}
                        <Ansi>{line.line}</Ansi>
                    </div>
                ))
            )}
        </div>
    );
}
