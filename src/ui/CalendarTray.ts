import { LocalDate } from "../domain/LocalDate";
import { Box } from "./jar/JarPhysics";
import { CalendarDay, dayTitle, donePercent, monthsOf } from "./today";

/** The strip with the grabber at the tray's top. */
const GRIP = 14;
/** One week of the calendar: the dates, and the percents under them once the tray is pulled up. */
export const WEEK_ROW = 52;
/** The month and the weekdays over the weeks. */
const HEAD = 40;
/** Room between the calendar and whatever of Obsidian covers the bottom of the view. */
const BOTTOM_GAP = 8;
/** The furthest the tray goes up, so the habits never go out of sight behind it. */
const MAX_UP = 360;
/** How far the tray rises before the percents have fully come in. */
const PERCENT_FADE = 24;
/** The head comes in once it has room above the newest week, over this distance. */
const HEAD_FADE = 24;
/** How far the tray rises before its shadow is at full strength. */
const SHADOW_FADE = 60;
/** The rounded corners of the tray's top edge, which the marbles roll along. */
const CORNER = 24;
/** A finger has to move this far before it is clear whether it moves the tray or taps a day. */
const SLOP = 6;
/** A flick faster than this, in px per ms, carries the tray all the way up, or all the way down. */
const FLICK = 0.45;
/** Past its top the tray follows the finger at this fraction, like iOS rubber-banding; past its bottom, less. */
const RUBBER = 0.35;
const RUBBER_LOW = 0.15;
const SETTLE_MS = 420;
/** The weekdays over the calendar, Monday first. */
const WEEKDAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3.4);

/**
 * Today's calendar, in a tray at the bottom of the view over Obsidian's navbar. Folded, it shows this week's dates;
 * pulled up, earlier weeks come in above them with how much of each day was done. It stays wherever it is let go, and
 * its top edge at rest is the floor the marbles stand on. Once it is all the way up, its weeks scroll back in time.
 */
export class CalendarTray {
	readonly tray: HTMLElement;
	private readonly grip: HTMLElement;
	/** The month and the weekdays over the weeks. */
	private readonly head: HTMLElement;
	private readonly month: HTMLElement;
	/** The weeks, oldest first; they scroll, and stay on the newest unless scrolled back. */
	private readonly weeks: HTMLElement;
	private shown: CalendarDay[][] = [];
	private readonly calendar: HTMLElement;
	/** How much of the view's bottom Obsidian's bars cover. */
	private inset = 0;
	private rows = 1;
	/** How far above its rest the tray is. */
	private raised = 0;
	private hidden = false;
	/** Whether the weeks stay scrolled to the newest. */
	private pinned = true;
	private restTop = 0;
	private drag: { pointer: number; startY: number; startRaised: number; lastY: number; lastAt: number; speed: number; moving: boolean } | null = null;
	/** A drag that moved swallows the click it ends with, so it does not also pick a day. */
	private swallowClick = false;
	private settleFrame = 0;
	private readonly resizer: ResizeObserver;

	constructor(
		private readonly root: HTMLElement,
		private readonly onSnap: () => void,
		private readonly onRest: () => void,
	) {
		this.tray = root.createDiv("th-tray");
		this.grip = this.tray.createEl("button", { cls: "th-tray-grip", attr: { "aria-label": "Show earlier days" } });
		this.grip.createSpan("th-tray-grabber");
		this.calendar = this.tray.createDiv("th-cal");
		this.weeks = this.calendar.createDiv("th-cal-weeks");
		this.head = this.calendar.createDiv("th-cal-head");
		this.month = this.head.createDiv("th-cal-month");
		const letters = this.head.createDiv("th-cal-weekdays");
		for (const letter of WEEKDAY_LETTERS) letters.createSpan({ text: letter });
		this.tray.addEventListener("pointerdown", this.pointerDown);
		window.addEventListener("pointermove", this.pointerMove);
		window.addEventListener("pointerup", this.pointerUp);
		window.addEventListener("pointercancel", this.pointerCancel);
		this.tray.addEventListener("click", this.clickAfterDrag, true);
		// Obsidian has its own gestures on the screen's edges; a move on the tray is the tray's.
		for (const type of ["touchstart", "touchmove", "touchend"] as const) this.tray.addEventListener(type, (event) => event.stopPropagation());
		this.weeks.addEventListener("scroll", this.scrolled, { passive: true });
		this.resizer = new ResizeObserver(() => this.placeRest());
		this.resizer.observe(root);
		this.place();
	}

	destroy(): void {
		this.resizer.disconnect();
		cancelAnimationFrame(this.settleFrame);
		window.removeEventListener("pointermove", this.pointerMove);
		window.removeEventListener("pointerup", this.pointerUp);
		window.removeEventListener("pointercancel", this.pointerCancel);
	}

	/** How much of the view's bottom Obsidian's navbar or status bar covers; the calendar sits above it. */
	setInset(inset: number): void {
		if (inset === this.inset) return;
		this.inset = inset;
		this.placeRest();
	}

	/** All habits has no calendar: the tray folds down and keeps only its floor. */
	setHidden(hidden: boolean): void {
		this.hidden = hidden;
		this.tray.toggleClass("is-hidden", hidden);
		if (hidden) this.settle(0);
	}

	snap(open: boolean): void {
		this.settle(open ? this.maxUp() : 0);
	}

	/** The tray at rest, as the box the marbles stand on. */
	restBox(): Box {
		return { left: 0, top: this.restTop, right: this.root.clientWidth, bottom: this.root.clientHeight, radius: CORNER };
	}

	private renderDay(row: HTMLElement, day: CalendarDay, selected: boolean, today: LocalDate, pick: (day: LocalDate) => void): void {
		const off = day.future || day.outside;
		const percent = off ? null : donePercent(day);
		const title = dayTitle(day.date, today);
		const button = row.createEl("button", { cls: "th-cal-day", attr: { "aria-label": percent === null ? title : `${title}, ${percent}% done`, "aria-pressed": String(selected) } });
		button.toggleClass("is-selected", selected);
		button.toggleClass("is-today", day.date.equals(today));
		button.toggleClass("is-off", off);
		button.toggleClass("is-full", percent === 100);
		button.createSpan({ cls: "th-cal-date", text: String(day.date.day) });
		button.createSpan({ cls: "th-cal-percent", text: percent === null ? "" : `${percent}%` });
		button.disabled = off;
		button.addEventListener("click", () => pick(day.date));
	}

	/** The month, or months, of the weeks in sight, over the calendar. */
	private nameMonths(): void {
		if (this.shown.length === 0) return;
		const { first, last } = this.visibleWeeks();
		this.month.setText(monthsOf(this.shown.slice(first, last + 1)));
	}

	/** The weeks in sight, as indexes into the weeks, oldest first. */
	private visibleWeeks(): { first: number; last: number } {
		const top = this.weeks.scrollTop + HEAD;
		const bottom = this.weeks.scrollTop + this.weeks.clientHeight;
		const first = Math.max(0, Math.floor((top - HEAD) / WEEK_ROW));
		const last = Math.max(first, Math.ceil((bottom - HEAD) / WEEK_ROW) - 1);
		return { first, last: Math.min(last, this.rows - 1) };
	}

	/**
	 * Draws the weeks, the newest at the bottom, each date with how much of that day was done under it. The shown day is
	 * picked; the days to come and the ones before the calendar can't be. The weeks stay where they were scrolled.
	 */
	show(weeks: CalendarDay[][], shown: LocalDate, today: LocalDate, pick: (day: LocalDate) => void): void {
		const first = this.shown.length === 0;
		const scrolled = this.weeks.scrollTop;
		this.shown = weeks;
		this.weeks.empty();
		const list = this.weeks.createDiv("th-cal-list");
		for (const week of weeks) {
			const row = list.createDiv("th-cal-week");
			for (const day of week) this.renderDay(row, day, day.date.equals(shown), today, pick);
		}
		this.rows = Math.max(1, weeks.length);
		this.raised = Math.min(this.raised, this.maxUp());
		if (first) this.pinned = true;
		this.place();
		if (!this.pinned) this.weeks.scrollTop = scrolled;
	}

	private maxUp(): number {
		return Math.min(MAX_UP, HEAD + (this.rows - 1) * WEEK_ROW);
	}

	/** Places the tray again after the view or Obsidian's bars changed, and says so when its rest moved. */
	private placeRest(): void {
		const before = this.restTop;
		this.place();
		if (this.restTop !== before) this.onRest();
	}

	private place(): void {
		const height = this.root.clientHeight;
		const restTop = height - this.inset - BOTTOM_GAP - WEEK_ROW - GRIP;
		this.restTop = restTop;
		const top = restTop - this.raised;
		this.root.style.setProperty("--th-tray-top", `${top}px`);
		this.root.style.setProperty("--th-tray-rest", `${height - restTop}px`);
		this.root.style.setProperty("--th-tray-inset", `${this.inset + BOTTOM_GAP}px`);
		const raised = Math.max(0, this.raised);
		this.tray.style.setProperty("--th-percent", String(clamp(raised / PERCENT_FADE)));
		const head = clamp((raised - HEAD + HEAD_FADE / 2) / HEAD_FADE);
		this.tray.style.setProperty("--th-head", String(head));
		this.head.toggleClass("is-shown", head > 0.5);
		this.tray.style.setProperty("--th-open", String(clamp(raised / SHADOW_FADE)));
		const full = this.raised >= this.maxUp() - 1;
		this.weeks.toggleClass("is-scrollable", full);
		this.grip.setAttribute("aria-label", this.raised > 1 ? "Hide earlier days" : "Show earlier days");
		if (this.pinned) this.weeks.scrollTop = this.weeks.scrollHeight;
		this.nameMonths();
	}

	private readonly scrolled = () => {
		this.pinned = this.weeks.scrollHeight - this.weeks.scrollTop - this.weeks.clientHeight < 2;
		this.nameMonths();
	};

	/** Where the finger puts the tray, giving way less and less past either end of its range. */
	private bounded(raised: number): number {
		const max = this.maxUp();
		if (raised > max) return max + (raised - max) * RUBBER;
		if (raised < 0) return raised * RUBBER_LOW;
		return raised;
	}

	private readonly pointerDown = (event: PointerEvent) => {
		if (this.hidden || event.button !== 0) return;
		// All the way up, the weeks scroll under a finger instead; the grip and the head still move the tray.
		const onWeeks = this.weeks.contains(event.target as Node) && !this.head.contains(event.target as Node);
		if (onWeeks && this.weeks.hasClass("is-scrollable") && event.pointerType !== "mouse") return;
		cancelAnimationFrame(this.settleFrame);
		this.drag = { pointer: event.pointerId, startY: event.clientY, startRaised: this.raised, lastY: event.clientY, lastAt: event.timeStamp, speed: 0, moving: false };
	};

	private readonly pointerMove = (event: PointerEvent) => {
		const drag = this.drag;
		if (!drag || event.pointerId !== drag.pointer) return;
		const dy = event.clientY - drag.startY;
		if (!drag.moving) {
			if (Math.abs(dy) < SLOP) return;
			drag.moving = true;
			this.tray.addClass("is-dragging");
		}
		drag.speed = (event.clientY - drag.lastY) / Math.max(1, event.timeStamp - drag.lastAt);
		drag.lastY = event.clientY;
		drag.lastAt = event.timeStamp;
		this.raised = this.bounded(drag.startRaised - dy);
		this.place();
	};

	private readonly pointerUp = (event: PointerEvent) => this.release(event, false);

	private readonly pointerCancel = (event: PointerEvent) => this.release(event, true);

	private release(event: PointerEvent, cancelled: boolean): void {
		const drag = this.drag;
		if (!drag || event.pointerId !== drag.pointer) return;
		this.drag = null;
		this.tray.removeClass("is-dragging");
		if (!drag.moving) {
			if (!cancelled && this.grip.contains(event.target as Node)) this.snap(this.raised <= 1);
			return;
		}
		this.swallowClick = true;
		window.setTimeout(() => (this.swallowClick = false), 0);
		this.letGo(cancelled ? 0 : drag.speed);
	}

	private readonly clickAfterDrag = (event: MouseEvent) => {
		if (!this.swallowClick) return;
		this.swallowClick = false;
		event.stopPropagation();
		event.preventDefault();
	};

	/** A flick down folds the tray, a flick up opens it all the way; otherwise it stays where it was let go. */
	private letGo(speed: number): void {
		if (speed > FLICK) this.settle(0);
		else if (speed < -FLICK) this.settle(this.maxUp());
		else this.settle(this.raised);
	}

	/** Moves the tray to `target` above its rest, within its range, on iOS's settling curve, and taps when it opens or folds. */
	private settle(target: number): void {
		cancelAnimationFrame(this.settleFrame);
		const to = Math.min(this.maxUp(), Math.max(0, target));
		if ((to > 1) !== (this.raised > 1)) this.onSnap();
		const from = this.raised;
		const start = performance.now();
		const step = (now: number) => {
			const t = Math.min(1, (now - start) / SETTLE_MS);
			this.raised = from + (to - from) * easeOut(t);
			this.place();
			if (t < 1) this.settleFrame = requestAnimationFrame(step);
		};
		this.settleFrame = requestAnimationFrame(step);
	}
}
