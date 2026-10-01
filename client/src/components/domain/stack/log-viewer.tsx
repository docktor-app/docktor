import {useEffect, useState} from "react";
import {useLogStream} from "@/hooks/use-log-stream";
import {Button} from "@/components/ui/button";
import {getServiceColor} from "@/lib/service-color";
import {LogTerminal} from "@/components/domain/stack/log-terminal";
import {LogConnectionStatus} from "@/components/domain/stack/log-connection-status";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {cn} from "@/lib/utils";

interface LogViewerProps {
    stackId: string
    serviceNames?: string[]
    initialService?: string
}

export function LogViewer({stackId, serviceNames = [], initialService}: Readonly<LogViewerProps>) {
    const [selectedService, setSelectedService] = useState<string>(initialService ?? "all")
    const [autoScroll, setAutoScroll] = useState(true)
    const [showTimestamps, setShowTimestamps] = useState(false)
    const [lineWrap, setLineWrap] = useState(false)

    const {lines, connected, clear} = useLogStream(stackId, selectedService, true)

    // Update selected service when initialService prop changes (e.g., from "Logs" button)
    useEffect(() => {
        if (initialService !== undefined) {
            setSelectedService(initialService)
        }
    }, [initialService])

    const showServicePrefix = selectedService === "all"

    return (
        <div className="space-y-2 w-full max-w-full overflow-hidden">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
                <Select
                    value={selectedService}
                    onValueChange={(value) => {
                        setSelectedService(value)
                        clear()
                    }}
                >
                    <SelectTrigger size="sm" aria-label="Select service" className="w-auto">
                        <SelectValue>
                            {selectedService === "all" ? "All services" : selectedService}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All services</SelectItem>
                        {serviceNames.map((name) => (
                            <SelectItem key={name} value={name}>
                                <span className={cn("inline-block size-2 rounded-full bg-current", getServiceColor(name))} />
                                {name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Button
                    size="sm"
                    variant={autoScroll ? "default" : "outline"}
                    aria-pressed={autoScroll}
                    onClick={() => setAutoScroll(v => !v)}
                    title="Toggle auto-scroll"
                >
                    Auto-scroll
                </Button>

                <Button
                    size="sm"
                    variant={showTimestamps ? "default" : "outline"}
                    aria-pressed={showTimestamps}
                    onClick={() => setShowTimestamps(v => !v)}
                    title="Toggle timestamps"
                >
                    Timestamps
                </Button>

                <Button
                    size="sm"
                    variant={lineWrap ? "default" : "outline"}
                    aria-pressed={lineWrap}
                    onClick={() => setLineWrap(v => !v)}
                    title="Toggle line wrap"
                >
                    Wrap
                </Button>

                <Button
                    size="sm"
                    variant="outline"
                    onClick={clear}
                    title="Clear log output"
                >
                    Clear
                </Button>

                <div className="ml-auto">
                    <LogConnectionStatus connected={connected} />
                </div>
            </div>

            {/* Terminal */}
            <LogTerminal
                testId="log-viewer-terminal"
                lines={lines}
                autoScroll={autoScroll}
                showTimestamps={showTimestamps}
                lineWrap={lineWrap}
                showServicePrefix={showServicePrefix}
            />
        </div>
    )
}
