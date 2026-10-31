import { useEffect, useRef, useState } from "react";
import { NoticeBanner } from "../../../components/ui/AppPrimitives";
import { getFirebaseErrorMessage } from "../../../lib/appLogic";
import { formatChatTime } from "../../../lib/eventUtils";
import {
  EVENT_SURVEY_PAGE_SIZE,
  loadEventSurveyPage,
  loadEventSurveySummary,
} from "../../../repositories/engagementRepository";
import type { EventSurveyResponse } from "../../../types/domain";

type SurveyPage = Awaited<ReturnType<typeof loadEventSurveyPage>>;
type SurveySummary = Awaited<ReturnType<typeof loadEventSurveySummary>>;

export function EventSurveyResults({ eventId }: { eventId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <details
      className="event-survey-results"
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary>開催後アンケート</summary>
      {isOpen && <SurveyResponses key={eventId} eventId={eventId} />}
    </details>
  );
}

function SurveyResponses({ eventId }: { eventId: string }) {
  const [responses, setResponses] = useState<EventSurveyResponse[]>([]);
  const [summary, setSummary] = useState<SurveySummary | null>(null);
  const [cursor, setCursor] = useState<SurveyPage["cursor"]>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const revision = useRef(0);
  const pendingPage = useRef(false);

  useEffect(() => {
    const current = ++revision.current;
    setIsLoading(true);
    setIsLoadingMore(false);
    pendingPage.current = false;
    setError("");
    setResponses([]);
    setSummary(null);
    setCursor(null);
    setHasMore(false);
    void Promise.all([
      loadEventSurveyPage(eventId),
      loadEventSurveySummary(eventId),
    ])
      .then(([page, totals]) => {
        if (revision.current !== current) return;
        setResponses(page.responses);
        setCursor(page.cursor);
        setHasMore(page.hasMore);
        setSummary(totals);
      })
      .catch((cause: unknown) => {
        if (revision.current === current)
          setError(getFirebaseErrorMessage(cause));
      })
      .finally(() => {
        if (revision.current === current) setIsLoading(false);
      });
    return () => {
      revision.current += 1;
    };
  }, [eventId, reloadKey]);

  const loadMore = async () => {
    if (isLoading || !hasMore || pendingPage.current) return;
    pendingPage.current = true;
    setIsLoadingMore(true);
    setError("");
    const current = revision.current;
    try {
      const page = await loadEventSurveyPage(eventId, cursor);
      if (revision.current !== current) return;
      setResponses((previous) =>
        Array.from(
          new Map(
            [...previous, ...page.responses].map((response) => [
              response.userId,
              response,
            ]),
          ).values(),
        ),
      );
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } catch (cause) {
      if (revision.current === current)
        setError(getFirebaseErrorMessage(cause));
    } finally {
      if (revision.current === current) {
        pendingPage.current = false;
        setIsLoadingMore(false);
      }
    }
  };

  return (
    <div
      className="event-survey-panel"
      role="region"
      aria-label="開催後アンケートの回答"
      aria-busy={isLoading || isLoadingMore}
    >
      <div className="event-survey-toolbar">
        <p>回答者名を表示せず、感想と満足度を確認できます。</p>
        <button
          type="button"
          disabled={isLoading || isLoadingMore}
          onClick={() => setReloadKey((current) => current + 1)}
        >
          回答を再読み込み
        </button>
      </div>
      {error && (
        <NoticeBanner
          message={`アンケートを取得できませんでした。${error}`}
          tone="error"
        />
      )}
      {isLoading && <p role="status">アンケートを読み込んでいます…</p>}
      {summary && (
        <dl className="event-survey-summary">
          <div>
            <dt>回答数</dt>
            <dd>{summary.responseCount}件</dd>
          </div>
          <div>
            <dt>平均満足度</dt>
            <dd>
              {summary.responseCount
                ? `${summary.averageRating.toFixed(1)} / 5`
                : "—"}
            </dd>
          </div>
          <div>
            <dt>おすすめ率</dt>
            <dd>
              {summary.responseCount
                ? `${Math.round((summary.recommendationCount / summary.responseCount) * 100)}%`
                : "—"}
            </dd>
          </div>
        </dl>
      )}
      {!isLoading && summary?.responseCount === 0 && (
        <p>まだ回答はありません。</p>
      )}
      <ul className="event-survey-response-list">
        {responses.map((response, index) => (
          <li key={response.userId}>
            <div>
              <strong>回答 {index + 1}</strong>
              <time>{formatChatTime(response.createdAt)}</time>
            </div>
            <small>
              満足度 {response.rating} / 5 ・{" "}
              {response.wouldRecommend ? "おすすめする" : "おすすめしない"}
            </small>
            <p>{response.comment?.trim() || "感想の記入はありません。"}</p>
          </li>
        ))}
      </ul>
      {hasMore && (
        <button
          className="secondary-action"
          type="button"
          disabled={isLoadingMore}
          onClick={() => void loadMore()}
        >
          {isLoadingMore
            ? "回答を読み込み中…"
            : `回答をさらに${EVENT_SURVEY_PAGE_SIZE}件読み込む`}
        </button>
      )}
    </div>
  );
}
