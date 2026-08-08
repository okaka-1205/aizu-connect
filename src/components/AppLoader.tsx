import { lazy, Suspense } from "react";

const App = lazy(() => import("../App.tsx"));

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
    <main className="auth-shell initial-app-shell" aria-busy="true">
      <div className="auth-visual">
        <LoadingBrand />
        <div>
          <h1>
            会津のイベント
            <br />
            <em>を探す。</em>
          </h1>
          <p>
            学生・地域・団体が主催するイベントを、
            <br />
            探して、申し込んで、参加できます。
          </p>
        </div>
        <div className="auth-visual-note">参加した活動は記録として残ります</div>
      </div>
      <div className="auth-form-wrap">
        <div className="auth-form-card">
          <div className="auth-mobile-brand">
            <LoadingBrand />
          </div>
          <h2>アカウントを作成</h2>
          <p className="auth-lede" role="status">
            利用に必要な情報を準備しています。
          </p>
          <div className="initial-loading-lines" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
    </main>
  );
}

export function AppLoader() {
  return (
    <Suspense fallback={<InitialAppShell />}>
      <App />
    </Suspense>
  );
}
