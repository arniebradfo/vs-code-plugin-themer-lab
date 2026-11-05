import { iconMarkup } from "./icons";

export function infoMarkup(id: string, label: string, content: string): string {
  return `<span class="info-control">
    <button class="icon-button info-button" type="button" popovertarget="${id}"
      aria-label="About ${label}" aria-describedby="${id}" aria-expanded="false">${iconMarkup("info")}</button>
    <span id="${id}" class="info-popover" popover role="tooltip">${content}</span>
  </span>`;
}

export function initializePopovers(root: HTMLElement): () => void {
  const refreshers: (() => void)[] = [];
  for (const trigger of root.querySelectorAll<HTMLButtonElement>("button[popovertarget]")) {
    const id = trigger.getAttribute("popovertarget");
    const popover = id ? document.getElementById(id) : null;
    if (!popover) throw new Error(`Missing Themer Lab popover: ${id}.`);
    let pinned = false;
    let closeTimer: number | undefined;
    const isOpen = () => popover.matches(":popover-open");
    const clearTimer = () => {
      window.clearTimeout(closeTimer);
      closeTimer = undefined;
    };
    const hide = () => {
      clearTimer();
      pinned = false;
      if (isOpen()) popover.hidePopover();
      trigger.setAttribute("aria-expanded", "false");
    };
    const position = () => {
      const anchor = trigger.getBoundingClientRect();
      const box = popover.getBoundingClientRect();
      const width = document.documentElement.clientWidth;
      const height = document.documentElement.clientHeight;
      const left = popover.classList.contains("action-menu") ? anchor.right - box.width : anchor.left;
      const top = anchor.bottom + 6 + box.height <= height - 8
        ? anchor.bottom + 6 : anchor.top - box.height - 6;
      popover.style.left = `${Math.max(8, Math.min(left, width - box.width - 8))}px`;
      popover.style.top = `${Math.max(8, Math.min(top, height - box.height - 8))}px`;
    };
    const show = () => {
      clearTimer();
      if (trigger.matches(":disabled")) return;
      if (!isOpen()) popover.showPopover();
      trigger.setAttribute("aria-expanded", "true");
      position();
    };
    popover.addEventListener("toggle", () => {
      const open = isOpen();
      trigger.setAttribute("aria-expanded", String(open));
      if (open) {
        position();
      } else {
        pinned = false;
        clearTimer();
      }
    });
    if (trigger.classList.contains("info-button")) {
      const scheduleClose = () => {
        clearTimer();
        if (!pinned && document.activeElement !== trigger) closeTimer = window.setTimeout(hide, 150);
      };
      trigger.addEventListener("pointerenter", (event) => {
        if (event.pointerType !== "touch") show();
      });
      trigger.addEventListener("pointerleave", scheduleClose);
      trigger.addEventListener("focus", show);
      trigger.addEventListener("blur", scheduleClose);
      trigger.addEventListener("click", (event) => {
        event.preventDefault();
        if (pinned && isOpen()) {
          hide();
        } else {
          show();
          pinned = true;
        }
      });
      popover.addEventListener("pointerenter", clearTimer);
      popover.addEventListener("pointerleave", scheduleClose);
    } else {
      for (const button of popover.querySelectorAll("button")) button.addEventListener("click", hide);
    }
    refreshers.push(() => {
      if (!isOpen()) return;
      const anchor = trigger.getBoundingClientRect();
      if (trigger.matches(":disabled") || !trigger.checkVisibility() ||
          anchor.bottom <= 0 || anchor.top >= document.documentElement.clientHeight) {
        hide();
      } else {
        position();
      }
    });
  }
  const refresh = () => { for (const update of refreshers) update(); };
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const popover = root.querySelector<HTMLElement>("[popover]:popover-open");
    if (!popover) return;
    const restoreFocus = popover.contains(document.activeElement);
    const trigger = root.querySelector<HTMLButtonElement>(`button[popovertarget="${popover.id}"]`);
    event.preventDefault();
    popover.hidePopover();
    trigger?.setAttribute("aria-expanded", "false");
    if (restoreFocus) trigger?.focus();
  });
  for (const details of root.querySelectorAll("details")) details.addEventListener("toggle", refresh);
  window.addEventListener("resize", refresh);
  window.addEventListener("scroll", refresh, { capture: true, passive: true });
  return refresh;
}
