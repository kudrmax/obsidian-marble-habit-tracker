import { LocalDate } from "../domain/LocalDate";
import { Box } from "./jar/JarPhysics";
import { CalendarDay, dayTitle, donePercent, monthOf } from "./today";

/** The strip with the grabber at the tray's top; the grabber's bottom edge is this far down. */
const GRIP = 14;
const GRABBER_BOTTOM = 10;
/** One week of the calendar: each date in a ring of how much of that day was done. */
export const WEEK_ROW = 54;
/** A date's line. */
const DATE = 24;
/** Folded, the dates sit this far under the grabber and as far over Obsidian's bar. */
const REST_GAP = 8;
/**
 * Over the weeks: room under the grabber, the month with Today's buttons on its line, then the weekdays. They come in,
 * weekdays first, once this week's row is whole.
 */
const HEAD = 74;
/** Room each side of the week grid; its columns share the rest. */
const GRID_PAD = 8;
/** The ring around each date. */
const RING = 34;
/** Room between the weeks and whatever of Obsidian covers the bottom of the view, once the tray is up. */
const BOTTOM_GAP = 8;
/** How high the folded tray stands over Obsidian's bar: the grabber, the dates and the room around them. */
const REST_HEIGHT = GRABBER_BOTTOM + REST_GAP + DATE + REST_GAP;
/** Folded, this week's row hangs this far below the calendar, so only its dates show; rising, the room under it grows back. */
const REST_LIFT = GRABBER_BOTTOM + REST_GAP + DATE / 2 + WEEK_ROW / 2 - (REST_HEIGHT - BOTTOM_GAP);
/** How far the tray rises before this week's row is whole. */
const ROW_WHOLE = WEEK_ROW + GRIP + BOTTOM_GAP - REST_HEIGHT;
/** The furthest the tray goes up, so the habits never go out of sight behind it. */
const MAX_UP = 360;
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
const SVG_NS = "http://www.w3.org/2000/svg";
/** The ring around a date, in its 36-unit box. */
const RING_RADIUS = 16;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3.4);

/**
 * Today's calendar, in a tray at the bottom of the view over Obsidian's navbar. Folded, it shows this week's dates;
 * pulled up, earlier weeks come in above them with how much of each day was done. Let go, it stays on the nearest whole
 * week. Its top edge is the floor the marbles stand on, wherever it is: rising, it carries them up and they hop off it.
 * Once it is all the way up, its weeks scroll back in time.
 */
export class CalendarTray {
	readonly tray: HTMLElement;
	private readonly grip: HTMLElement;
	/** The month and the weekdays over the weeks. */
	private readonly head: HTMLElement;
	private readonly month: HTMLElement;
	/** Today's buttons, on the month's line. */
	private readonly tools: HTMLElement;
	/** The weeks, oldest first; they scroll, and stay on the newest unless scrolled back. */
	private readonly weeks: HTMLElement;
	private shown: CalendarDay[][] = [];
	private today: LocalDate | null = null;
	/** How far in from the grid's sides its outer rings start, so the month and the buttons line up with them. */
	private edge = -1;
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
	/** Where the tray's top was last told to whoever stands on it. */
	private lastTop = Number.NaN;
	/** Moves of the tray are told only once it is built. */
	private ready = false;
	/** While the phone's keyboard is up the view is shorter for a moment; the tray stays where it was. */
	private held: () => boolean = () => false;
	private drag: { pointer: number; startY: number; startRaised: number; lastY: number; lastAt: number; speed: number; moving: boolean } | null = null;
	/** A drag that moved swallows the click it ends with, so it does not also pick a day. */
	private swallowClick = false;
	private settleFrame = 0;
	private readonly resizer: ResizeObserver;

	constructor(
		private readonly root: HTMLElement,
		private readonly onSnap: () => void,
		private readonly onMove: () => void,
	) {
		this.tray = root.createDiv("th-tray");
		this.grip = this.tray.createEl("button", { cls: "th-tray-grip", attr: { "aria-label": "Show earlier days" } });
		this.grip.createSpan("th-tray-grabber");
		this.calendar = this.tray.createDiv("th-cal");
		this.weeks = this.calendar.createDiv("th-cal-weeks");
		this.head = this.calendar.createDiv("th-cal-head");
		const line = this.head.createDiv("th-cal-line");
		this.month = line.createDiv("th-cal-month");
		this.tools = line.createDiv("th-cal-tools");
		const letters = this.head.createDiv("th-cal-weekdays");
		for (const letter of WEEKDAY_LETTERS) letters.createSpan({ text: letter });
		this.tray.addEventListener("pointerdown", this.pointerDown);
		window.addEventListener("pointermove", this.pointerMove);
		window.addEventListener("pointerup", this.pointerUp);
		window.addEventListener("pointercancel", this.pointerCancel);
		this.tray.addEventListener("click", this.clickAfterDrag, true);
		// A finger moving the tray moves only the tray: Obsidian's own gestures don't get it. Its taps still do, so
		// Obsidian can take the pressed look off a date when the finger lifts.
		this.tray.addEventListener("touchmove", (event) => {
			if (this.drag?.moving) event.stopPropagation();
		});
		this.weeks.addEventListener("scroll", this.scrolled, { passive: true });
		this.resizer = new ResizeObserver(() => this.placeRest());
		this.resizer.observe(root);
		this.place();
		this.ready = true;
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

	/** Puts Today's buttons on the month's line, in place of the ones there. */
	setTools(tools: HTMLElement): void {
		this.tools.empty();
		this.tools.appendChild(tools);
	}

	/** The tray keeps its place while `held` says so; call `refit` once it no longer holds. */
	holdWhile(held: () => boolean): void {
		this.held = held;
	}

	refit(): void {
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

	/** The tray where it is now, as the box the marbles stand on. */
	box(): Box {
		return { left: 0, top: this.restTop - this.raised, right: this.root.clientWidth, bottom: this.root.clientHeight, radius: CORNER };
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
		if (!off) this.renderRing(button, percent ?? 0);
		button.createSpan({ cls: "th-cal-date", text: String(day.date.day) });
		button.disabled = off;
		button.addEventListener("click", () => pick(day.date));
	}

	/** A ring around the date, drawn as far round as the day was done: a full ring for a day done in full. */
	private renderRing(button: HTMLElement, percent: number): void {
		const svg = button.appendChild(document.createElementNS(SVG_NS, "svg"));
		svg.setAttribute("class", "th-cal-ring");
		svg.setAttribute("viewBox", `0 0 ${RING} ${RING}`);
		svg.setAttribute("aria-hidden", "true");
		const circle = (cls: string) => {
			const element = svg.appendChild(document.createElementNS(SVG_NS, "circle"));
			element.setAttribute("class", cls);
			element.setAttribute("cx", String(RING / 2));
			element.setAttribute("cy", String(RING / 2));
			element.setAttribute("r", String(RING_RADIUS));
			return element;
		};
		circle("th-cal-ring-track");
		if (percent === 0) return;
		const arc = circle("th-cal-ring-arc");
		arc.setAttribute("stroke-dasharray", `${((RING_LENGTH * percent) / 100).toFixed(2)} ${RING_LENGTH.toFixed(2)}`);
		arc.setAttribute("transform", `rotate(-90 ${RING / 2} ${RING / 2})`);
	}

	/** The month most of the weeks in sight are in, over the calendar. */
	private nameMonths(): void {
		if (this.shown.length === 0 || !this.today) return;
		const { first, last } = this.visibleWeeks();
		this.month.setText(monthOf(this.shown.slice(first, last + 1), this.today));
	}

	/** Lines the month and the buttons up with the grid's outer rings, whatever the width. */
	private alignToGrid(): void {
		const column = parseFloat(getComputedStyle(this.root).getPropertyValue("--th-column")) || Infinity;
		const width = Math.min(this.calendar.clientWidth, column);
		const edge = Math.round(GRID_PAD + ((width - 2 * GRID_PAD) / WEEKDAY_LETTERS.length - RING) / 2);
		if (width === 0 || edge === this.edge) return;
		this.edge = edge;
		this.tray.style.setProperty("--th-cal-edge", `${edge}px`);
	}

	/** The weeks in sight, as indexes into the weeks, oldest first. */
	private visibleWeeks(): { first: number; last: number } {
		const hidden = Math.max(0, this.weeks.scrollHeight - this.rows * WEEK_ROW);
		const top = Math.max(0, this.weeks.scrollTop - hidden);
		const first = Math.min(this.rows - 1, Math.floor(top / WEEK_ROW));
		const last = Math.max(first, Math.ceil((top + this.weeks.clientHeight - hidden) / WEEK_ROW) - 1);
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
		this.today = today;
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
		return Math.min(MAX_UP, ROW_WHOLE + HEAD + (this.rows - 1) * WEEK_ROW);
	}

	/** Places the tray again after the view or Obsidian's bars changed. */
	private placeRest(): void {
		if (this.held()) return;
		this.place();
	}

	private place(): void {
		const height = this.root.clientHeight;
		const restTop = height - this.inset - REST_HEIGHT;
		this.restTop = restTop;
		const top = restTop - this.raised;
		this.root.style.setProperty("--th-tray-top", `${top}px`);
		if (this.ready && top !== this.lastTop) this.onMove();
		this.lastTop = top;
		this.root.style.setProperty("--th-tray-rest", `${height - restTop}px`);
		this.root.style.setProperty("--th-tray-inset", `${this.inset + BOTTOM_GAP}px`);
		const raised = Math.max(0, this.raised);
		// Rising, the room under this week's row grows back first and the row becomes whole while its rings come in; then
		// the head opens over it, so it never lies over a week; the earlier weeks get the rest.
		this.tray.style.setProperty("--th-detail", String(clamp(raised / ROW_WHOLE)));
		this.tray.style.setProperty("--th-head-height", `${Math.min(HEAD, Math.max(0, raised - ROW_WHOLE))}px`);
		this.tray.style.setProperty("--th-open", String(clamp(raised / SHADOW_FADE)));
		this.alignToGrid();
		// Folded, this week's row hangs low so only its dates show; pushed below its rest, the tray takes them down with it.
		this.tray.style.setProperty("--th-lift", `${Math.max(0, REST_LIFT - this.raised)}px`);
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
		const onWeeks = this.weeks.contains(event.target as Node);
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

	/**
	 * A flick down folds the tray, a flick up opens it all the way; otherwise it stays about where it was let go, on the
	 * nearest whole week, so no week is left cut in half under the head.
	 */
	private letGo(speed: number): void {
		if (speed > FLICK) this.settle(0);
		else if (speed < -FLICK) this.settle(this.maxUp());
		else this.settle(this.nearestStop(this.raised));
	}

	/** Folded, the head over this week, or the head over one more whole week each time, up to all the way. */
	private nearestStop(raised: number): number {
		const stops = [0, this.maxUp()];
		for (let week = 0; ROW_WHOLE + HEAD + week * WEEK_ROW < this.maxUp(); week++) stops.push(ROW_WHOLE + HEAD + week * WEEK_ROW);
		return stops.reduce((best, stop) => (Math.abs(stop - raised) < Math.abs(best - raised) ? stop : best));
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
