import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { AppErrorBoundary } from "./components/AppErrorBoundary.tsx";
import { AppLoader } from "./components/AppLoader.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <AppLoader />
    </AppErrorBoundary>
  </StrictMode>,
);
