import {
  Bell,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter as FilterIcon,
  List,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import {
  EmptyEvents,
  EmptySearchResults,
  SectionHeading,
} from "../../components/ui/AppPrimitives";
import { EVENT_PAGE_SIZE } from "../../config/events";
import { categories, type Filter } from "../../lib/appLogic";
import { formatChatDay as formatEventDay } from "../../lib/eventUtils";
import type {
  AizuEvent,
  EventApplication,
  SearchDateFilter,
  SearchDayFilter,
  SearchFeeFilter,
  SearchFormatFilter,
  SearchSort,
  SearchTimeFilter,
  SearchView,
  SavedSearch,
  Tab,
} from "../../types/domain";
import { EventDrawer } from "../shared/EventDrawer";
import { EventCard, FeaturedEvent } from "./EventCards";

const SEARCH_RESULTS_PER_PAGE = 6;

export function HomeTab(props: {
  events: AizuEvent[];
  recommendedEvent?: AizuEvent;
  recommendationLabel: string;
  applications: EventApplication[];
  savedEventIds: string[];
  selectedEvent?: AizuEvent;
  selectedEventId: string | null;
  setSelectedEventId: (id: string) => void;
  toggleSaved: (id: string) => void;
  hasApplied: (id: string) => boolean;
  requestApplication: (event: AizuEvent) => void;
  isActionLoading: boolean;
  setActiveTab: (tab: Tab) => void;
  setFilter: (value: Filter) => void;
  onReport: (event: AizuEvent) => void;
}) {
  const {
    events,
    recommendedEvent,
    recommendationLabel,
    applications,
    savedEventIds,
    selectedEventId,
    setSelectedEventId,
    toggleSaved,
    hasApplied,
    requestApplication,
    isActionLoading,
    setActiveTab,
    setFilter,
  } = props;
  return (
    <section className="tab-page home-page">
      <button
        className="search-launch"
        type="button"
        aria-keyshortcuts="Meta+K Control+K"
        onClick={() => setActiveTab("search")}
      >
        <Search size={18} />
        <span>イベント・活動・地域を探す</span>
        <kbd>⌘ K</kbd>
      </button>
      <div className="category-row">
        {categories.map((category) => (
          <button
            className={
              category === "すべて" ? "category-pill active" : "category-pill"
            }
            key={category}
            type="button"
            onClick={() => {
              setFilter(category);
              setActiveTab("search");
            }}
          >
            {category}
          </button>
        ))}
      </div>
      {applications.some((application) =>
        ["pending", "confirmed"].includes(application.status),
      ) && (
        <section className="upcoming-banner">
          <div className="upcoming-banner-icon">
            <CalendarClock size={19} />
          </div>
          <div>
            <p className="eyebrow">申請状況</p>
            <strong>
              {applications.find((application) =>
                ["confirmed", "pending"].includes(application.status),
              )?.eventTitle ?? "参加予定のイベント"}
            </strong>
            <span>
              {applications.find((application) =>
                ["confirmed", "pending"].includes(application.status),
              )?.status === "confirmed"
                ? "参加確定。開催前に詳細を確認しましょう。"
                : "主催者が申請を確認しています。"}
            </span>
          </div>
          <button type="button" onClick={() => setActiveTab("activity")}>
            活動を見る <ChevronRight size={15} />
          </button>
        </section>
      )}
      {events.length === 0 ? (
        <EmptyEvents />
      ) : (
        <>
          <section className="feature-section">
            <SectionHeading
              title="おすすめのイベント"
              action="すべて見る"
              onClick={() => setActiveTab("search")}
            />
            {recommendedEvent && (
              <FeaturedEvent
                event={recommendedEvent}
                label={recommendationLabel}
                saved={savedEventIds.includes(recommendedEvent.id)}
                onSave={() => toggleSaved(recommendedEvent.id)}
                onOpen={() => setSelectedEventId(recommendedEvent.id)}
              />
            )}
          </section>
          <section>
            <SectionHeading
              title="新着イベント"
              action="イベントを見る"
              onClick={() => setActiveTab("search")}
            />
            <div className="event-grid">
              {events.slice(0, 4).map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  saved={savedEventIds.includes(event.id)}
                  selected={selectedEventId === event.id}
                  applied={hasApplied(event.id)}
                  onSave={() => toggleSaved(event.id)}
                  onOpen={() => setSelectedEventId(event.id)}
                />
              ))}
            </div>
          </section>
          {props.selectedEvent && (
            <EventDrawer
              event={props.selectedEvent}
              applied={hasApplied(props.selectedEvent.id)}
              onApply={() => requestApplication(props.selectedEvent!)}
              isLoading={isActionLoading}
              onReport={() => props.onReport(props.selectedEvent!)}
              onClose={() => setSelectedEventId("")}
            />
          )}
        </>
      )}
    </section>
  );
}

export function SearchTab(props: {
  filteredEvents: AizuEvent[];
  loadedEventCount: number;
  hasMoreEvents: boolean;
  isLoadingMoreEvents: boolean;
  onLoadMoreEvents: () => void;
  searchText: string;
  setSearchText: (value: string) => void;
  filter: Filter;
  setFilter: (value: Filter) => void;
  savedEventIds: string[];
  toggleSaved: (id: string) => void;
  selectedEventId: string | null;
  setSelectedEventId: (id: string) => void;
  selectedEvent?: AizuEvent;
  hasApplied: (id: string) => boolean;
  requestApplication: (event: AizuEvent) => void;
  isActionLoading: boolean;
  searchDateFilter: SearchDateFilter;
  setSearchDateFilter: (value: SearchDateFilter) => void;
  searchSort: SearchSort;
  setSearchSort: (value: SearchSort) => void;
  searchDayFilter: SearchDayFilter;
  setSearchDayFilter: (value: SearchDayFilter) => void;
  searchTimeFilter: SearchTimeFilter;
  setSearchTimeFilter: (value: SearchTimeFilter) => void;
  searchFeeFilter: SearchFeeFilter;
  setSearchFeeFilter: (value: SearchFeeFilter) => void;
  searchFormatFilter: SearchFormatFilter;
  setSearchFormatFilter: (value: SearchFormatFilter) => void;
  searchView: SearchView;
  setSearchView: (value: SearchView) => void;
  savedSearch: SavedSearch | null;
  savedSearches?: SavedSearch[];
  hasMoreSavedSearches?: boolean;
  onLoadMoreSavedSearches?: () => void;
  onSaveSearch: () => void;
  onApplySavedSearch: (search?: SavedSearch) => void;
  onDeleteSavedSearch: (search: SavedSearch) => Promise<void>;
  onlyAvailableEvents: boolean;
  setOnlyAvailableEvents: (value: boolean) => void;
  onlyBeginnerEvents: boolean;
  setOnlyBeginnerEvents: (value: boolean) => void;
  onResetFilters: () => void;
  onReport: (event: AizuEvent) => void;
}) {
  const [areAdvancedFiltersOpen, setAreAdvancedFiltersOpen] = useState(false);
  const [selectedSavedSearchId, setSelectedSavedSearchId] = useState("");
  const [savedSearchFilter, setSavedSearchFilter] = useState("");
  const [savedSearchToDelete, setSavedSearchToDelete] =
    useState<SavedSearch | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [resultPage, setResultPage] = useState({ key: "", page: 1 });
  const resultKey = JSON.stringify([
    props.searchText,
    props.filter,
    props.searchDateFilter,
    props.searchDayFilter,
    props.searchTimeFilter,
    props.searchFeeFilter,
    props.searchFormatFilter,
    props.searchSort,
    props.onlyAvailableEvents,
    props.onlyBeginnerEvents,
    props.searchView,
  ]);
  useEffect(() => {
    setResultPage({ key: resultKey, page: 1 });
  }, [resultKey]);
  const pageCount = Math.max(
    1,
    Math.ceil(props.filteredEvents.length / SEARCH_RESULTS_PER_PAGE),
  );
  const currentPage = Math.min(
    resultPage.key === resultKey ? resultPage.page : 1,
    pageCount,
  );
  const resultStart = (currentPage - 1) * SEARCH_RESULTS_PER_PAGE;
  const visibleEvents = useMemo(
    () =>
      props.filteredEvents.slice(
        resultStart,
        resultStart + SEARCH_RESULTS_PER_PAGE,
      ),
    [props.filteredEvents, resultStart],
  );
  const changeResultPage = (page: number) => {
    setResultPage({ key: resultKey, page });
    resultsRef.current?.focus({ preventScroll: true });
    resultsRef.current?.scrollIntoView({ block: "start" });
  };
  const visibleSavedSearches = (props.savedSearches ?? []).filter((search) =>
    [search.name, search.searchText, search.category]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("ja-JP")
      .includes(savedSearchFilter.trim().toLocaleLowerCase("ja-JP")),
  );
  const activeAdvancedFilterCount = [
    props.searchDateFilter !== "すべて",
    props.onlyAvailableEvents,
    props.onlyBeginnerEvents,
    props.searchDayFilter !== "すべて",
    props.searchTimeFilter !== "すべて",
    props.searchFeeFilter !== "すべて",
    props.searchFormatFilter !== "すべて",
    props.searchSort !== "開催が近い順",
  ].filter(Boolean).length;
  const calendarGroups = useMemo(() => {
    const groups: Record<string, AizuEvent[]> = {};
    if (props.searchView === "calendar") {
      for (const event of visibleEvents) {
        const key = event.startAt ? formatEventDay(event.startAt) : "日時未定";
        (groups[key] ??= []).push(event);
      }
    }
    return groups;
  }, [visibleEvents, props.searchView]);
  return (
    <section className="tab-page search-page">
      <div className="page-title">
        <div>
          <h1>イベントを探す</h1>
        </div>
        <div className="result-count" role="status" aria-atomic="true">
          <span>
            {props.filteredEvents.length}
            <small>件</small>
          </span>
          {props.isLoadingMoreEvents && <em>検索中</em>}
        </div>
      </div>
      <div className="search-field large">
        <Search size={19} />
        <input
          id="event-search-input"
          aria-label="イベントを検索"
          value={props.searchText}
          onChange={(event) => props.setSearchText(event.target.value)}
          placeholder="イベント、活動、地域を検索"
        />
      </div>
      <div className="filter-row">
        {categories.map((category) => (
          <button
            className={
              props.filter === category ? "filter-chip active" : "filter-chip"
            }
            key={category}
            type="button"
            aria-pressed={props.filter === category}
            onClick={() => props.setFilter(category)}
          >
            {category}
          </button>
        ))}
      </div>
      <div className="mobile-filter-actions">
        <button
          className="mobile-filter-trigger"
          type="button"
          aria-controls="advanced-search-filters"
          aria-expanded={areAdvancedFiltersOpen}
          onClick={() => setAreAdvancedFiltersOpen((current) => !current)}
        >
          <FilterIcon size={17} />
          絞り込み
          {activeAdvancedFilterCount > 0 && (
            <span>{activeAdvancedFilterCount}</span>
          )}
          <ChevronRight
            className={areAdvancedFiltersOpen ? "open" : ""}
            size={16}
          />
        </button>
        {activeAdvancedFilterCount > 0 && (
          <button
            className="mobile-filter-reset"
            type="button"
            onClick={props.onResetFilters}
          >
            条件をクリア
          </button>
        )}
      </div>
      <div
        className={`search-filter-panel ${areAdvancedFiltersOpen ? "open" : ""}`}
        id="advanced-search-filters"
      >
        <div className="search-filter-panel-head">
          <strong>詳細な絞り込み</strong>
        </div>
        <div className="advanced-filter-row" aria-label="追加の絞り込み">
          <div className="advanced-filter-group">
            <CalendarClock size={15} />
            {(["すべて", "今週", "今月"] as SearchDateFilter[]).map((value) => (
              <button
                className={props.searchDateFilter === value ? "active" : ""}
                key={value}
                type="button"
                aria-pressed={props.searchDateFilter === value}
                onClick={() => props.setSearchDateFilter(value)}
              >
                {value}
              </button>
            ))}
          </div>
          <label className="toggle-filter">
            <input
              type="checkbox"
              checked={props.onlyAvailableEvents}
              onChange={(event) =>
                props.setOnlyAvailableEvents(event.target.checked)
              }
            />
            残り枠あり
          </label>
          <label className="toggle-filter">
            <input
              type="checkbox"
              checked={props.onlyBeginnerEvents}
              onChange={(event) =>
                props.setOnlyBeginnerEvents(event.target.checked)
              }
            />
            初心者歓迎
          </label>
        </div>
        <div className="search-control-grid">
          <label>
            <span>曜日</span>
            <select
              aria-label="曜日で絞り込む"
              value={props.searchDayFilter}
              onChange={(event) =>
                props.setSearchDayFilter(event.target.value as SearchDayFilter)
              }
            >
              <option>すべて</option>
              <option>平日</option>
              <option>土日</option>
            </select>
          </label>
          <label>
            <span>時間帯</span>
            <select
              aria-label="時間帯で絞り込む"
              value={props.searchTimeFilter}
              onChange={(event) =>
                props.setSearchTimeFilter(
                  event.target.value as SearchTimeFilter,
                )
              }
            >
              <option>すべて</option>
              <option>午前</option>
              <option>午後</option>
              <option>夜</option>
            </select>
          </label>
          <label>
            <span>料金</span>
            <select
              aria-label="料金で絞り込む"
              value={props.searchFeeFilter}
              onChange={(event) =>
                props.setSearchFeeFilter(event.target.value as SearchFeeFilter)
              }
            >
              <option>すべて</option>
              <option>無料</option>
              <option>有料</option>
            </select>
          </label>
          <label>
            <span>開催形式</span>
            <select
              aria-label="開催形式で絞り込む"
              value={props.searchFormatFilter}
              onChange={(event) =>
                props.setSearchFormatFilter(
                  event.target.value as SearchFormatFilter,
                )
              }
            >
              <option>すべて</option>
              <option>現地</option>
              <option>オンライン</option>
              <option>ハイブリッド</option>
            </select>
          </label>
          <label>
            <span>並び順</span>
            <select
              aria-label="イベントの並び順"
              value={props.searchSort}
              onChange={(event) =>
                props.setSearchSort(event.target.value as SearchSort)
              }
            >
              <option>開催が近い順</option>
              <option>人気順</option>
              <option>新着順</option>
            </select>
          </label>
        </div>
      </div>
      <div className="search-options">
        <details className="search-display-options">
          <summary>表示方法</summary>
          <div className="search-toolbar">
            <div className="view-switch" role="group" aria-label="表示形式">
              <button
                className={props.searchView === "list" ? "active" : ""}
                type="button"
                title="一覧表示"
                aria-label="一覧表示"
                aria-pressed={props.searchView === "list"}
                onClick={() => props.setSearchView("list")}
              >
                <List size={16} />
                <span>一覧</span>
              </button>
              <button
                className={props.searchView === "calendar" ? "active" : ""}
                type="button"
                title="日付別表示"
                aria-label="日付別表示"
                aria-pressed={props.searchView === "calendar"}
                onClick={() => props.setSearchView("calendar")}
              >
                <CalendarDays size={16} />
                <span>日付別</span>
              </button>
            </div>
          </div>
        </details>
        <details className="search-display-options search-saved-options">
          <summary>検索条件を保存</summary>
          <div className="saved-search-actions">
            {(props.savedSearches?.length ?? 0) > 0 ? (
              <div className="saved-search-manager">
                <div className="saved-search-manager-head">
                  <strong>保存した条件</strong>
                  <span>{props.savedSearches?.length ?? 0}件</span>
                </div>
                {(props.savedSearches?.length ?? 0) > 5 && (
                  <label className="saved-search-filter">
                    <Search size={14} />
                    <input
                      aria-label="保存した検索条件を検索"
                      value={savedSearchFilter}
                      onChange={(event) =>
                        setSavedSearchFilter(event.target.value)
                      }
                      placeholder="名前・キーワードで絞り込み"
                    />
                  </label>
                )}
                <div className="saved-search-list" role="list">
                  {visibleSavedSearches.map((search) => {
                    const label =
                      search.name || search.searchText || "保存した条件";
                    const details = [
                      search.category !== "すべて" ? search.category : "",
                      search.dateFilter !== "すべて" ? search.dateFilter : "",
                      search.feeFilter !== "すべて" ? search.feeFilter : "",
                    ].filter(Boolean);
                    return (
                      <div
                        className="saved-search-row"
                        role="listitem"
                        key={search.id}
                      >
                        <button
                          className={
                            selectedSavedSearchId === search.id ? "active" : ""
                          }
                          type="button"
                          aria-pressed={selectedSavedSearchId === search.id}
                          onClick={() => {
                            setSelectedSavedSearchId(search.id ?? "");
                            props.onApplySavedSearch(search);
                          }}
                        >
                          <strong>{label}</strong>
                          <small>
                            {details.join("・") || "すべてのイベント"}
                          </small>
                        </button>
                        <button
                          className="saved-search-row-delete"
                          type="button"
                          aria-label={`「${label}」を削除`}
                          onClick={() => setSavedSearchToDelete(search)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    );
                  })}
                  {visibleSavedSearches.length === 0 && (
                    <p className="saved-search-empty">
                      一致する保存条件はありません。
                    </p>
                  )}
                </div>
                {props.hasMoreSavedSearches &&
                  props.onLoadMoreSavedSearches && (
                    <button
                      className="secondary-action"
                      type="button"
                      onClick={props.onLoadMoreSavedSearches}
                    >
                      保存条件をさらに読み込む
                    </button>
                  )}
              </div>
            ) : props.savedSearch ? (
              <button
                type="button"
                onClick={() =>
                  props.onApplySavedSearch(props.savedSearch ?? undefined)
                }
              >
                <RefreshCw size={14} />
                保存条件を適用
              </button>
            ) : null}
            <button type="button" onClick={props.onSaveSearch}>
              <Bell size={14} />
              この条件を保存
            </button>
          </div>
        </details>
      </div>
      <div
        ref={resultsRef}
        className="search-results"
        role="region"
        aria-label="イベントの検索結果"
        tabIndex={-1}
      >
        {props.filteredEvents.length === 0 ? (
          <EmptySearchResults
            hasMoreEvents={props.hasMoreEvents}
            isLoading={props.isLoadingMoreEvents}
            onReset={props.onResetFilters}
          />
        ) : props.searchView === "calendar" ? (
          <div className="calendar-event-groups">
            {Object.entries(calendarGroups).map(([date, events]) => (
              <section key={date}>
                <h3>{date}</h3>
                <div className="event-grid search-grid">
                  {events.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      saved={props.savedEventIds.includes(event.id)}
                      selected={props.selectedEventId === event.id}
                      applied={props.hasApplied(event.id)}
                      onSave={() => props.toggleSaved(event.id)}
                      onOpen={() => props.setSelectedEventId(event.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="event-grid search-grid">
            {visibleEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                saved={props.savedEventIds.includes(event.id)}
                selected={props.selectedEventId === event.id}
                applied={props.hasApplied(event.id)}
                onSave={() => props.toggleSaved(event.id)}
                onOpen={() => props.setSelectedEventId(event.id)}
              />
            ))}
          </div>
        )}
      </div>
      {pageCount > 1 && (
        <nav
          className="search-results-pagination"
          aria-label="検索結果のページ切り替え"
        >
          <button
            type="button"
            aria-label="前のページ"
            disabled={currentPage === 1}
            onClick={() => changeResultPage(currentPage - 1)}
          >
            <ChevronLeft size={18} />
            前へ
          </button>
          <span role="status" aria-live="polite" aria-atomic="true">
            <strong>
              {currentPage} / {pageCount}
            </strong>
            <small>
              {resultStart + 1}–
              {Math.min(
                resultStart + SEARCH_RESULTS_PER_PAGE,
                props.filteredEvents.length,
              )}
              件 / {props.filteredEvents.length}件
            </small>
          </span>
          <button
            type="button"
            aria-label="次のページ"
            disabled={currentPage === pageCount}
            onClick={() => changeResultPage(currentPage + 1)}
          >
            次へ
            <ChevronRight size={18} />
          </button>
        </nav>
      )}
      {props.hasMoreEvents && (
        <div className="event-pagination">
          <button
            type="button"
            onClick={props.onLoadMoreEvents}
            disabled={props.isLoadingMoreEvents}
          >
            <RefreshCw
              size={15}
              className={props.isLoadingMoreEvents ? "spin" : ""}
            />
            {props.isLoadingMoreEvents
              ? "イベントを読み込み中"
              : `さらに${EVENT_PAGE_SIZE}件を読み込む`}
          </button>
        </div>
      )}
      {props.selectedEvent && (
        <EventDrawer
          event={props.selectedEvent}
          applied={props.hasApplied(props.selectedEvent.id)}
          onApply={() => props.requestApplication(props.selectedEvent!)}
          isLoading={props.isActionLoading}
          onReport={() => props.onReport(props.selectedEvent!)}
          onClose={() => props.setSelectedEventId("")}
        />
      )}
      {savedSearchToDelete && (
        <ConfirmDialog
          title="保存した検索条件を削除"
          description={`「${savedSearchToDelete.name || savedSearchToDelete.searchText || "保存した条件"}」を削除します。`}
          confirmLabel="削除する"
          danger
          onClose={() => setSavedSearchToDelete(null)}
          onConfirm={() => {
            const target = savedSearchToDelete;
            setSavedSearchToDelete(null);
            setSelectedSavedSearchId("");
            void props.onDeleteSavedSearch(target);
          }}
        />
      )}
    </section>
  );
}
