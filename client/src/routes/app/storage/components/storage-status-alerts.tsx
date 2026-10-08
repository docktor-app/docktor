import {AlertTriangle} from "lucide-react";
import {Alert, AlertDescription, AlertTitle} from "@/components/ui/alert";
import {Button} from "@/components/ui/button";
import {formatMeasurementAge, isStorageMeasurementStale} from "@/lib/storage-view";

export interface StorageStatusAlertsProps {
    readonly measuredAt: string | null;
    readonly error: string | null;
    readonly onRetry: () => void;
    // Injectable for tests; defaults to the current time.
    readonly now?: Date;
}

// A failed load wins over staleness: with no data there is nothing to age.
export function StorageStatusAlerts({
    measuredAt,
    error,
    onRetry,
    now = new Date(),
}: Readonly<StorageStatusAlertsProps>) {
    if (error) {
        return (
            <Alert variant="destructive">
                <AlertTriangle/>
                <AlertDescription>
                    <p>{`Couldn't load disk usage — ${error}. Try again.`}</p>
                    <Button size="sm" variant="outline" onClick={onRetry}>
                        Retry
                    </Button>
                </AlertDescription>
            </Alert>
        );
    }

    if (measuredAt !== null && isStorageMeasurementStale(measuredAt, now)) {
        return (
            <Alert className="border-yellow-200 bg-yellow-100 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                <AlertTriangle/>
                <AlertTitle>Disk usage is out of date</AlertTitle>
                <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                    {`The last measurement was ${formatMeasurementAge(measuredAt, now)} ago. Check the server logs if this keeps happening.`}
                </AlertDescription>
            </Alert>
        );
    }

    return null;
}
