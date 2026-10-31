import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { AizuEvent, Tab } from "../types/domain";

const studentTabs: Tab[] = [
  "home",
  "search",
  "activity",
  "messages",
  "profile",
];
function tabFromLocation(): Tab {
  if (typeof window === "undefined") return "home";
  const candidate = new URLSearchParams(window.location.search).get("tab");
  return studentTabs.includes(candidate as Tab) ? (candidate as Tab) : "home";
}

export function useStudentNavigation(events: AizuEvent[]) {
  const [selectedEventId, setSelectedEventIdState] = useState<string | null>(
    () =>
      typeof window === "undefined"
        ? null
        : new URLSearchParams(window.location.search).get("event"),
  );
  const [activeTab, setActiveTabState] = useState<Tab>(tabFromLocation);

  const setSelectedEventId = useCallback<
    Dispatch<SetStateAction<string | null>>
  >((value) => {
    if ((value === null || value === "") && typeof window !== "undefined") {
      // Clear the URL before a concurrent list refresh can restore its event.
      const url = new URL(window.location.href);
      if (url.searchParams.has("event")) {
        url.searchParams.delete("event");
        window.history.replaceState(
          window.history.state,
          "",
          `${url.pathname}${url.search}${url.hash}`,
        );
      }
    }
    setSelectedEventIdState(value);
  }, []);

  const setActiveTab = useCallback((tab: Tab) => {
    setActiveTabState(tab);
    const url = new URL(window.location.href);
    if (tab === "home") url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);
    window.history.pushState(
      { tab },
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, []);

  const shouldFocusSearchRef = useRef(false);

  useEffect(() => {
    const handleHistoryNavigation = () => {
      setActiveTabState(tabFromLocation());
      const eventId = new URLSearchParams(window.location.search).get("event");
      setSelectedEventIdState(eventId);
    };
    window.addEventListener("popstate", handleHistoryNavigation);
    return () =>
      window.removeEventListener("popstate", handleHistoryNavigation);
  }, []);

  useEffect(() => {
    const eventId = new URLSearchParams(window.location.search).get("event");
    if (eventId && events.some((event) => event.id === eventId)) {
      setSelectedEventIdState(eventId);
    }
  }, [events]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const currentEventId = url.searchParams.get("event");
    if (currentEventId === selectedEventId) return;
    if (selectedEventId) {
      url.searchParams.set("event", selectedEventId);
      window.history.pushState(
        { ...window.history.state, tab: activeTab, event: selectedEventId },
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    } else {
      url.searchParams.delete("event");
      window.history.replaceState(
        { ...window.history.state, tab: activeTab },
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    }
  }, [activeTab, selectedEventId]);

  useEffect(() => {
    if (!(["home", "search"] as Tab[]).includes(activeTab) && selectedEventId) {
      setSelectedEventId(null);
    }
  }, [activeTab, selectedEventId, setSelectedEventId]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    window.requestAnimationFrame(() => {
      if (document.querySelector('[aria-modal="true"]')) return;
      if (activeTab === "search" && shouldFocusSearchRef.current) {
        document.getElementById("event-search-input")?.focus();
        shouldFocusSearchRef.current = false;
        return;
      }
      document.getElementById("student-main")?.focus({ preventScroll: true });
    });
  }, [activeTab]);

  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (activeTab === "search") {
          document.getElementById("event-search-input")?.focus();
          return;
        }
        shouldFocusSearchRef.current = true;
        setActiveTab("search");
      }
    };
    window.addEventListener("keydown", openSearch);
    return () => window.removeEventListener("keydown", openSearch);
  }, [activeTab, setActiveTab]);
  return { selectedEventId, setSelectedEventId, activeTab, setActiveTab };
}
