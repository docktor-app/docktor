import {useEffect, useState} from "react";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Skeleton} from "@/components/ui/skeleton";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {Badge} from "@/components/ui/badge";
import {getNotifications, type NotificationEntry} from "@/lib/notifications-api";
import {useContainerEvents} from "@/hooks/use-container-events";
import {NotificationTypeBadge} from "@/components/domain/notification/notification-type-badge";

export function NotificationLogCard() {
    const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
    const [logLoading, setLogLoading] = useState(true);

    const loadNotifications = () => {
        getNotifications()
            .then((data) => {
                setNotifications(data);
                setLogLoading(false);
            })
            .catch(() => {
                setLogLoading(false);
            });
    };

    useEffect(() => {
        loadNotifications();
    }, []);

    // Subscribe to SSE events and refresh when new notifications are created
    useContainerEvents((event) => {
        if (event.type === "notification_created") {
            loadNotifications();
        }
    });

    return (
        <Card>
            <CardHeader>
                <CardTitle>Notification Log</CardTitle>
            </CardHeader>
            <CardContent>
                {logLoading ? (
                    <>
                        <Skeleton className="h-10 w-full mb-2" />
                        <Skeleton className="h-10 w-full mb-2" />
                        <Skeleton className="h-10 w-full" />
                    </>
                ) : notifications.length === 0 ? (
                    <div className="text-center py-8">
                        <p className="text-sm font-semibold">No notifications yet</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            Alerts will appear here when notification triggers fire. Enable triggers above to start monitoring.
                        </p>
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Type</TableHead>
                                <TableHead>Stack</TableHead>
                                <TableHead>Message</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Time</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {notifications.map((n) => (
                                <TableRow key={n.id}>
                                    <TableCell>
                                        <NotificationTypeBadge type={n.type} />
                                    </TableCell>
                                    <TableCell>{n.stack?.displayName ?? "—"}</TableCell>
                                    <TableCell className="max-w-xs truncate">{n.message}</TableCell>
                                    <TableCell>
                                        <Badge variant={n.emailSent ? "secondary" : "outline"}>
                                            {n.emailSent ? "Sent" : "UI only"}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {new Date(n.createdAt).toLocaleString()}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}
