import "@testing-library/jest-dom/vitest";
import {afterEach, vi} from "vitest";
import {cleanup} from "@testing-library/react";

// Ensure React Testing Library cleanup runs after each test
afterEach(() => {
    cleanup();
});

// jsdom does not provide EventSource — provide a minimal stub so component tests
// that render components using useLogStream / useContainerEvents don't throw.
// Individual hook tests that need to assert EventSource behaviour set their own
// more complete mock in beforeEach and clean up in afterEach.
if (typeof globalThis.EventSource === "undefined") {
    const MockEventSource = vi.fn(function (this: any, _url: string) {
        this.onopen = null;
        this.onmessage = null;
        this.onerror = null;
        this.close = vi.fn();
        this.readyState = 0;
    }) as any;
    MockEventSource.CONNECTING = 0;
    MockEventSource.OPEN = 1;
    MockEventSource.CLOSED = 2;
    globalThis.EventSource = MockEventSource;
}

// jsdom does not implement matchMedia; next-themes' ThemeProvider (enableSystem)
// and SidebarProvider's mobile-detection hook both call it unconditionally.
// Guarded so a test file's own more specific local stub (several stack/backup
// detail page tests define one) is not clobbered — it simply becomes a no-op
// once this global stub is already in place.
if (typeof window.matchMedia !== "function") {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    }));
}

// jsdom does not implement Range.getClientRects()/getBoundingClientRect() —
// CodeMirror 6 (11-09) calls both while measuring text during layout.
// Guarded by existence checks so a future jsdom release that implements
// these (or a browser-based test runner) is left untouched.
if (typeof Range !== "undefined") {
    if (!Range.prototype.getClientRects) {
        Range.prototype.getClientRects = function (): DOMRectList {
            return {
                length: 0,
                item: () => null,
                [Symbol.iterator]: function* () {},
            } as unknown as DOMRectList;
        };
    }
    if (!Range.prototype.getBoundingClientRect) {
        Range.prototype.getBoundingClientRect = function (): DOMRect {
            return {
                bottom: 0,
                height: 0,
                left: 0,
                right: 0,
                top: 0,
                width: 0,
                x: 0,
                y: 0,
                toJSON() {
                    return this;
                },
            } as DOMRect;
        };
    }
}
