import {
  CalendarDays,
  ChevronRight,
  FileText,
  Heart,
  MapPin,
} from "lucide-react";
import type { AizuEvent } from "../../types/domain";

export function EventCard({
  event,
  saved,
  selected,
  applied,
  onSave,
  onOpen,
}: {
  event: AizuEvent;
  saved: boolean;
  selected: boolean;
  applied: boolean;
  onSave: () => void;
  onOpen: () => void;
}) {
  return (
    <article className={`event-card ${selected ? "selected" : ""}`}>
      <div className="event-card-main">
        <div className="event-image-wrap">
          <div className="event-image-button">
            <img
              src={event.imageUrl}
              alt={`${event.title}の画像`}
              loading="lazy"
            />
            <span className="event-category">{event.category}</span>
          </div>
          <button
            className={`save-button ${saved ? "saved" : ""}`}
            title={saved ? "保存を解除" : "保存"}
            aria-label={`${event.title}を${saved ? "保存から削除" : "保存"}`}
            aria-pressed={saved}
            type="button"
            onClick={onSave}
          >
            <Heart size={17} fill={saved ? "currentColor" : "none"} />
          </button>
        </div>
        <div className="event-card-body">
          <h3>{event.title}</h3>
          <p>{event.summary}</p>
          <div className="event-meta">
            <span>
              <CalendarDays size={14} /> {event.startAtLabel}
              {event.endAtLabel ? ` - ${event.endAtLabel}` : ""}
            </span>
            <span>
              <MapPin size={14} /> {event.location}
            </span>
            <span>
              <FileText size={14} /> {event.feeType ?? "無料"}
              {event.feeType === "有料" && event.feeAmount
                ? ` ${event.feeAmount.toLocaleString("ja-JP")}円`
                : ""}
            </span>
          </div>
          <div className="tag-row">
            {event.beginnerLevel && <span>{event.beginnerLevel}</span>}
            <span>{event.eventFormat ?? "現地"}</span>
            {event.tags.slice(0, 2).map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
            {event.tags.length > 2 && (
              <span
                className="tag-overflow-count"
                title={event.tags.slice(2).join("、")}
                aria-label={`ほか${event.tags.length - 2}件のタグ: ${event.tags
                  .slice(2)
                  .join("、")}`}
              >
                ほか{event.tags.length - 2}件
              </span>
            )}
          </div>
          <div className="event-card-foot">
            <span className="organizer">{event.organizationName}</span>
            <span className={applied ? "applied-label" : "capacity-label"}>
              {applied
                ? "申請済み"
                : `残り ${Math.max(Number(event.capacity ?? 0) - Number(event.applicantCount ?? 0), 0)}名`}
            </span>
          </div>
          <button
            className="event-detail-link"
            type="button"
            aria-label={`${event.title}の詳細を見る`}
            onClick={onOpen}
          >
            詳細を見る <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}

export function FeaturedEvent({
  event,
  label,
  saved,
  onSave,
  onOpen,
}: {
  event: AizuEvent;
  label: string;
  saved: boolean;
  onSave: () => void;
  onOpen: () => void;
}) {
  return (
    <article className="featured-event">
      <div>
        <img src={event.imageUrl} alt={`${event.title}の画像`} />
        <div className="featured-overlay" />
        <div className="featured-content">
          <span className="featured-label">{label}</span>
          <h3>{event.title}</h3>
          <p>
            <MapPin size={14} /> {event.location} · {event.startAtLabel}
          </p>
          <div className="featured-action">
            <button
              className="featured-detail-link"
              type="button"
              onClick={onOpen}
            >
              詳細を見る <ChevronRight size={15} />
            </button>
            <button
              className={`save-button ${saved ? "saved" : ""}`}
              title={saved ? "保存を解除" : "保存"}
              aria-label={`${event.title}を${saved ? "保存から削除" : "保存"}`}
              aria-pressed={saved}
              type="button"
              onClick={onSave}
            >
              <Heart size={17} fill={saved ? "currentColor" : "none"} />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
