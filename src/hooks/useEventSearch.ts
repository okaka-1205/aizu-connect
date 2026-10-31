import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { useCallback, useMemo, useState } from "react";
import {
  isFutureEventStart,
  matchesCategoryFilter,
  type Filter,
} from "../lib/appLogic";
import { selectRecommendedEvent, timestampMillis } from "../lib/eventUtils";
import { db } from "../lib/firebase";
import type {
  AizuEvent,
  AppUser,
  SavedSearch,
  SearchDateFilter,
  SearchDayFilter,
  SearchFeeFilter,
  SearchFormatFilter,
  SearchSort,
  SearchTimeFilter,
  SearchView,
  SetNotice,
} from "../types/domain";

export function useEventSearch({
  events,
  appUser,
  setMessage,
}: {
  events: AizuEvent[];
  appUser: AppUser | null;
  setMessage: SetNotice;
}) {
  const [filter, setFilter] = useState<Filter>("すべて");
  const [searchText, setSearchText] = useState("");
  const [searchDateFilter, setSearchDateFilter] =
    useState<SearchDateFilter>("すべて");
  const [searchSort, setSearchSort] = useState<SearchSort>("開催が近い順");
  const [searchDayFilter, setSearchDayFilter] =
    useState<SearchDayFilter>("すべて");
  const [searchTimeFilter, setSearchTimeFilter] =
    useState<SearchTimeFilter>("すべて");
  const [searchFeeFilter, setSearchFeeFilter] =
    useState<SearchFeeFilter>("すべて");
  const [searchFormatFilter, setSearchFormatFilter] =
    useState<SearchFormatFilter>("すべて");
  const [searchView, setSearchView] = useState<SearchView>("list");
  const [onlyAvailableEvents, setOnlyAvailableEvents] = useState(false);
  const [onlyBeginnerEvents, setOnlyBeginnerEvents] = useState(false);
  const [savedSearch, setSavedSearch] = useState<SavedSearch | null>(null);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);

  const upcomingEvents = useMemo(
    () => events.filter((event) => isFutureEventStart(event.startAt?.toDate())),
    [events],
  );

  const filteredEvents = useMemo(() => {
    const normalized = searchText.trim().toLowerCase();
    const now = new Date();
    const weekLimit = new Date(now);
    weekLimit.setDate(now.getDate() + 7);
    const filtered = upcomingEvents.filter((event) => {
      const matchesFilter = matchesCategoryFilter(event.category, filter);
      const matchesSearch =
        !normalized ||
        [
          event.title,
          event.summary,
          event.location,
          event.organizationName,
          event.beginnerLevel ?? "",
          ...(event.takeaways ?? []),
          ...event.tags,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      const eventDate = event.startAt?.toDate();
      const matchesDate =
        searchDateFilter === "すべて" ||
        !eventDate ||
        (searchDateFilter === "今週" &&
          eventDate >= now &&
          eventDate <= weekLimit) ||
        (searchDateFilter === "今月" &&
          eventDate >= now &&
          eventDate.getMonth() === now.getMonth() &&
          eventDate.getFullYear() === now.getFullYear());
      const matchesCapacity =
        !onlyAvailableEvents ||
        Number(event.applicantCount ?? 0) < Number(event.capacity ?? 0);
      const matchesBeginner =
        !onlyBeginnerEvents ||
        event.beginnerLevel === "初参加歓迎" ||
        event.tags.some((tag) => tag.includes("初心者"));
      const eventDay = eventDate?.getDay();
      const matchesDay =
        searchDayFilter === "すべて" ||
        eventDay === undefined ||
        (searchDayFilter === "土日"
          ? eventDay === 0 || eventDay === 6
          : eventDay >= 1 && eventDay <= 5);
      const eventHour = eventDate?.getHours();
      const matchesTime =
        searchTimeFilter === "すべて" ||
        eventHour === undefined ||
        (searchTimeFilter === "午前"
          ? eventHour < 12
          : searchTimeFilter === "午後"
            ? eventHour >= 12 && eventHour < 18
            : eventHour >= 18);
      const matchesFee =
        searchFeeFilter === "すべて" ||
        (event.feeType ?? "無料") === searchFeeFilter;
      const matchesFormat =
        searchFormatFilter === "すべて" ||
        (event.eventFormat ?? "現地") === searchFormatFilter;
      return (
        matchesFilter &&
        matchesSearch &&
        matchesDate &&
        matchesCapacity &&
        matchesBeginner &&
        matchesDay &&
        matchesTime &&
        matchesFee &&
        matchesFormat
      );
    });
    return filtered.sort((left, right) => {
      if (searchSort === "人気順") {
        return (
          Number(right.applicantCount ?? 0) - Number(left.applicantCount ?? 0)
        );
      }
      if (searchSort === "新着順") {
        return (
          timestampMillis(right.createdAt) - timestampMillis(left.createdAt)
        );
      }
      return timestampMillis(left.startAt) - timestampMillis(right.startAt);
    });
  }, [
    filter,
    onlyAvailableEvents,
    onlyBeginnerEvents,
    searchDayFilter,
    searchDateFilter,
    searchFeeFilter,
    searchFormatFilter,
    searchSort,
    searchText,
    searchTimeFilter,
    upcomingEvents,
  ]);

  const hasActiveSearchCriteria = Boolean(
    searchText.trim() ||
    filter !== "すべて" ||
    searchDateFilter !== "すべて" ||
    searchDayFilter !== "すべて" ||
    searchTimeFilter !== "すべて" ||
    searchFeeFilter !== "すべて" ||
    searchFormatFilter !== "すべて" ||
    onlyAvailableEvents ||
    onlyBeginnerEvents,
  );

  const searchCriteriaKey = JSON.stringify([
    searchText.trim(),
    filter,
    searchDateFilter,
    searchDayFilter,
    searchTimeFilter,
    searchFeeFilter,
    searchFormatFilter,
    searchSort,
    onlyAvailableEvents,
    onlyBeginnerEvents,
  ]);

  const recommendedEvent = useMemo(
    () => selectRecommendedEvent(upcomingEvents, appUser?.interests),
    [appUser?.interests, upcomingEvents],
  );

  const recommendationLabel = useMemo(() => {
    if (!recommendedEvent) return "開催日が近いイベント";
    const searchable = [
      recommendedEvent.category,
      recommendedEvent.title,
      ...recommendedEvent.tags,
    ].join(" ");
    if (appUser?.interests.some((interest) => searchable.includes(interest))) {
      return "興味分野に関連";
    }
    const daysUntil =
      (timestampMillis(recommendedEvent.startAt) - Date.now()) / 86_400_000;
    return daysUntil <= 7 ? "7日以内に開催" : "開催日が近いイベント";
  }, [appUser?.interests, recommendedEvent]);

  const saveCurrentSearch = async () => {
    if (!appUser) return;
    const searchCriteria = {
      userId: appUser.uid,
      name: searchText.trim() || `${filter}・${searchDateFilter}`,
      searchText,
      category: filter,
      dateFilter: searchDateFilter,
      dayFilter: searchDayFilter,
      timeFilter: searchTimeFilter,
      feeFilter: searchFeeFilter,
      formatFilter: searchFormatFilter,
      onlyAvailable: onlyAvailableEvents,
      onlyBeginner: onlyBeginnerEvents,
    };
    const criteriaSignature = (search: Omit<SavedSearch, "id" | "updatedAt">) =>
      JSON.stringify([
        search.searchText.trim(),
        search.category,
        search.dateFilter,
        search.dayFilter,
        search.timeFilter,
        search.feeFilter,
        search.formatFilter,
        search.onlyAvailable,
        search.onlyBeginner,
      ]);
    const existingSearch = savedSearches.find(
      (search) =>
        criteriaSignature(search) === criteriaSignature(searchCriteria),
    );
    const nextSearch: SavedSearch = {
      ...searchCriteria,
      id: existingSearch?.id ?? `${appUser.uid}_${Date.now()}`,
    };
    const { id: savedSearchId, ...savedSearchData } = nextSearch;
    await setDoc(
      doc(db, "savedSearches", savedSearchId ?? `${appUser.uid}_default`),
      { ...savedSearchData, updatedAt: serverTimestamp() },
      { merge: true },
    );
    setSavedSearch(nextSearch);
    setSavedSearches((current) => [
      nextSearch,
      ...current.filter((search) => search.id !== nextSearch.id),
    ]);
    setMessage(
      "検索条件を保存しました。条件に合う新着イベントを通知します。",
      "success",
    );
  };

  const applySavedSearch = (selectedSearch?: SavedSearch) => {
    const search = selectedSearch ?? savedSearch;
    if (!search) return;
    setSearchText(search.searchText);
    setFilter(search.category);
    setSearchDateFilter(search.dateFilter);
    setSearchDayFilter(search.dayFilter);
    setSearchTimeFilter(search.timeFilter);
    setSearchFeeFilter(search.feeFilter);
    setSearchFormatFilter(search.formatFilter);
    setOnlyAvailableEvents(search.onlyAvailable);
    setOnlyBeginnerEvents(search.onlyBeginner);
  };

  const deleteSavedSearch = async (search: SavedSearch) => {
    if (!search.id) return;
    await deleteDoc(doc(db, "savedSearches", search.id));
    setSavedSearches((current) => {
      const next = current.filter((item) => item.id !== search.id);
      setSavedSearch((selected) =>
        selected?.id === search.id ? (next[0] ?? null) : selected,
      );
      return next;
    });
    setMessage("保存した検索条件を削除しました。", "success");
  };
  const resetSearch = useCallback(() => {
    setSearchText("");
    setFilter("すべて");
    setSearchDateFilter("すべて");
    setSearchDayFilter("すべて");
    setSearchTimeFilter("すべて");
    setSearchFeeFilter("すべて");
    setSearchFormatFilter("すべて");
    setSearchSort("開催が近い順");
    setSearchView("list");
    setOnlyAvailableEvents(false);
    setOnlyBeginnerEvents(false);
  }, []);
  const resetSavedSearches = useCallback(() => {
    setSavedSearch(null);
    setSavedSearches([]);
  }, []);
  return {
    resetSearch,
    resetSavedSearches,
    filter,
    setFilter,
    searchText,
    setSearchText,
    searchDateFilter,
    setSearchDateFilter,
    searchSort,
    setSearchSort,
    searchDayFilter,
    setSearchDayFilter,
    searchTimeFilter,
    setSearchTimeFilter,
    searchFeeFilter,
    setSearchFeeFilter,
    searchFormatFilter,
    setSearchFormatFilter,
    searchView,
    setSearchView,
    onlyAvailableEvents,
    setOnlyAvailableEvents,
    onlyBeginnerEvents,
    setOnlyBeginnerEvents,
    savedSearch,
    setSavedSearch,
    savedSearches,
    setSavedSearches,
    upcomingEvents,
    filteredEvents,
    hasActiveSearchCriteria,
    searchCriteriaKey,
    recommendedEvent,
    recommendationLabel,
    saveCurrentSearch,
    applySavedSearch,
    deleteSavedSearch,
  };
}
