import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import {RouterProvider} from "react-router";
import "./index.css";
import {ThemeProvider} from "@/components/common/theme-provider";
import {ThemedToaster} from "@/components/common/themed-toaster";
import {router} from "@/router";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <ThemeProvider>
            <ThemedToaster />
            <RouterProvider router={router} />
        </ThemeProvider>
    </StrictMode>,
);
