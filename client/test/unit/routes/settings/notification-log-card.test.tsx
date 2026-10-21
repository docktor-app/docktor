import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import {MemoryRouter} from "react-router";
import {NotificationLogCard} from "@/routes/app/settings/components/notification-log-card";
import {getNotifications, type NotificationEntry} from "@/lib/notifications-api";

vi.mock("@/lib/notifications-api", () => ({
    getNotifications: vi.fn(),
}));

vi.mock("@/hooks/use-container-events", () => ({
    useContainerEvents: vi.fn(),
}));

const mockGetNotifications = vi.mocked(getNotifications);

function makeNotification(overrides: Partial<NotificationEntry> = {}): NotificationEntry {
    return {
        id: "n-1",
        type: "stack_error",
        stackId: "stack-1",
        stack: {id: "stack-1", displayName: "Web App"},
        message: "Stack failed to start",
        emailSent: true,
        createdAt: "2026-01-01T12:00:00.000Z",
        ...overrides,
    };
}

function renderCard(): ReturnType<typeof render> {
    return render(
        <MemoryRouter>
            <NotificationLogCard />
        </MemoryRouter>,
    );
}

beforeEach(() => {
    mockGetNotifications.mockReset();
});

describe("NotificationLogCard", () => {
    it("renders the entries inside the shared table frame", async () => {
        mockGetNotifications.mockResolvedValue([
            makeNotification({id: "n-1", message: "First alert"}),
            makeNotification({id: "n-2", message: "Second alert", emailSent: false}),
        ]);

        const {container} = renderCard();

        const messageCell = (await screen.findByText("First alert")).closest("td");
        expect(container.querySelector('[data-slot="table-frame"]')).toContainElement(messageCell);
        expect(screen.getByText("Second alert")).toBeInTheDocument();
    });

    it("renders the email column as ToneBadge pills", async () => {
        mockGetNotifications.mockResolvedValue([
            makeNotification({id: "n-1", emailSent: true}),
            makeNotification({id: "n-2", emailSent: false}),
        ]);

        renderCard();

        expect(await screen.findByText("Sent")).toHaveAttribute("data-tone", "green");
        expect(screen.getByText("UI only")).toHaveAttribute("data-tone", "neutral");
    });

    it("shows a dash for an entry without a stack", async () => {
        mockGetNotifications.mockResolvedValue([
            makeNotification({id: "n-1", stackId: null, stack: null, type: "disk_warning"}),
        ]);

        renderCard();

        expect(await screen.findByText("—")).toBeInTheDocument();
    });

    it("renders the empty copy and no table when there are no notifications", async () => {
        mockGetNotifications.mockResolvedValue([]);

        renderCard();

        expect(await screen.findByText("No notifications yet")).toBeInTheDocument();
        expect(
            screen.getByText(
                "Alerts will appear here when notification triggers fire. Enable triggers above to start monitoring.",
            ),
        ).toBeInTheDocument();
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });
});
