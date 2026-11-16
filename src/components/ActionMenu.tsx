import { Ellipsis } from "lucide-react";
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export function ActionMenu({
  label,
  actions,
}: {
  label: string;
  actions: {
    label: string;
    accessibleLabel?: string;
    icon: ReactNode;
    danger?: boolean;
    onSelect: () => void;
  }[];
}) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const lastInitially = useRef(false);
  const [open, setOpen] = useState(false);
  const close = (restoreFocus = false) => {
    if (restoreFocus) triggerRef.current?.focus();
    setOpen(false);
  };
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const updatePosition = () => {
      const bounds = trigger.getBoundingClientRect();
      const size = menu.getBoundingClientRect();
      const boundary = trigger
        .closest("[data-menu-boundary]")
        ?.getBoundingClientRect();
      const bottom = Math.min(
        innerHeight - 8,
        boundary?.bottom ?? innerHeight - 8,
      );
      const top = Math.max(8, boundary?.top ?? 8);
      const position = {
        left: Math.max(
          8,
          Math.min(bounds.right - size.width, innerWidth - size.width - 8),
        ),
        top: Math.max(
          top,
          bounds.bottom + size.height + 4 <= bottom
            ? bounds.bottom + 4
            : bounds.top - size.height - 4,
        ),
      };
      menu.style.left = `${position.left}px`;
      menu.style.top = `${position.top}px`;
    };
    updatePosition();
    const items = menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    items[lastInitially.current ? items.length - 1 : 0]?.focus({
      preventScroll: true,
    });
    const dismiss = (event: Event) => {
      if (
        event.target instanceof Node &&
        (menu.contains(event.target) || trigger.contains(event.target))
      )
        return;
      setOpen(false);
    };
    const resize = () => {
      setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", resize);
    };
  }, [open]);
  return (
    <>
      <button
        ref={triggerRef}
        className="chat-message-actions-trigger"
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          lastInitially.current = false;
          if (open) close();
          else setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          lastInitially.current = event.key === "ArrowUp";
          setOpen(true);
        }}
      >
        <Ellipsis size={18} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={id}
            role="menu"
            aria-label={label}
            className="message-actions-menu"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                close(true);
                return;
              }
              if (event.key === "Tab") {
                close(true);
                return;
              }
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
                return;
              event.preventDefault();
              const items = [
                ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  '[role="menuitem"]',
                ),
              ];
              const current = items.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? items.length - 1
                    : (current +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        items.length) %
                      items.length;
              items[next]?.focus();
            }}
          >
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                aria-label={action.accessibleLabel}
                className={action.danger ? "danger-text" : undefined}
                onClick={() => {
                  close(true);
                  action.onSelect();
                }}
              >
                {action.icon}
                {action.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
