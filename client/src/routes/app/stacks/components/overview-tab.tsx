import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {ScrollArea} from "@/components/ui/scroll-area";
import type {StackDetail} from "@/lib/stacks-api";
import {ServicesTab} from "./services-tab";
import {StatusLogCard} from "./status-log-card";
import {EventLogCard} from "./event-log-card";

export interface OverviewTabProps {
    readonly stack: StackDetail;
    readonly onViewLogs: (serviceName: string) => void;
    readonly onUpgraded: () => void;
}

// The stack detail page's Overview tab content, moved out of [id].tsx
// verbatim (behaviour-preserving move only). Plan 11-06 replaces the
// Recent Deployments table + StatusLogCard + EventLogCard trio with the
// unified timeline (D-07); this component is the seam that change lands on.
export function OverviewTab({stack, onViewLogs, onUpgraded}: Readonly<OverviewTabProps>) {
    return (
        <div className="space-y-4">
            <ServicesTab
                services={stack.services}
                stackId={stack.id}
                stackStatus={stack.status}
                onViewLogs={onViewLogs}
                onUpgraded={onUpgraded}
            />

            <Card>
                <CardHeader>
                    <CardTitle>Recent Deployments</CardTitle>
                </CardHeader>
                <CardContent>
                    <ScrollArea className={"h-64"}>
                        {stack.deployments.length === 0 ? (
                            <p className="text-muted-foreground">
                                No deployments yet
                            </p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Error</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {stack.deployments.map((dep) => (
                                        <TableRow key={dep.id}>
                                            <TableCell>
                                                {new Date(dep.deployedAt).toLocaleString()}
                                            </TableCell>
                                            <TableCell>
                                                {dep.success ? (
                                                    <span className="text-green-600">
                                                        Success
                                                    </span>
                                                ) : (
                                                    <span className="text-red-600">
                                                        Failed
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                                                {dep.errorMessage ?? "-"}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </ScrollArea>
                </CardContent>
            </Card>

            <StatusLogCard statusLogs={stack.statusLogs}/>

            <EventLogCard stackId={stack.id}/>
        </div>
    );
}
