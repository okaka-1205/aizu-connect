import { lazy, Suspense } from "react";

const App = lazy(() => import("../App.tsx"));
const MobileMock = lazy(() =>
  import("./MobileMock").then((module) => ({ default: module.MobileMock })),
);

function LoadingBrand() {
  return (
    <div className="auth-brand">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
          <path
            d="M7.5 19 12 5l4.5 14M9 14h6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="3.5" r="1.5" fill="currentColor" />
        </svg>
      </span>
      <strong>Aizu Connect</strong>
    </div>
  );
}

function InitialAppShell() {
  return (
    <main
      className="loading-screen initial-app-shell"
      role="status"
      aria-label="読み込み中"
      aria-busy="true"
    >
      <LoadingBrand />
      <span className="initial-spinner" aria-hidden="true" />
    </main>
  );
}

export function AppLoader() {
  return (
    <Suspense fallback={<InitialAppShell />}>
      {window.location.pathname === "/mobile-mock" ? <MobileMock /> : <App />}
    </Suspense>
  );
}
