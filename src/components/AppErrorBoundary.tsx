import { Component, type ErrorInfo, type ReactNode } from "react";

type AppErrorBoundaryState = {
  hasError: boolean;
};

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Aizu Connect could not render the current screen.", {
      error,
      componentStack: errorInfo.componentStack,
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="fatal-error-shell" aria-labelledby="fatal-error-title">
        <section className="fatal-error-card">
          <span className="fatal-error-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
              <path
                d="M12 3 2.8 20h18.4L12 3Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path
                d="M12 9v5m0 3h.01"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <p className="eyebrow">一時的な問題が発生しました</p>
          <h1 id="fatal-error-title">画面を表示できませんでした</h1>
          <p>
            入力内容はそのままにできない場合があります。通信環境を確認して、ページを読み込み直してください。
          </p>
          <button
            className="primary-action"
            type="button"
            onClick={() => globalThis.location.reload()}
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            もう一度読み込む
          </button>
        </section>
      </main>
    );
  }
}
