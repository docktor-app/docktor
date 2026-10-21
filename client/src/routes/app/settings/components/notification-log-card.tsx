import {useEffect, useState} from "react";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {DataTable, type TableColumn} from "@/components/common/data/table";
import {ToneBadge} from "@/components/common/tone-badge";
import {getNotifications, type NotificationEntry} from "@/lib/notifications-api";
import {useContainerEvents} from "@/hooks/use-container-events";
import {NotificationTypeBadge} from "@/components/domain/notification/notification-type-badge";

const NOTIFICATION_COLUMNS: readonly TableColumn<NotificationEntry>[] = [
    {name: "Type", isKey: true, render: (n) => <NotificationTypeBadge type={n.type} />},
    {name: "Stack", render: (n) => n.stack?.displayName ?? "—"},
    {name: "Message", className: "truncate", tableClassName: "max-w-xs", render: (n) => n.message},
    {
        name: "Email",
        render: (n) => (
            <ToneBadge tone={n.emailSent ? "green" : "neutral"}>{n.emailSent ? "Sent" : "UI only"}</ToneBadge>
        ),
    },
    {
        name: "Time",
        className: "text-sm text-muted-foreground",
        render: (n) => new Date(n.createdAt).toLocaleString(),
    },
];

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
                <DataTable
                    data={notifications}
                    columns={NOTIFICATION_COLUMNS}
                    getRowKey={(n) => n.id}
                    pagination={false}
                    loading={logLoading}
                    emptyMessage="No notifications yet"
                    emptyDescription="Alerts will appear here when notification triggers fire. Enable triggers above to start monitoring."
                />
            </CardContent>
        </Card>
    );
}
