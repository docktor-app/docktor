import {ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,} from "lucide-react";
import {useSearchParams} from "react-router";
import {Button} from "@/components/ui/button";
import {TOUCH_TARGET} from "@/lib/touch-target";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue,} from "@/components/ui/select";

interface TablePaginationProps {
    currentPage: number;
    totalPages: number;
    pageSize: number;
    totalItems: number;
}

export const PAGE_SIZE_OPTIONS: readonly number[] = [10, 25, 50, 100];

export function TablePagination({
    currentPage,
    totalPages,
    pageSize,
    totalItems,
}: Readonly<TablePaginationProps>): React.JSX.Element {
    const [, setSearchParams] = useSearchParams();

    function goToPage(page: number) {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set("page", String(page));
            return next;
        });
    }

    function changePageSize(size: string) {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set("pageSize", size);
            next.set("page", "1");
            return next;
        });
    }

    return (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-2">
            <div className="text-sm text-muted-foreground">
                {totalItems} item{totalItems === 1 ? "" : "s"}
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Rows per page</span>
                    <Select
                        value={String(pageSize)}
                        onValueChange={changePageSize}
                    >
                        <SelectTrigger className="h-8 w-[70px] max-md:data-[size=default]:h-11">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent side="top">
                            {PAGE_SIZE_OPTIONS.map((size) => (
                                <SelectItem key={size} value={String(size)}>
                                    {size}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                </div>
                <div className="flex items-center gap-2 md:gap-1">
                    <Button
                        variant="outline"
                        size="icon-sm"
                        className={TOUCH_TARGET}
                        aria-label="First page"
                        onClick={() => goToPage(1)}
                        disabled={currentPage <= 1}
                    >
                        <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                        variant="outline"
                        size="icon-sm"
                        className={TOUCH_TARGET}
                        aria-label="Previous page"
                        onClick={() => goToPage(currentPage - 1)}
                        disabled={currentPage <= 1}
                    >
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                        variant="outline"
                        size="icon-sm"
                        className={TOUCH_TARGET}
                        aria-label="Next page"
                        onClick={() => goToPage(currentPage + 1)}
                        disabled={currentPage >= totalPages}
                    >
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                        variant="outline"
                        size="icon-sm"
                        className={TOUCH_TARGET}
                        aria-label="Last page"
                        onClick={() => goToPage(totalPages)}
                        disabled={currentPage >= totalPages}
                    >
                        <ChevronsRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
