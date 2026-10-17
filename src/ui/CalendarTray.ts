import { LocalDate } from "../domain/LocalDate";
import { Box } from "./jar/JarPhysics";
import { CalendarDay, CalendarMonth, StripDay, calendarMonths, dayTitle, donePercent, monthTitle, monthWeeks } from "./today";

/** The strip with the grabber at the tray's top. */
const GRIP = 14;
/** One week of the calendar: each date in a ring of how much of that day was done. */
export const WEEK_ROW = 54;
/** Over the weeks: room under the grabber, then one line with the month, its arrows and Today's buttons. */
const HEAD = 56;
/** Room each side of the week grid; its columns share the rest. */
const GRID_PAD = 8;
/** The ring around each date, with room inside for two figures and the shown day's disc. */
const RING = 40;
const WEEK_DAYS = 7;
/** Room between the weeks and whatever of Obsidian covers the bottom of the view, once the tray is up. */
const BOTTOM_GAP = 8;
/** How high the folded tray stands over Obsidian's bar. Its dates sit in the middle, as far from its edge as from the bar. */
const REST_HEIGHT = 66;
/** Folded, this week's row hangs this far below the calendar, so its dates sit in the middle of the tray; rising, the room under it grows back. */
const REST_LIFT = WEEK_ROW / 2 + BOTTOM_GAP - REST_HEIGHT / 2;
/** The figures the dates are written in, to see where their ink sits in their line. */
const FIGURES = "0123456789";
/** How far the tray rises before this week's row is whole. */
const ROW_WHOLE = WEEK_ROW + GRIP + BOTTOM_GAP - REST_HEIGHT;
/** How far the tray rises while the rings draw themselves round: up to its first stop, with the head open. */
const RINGS_DRAWN = ROW_WHOLE + HEAD;
/** The furthest the tray goes up: enough for a month of six weeks. */
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
const SVG_NS = "http://www.w3.org/2000/svg";
/** The ring around a date, in its own box. */
const RING_RADIUS = 19;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** A date's ring: its track all the way round, and the part of it the day was done, if any. */
interface Ring {
	readonly track: SVGCircleElement;
	readonly done: SVGCircleElement | null;
	readonly share: number;
}
const CHEVRON_LEFT = "m15 18-6-6 6-6";
const CHEVRON_RIGHT = "m9 18 6-6-6-6";

const fontOf = (element: HTMLElement) => {
	const style = getComputedStyle(element);
	return `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
};
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3.4);

/**
 * Today's calendar, in a tray at the bottom of the view over Obsidian's navbar. Folded, it shows this week's dates;
 * pulled up, the rest of the month comes in above them, each date in a ring of how much of that day was done, under a
 * line with the month, arrows to the months before and Today's buttons. Let go, it stays on the nearest whole week. Its
 * top edge is the floor the marbles stand on, wherever it is: rising, it carries them up and they hop off it.
 */
export class CalendarTray {
	readonly tray: HTMLElement;
	private readonly grip: HTMLElement;
	private readonly calendar: HTMLElement;
	private readonly head: HTMLElement;
	private readonly line: HTMLElement;
	private readonly title: HTMLElement;
	private readonly previous: HTMLButtonElement;
	private readonly next: HTMLButtonElement;
	/** Today's buttons, on the month's line. */
	private readonly tools: HTMLElement;
	private readonly weeks: HTMLElement;
	private days: readonly StripDay[] = [];
	private months: CalendarMonth[] = [];
	/** The month on show, as an index into `months`; folded, it is always this month. */
	private monthIndex = -1;
	private shownDay: LocalDate | null = null;
	private today: LocalDate | null = null;
	private pick: (day: LocalDate) => void = () => undefined;
	/** How far in from the grid's sides its outer rings start, so the month and the buttons line up with them. */
	private edge = -1;
	/** The font the dates were last measured in, down. */
	private figureFont = "";
	private figureContext: CanvasRenderingContext2D | null = null;
	/** How far across each date moves to the middle of its circle, by its font and figures. */
	private readonly figureShifts = new Map<string, number>();
	/** How much of the view's bottom Obsidian's bars cover. */
	private inset = 0;
	private rows = 1;
	private rings: Ring[] = [];
	/** How far round the rings were last drawn. */
	private drawn = -1;
	/** How far above its rest the tray is. */
	private raised = 0;
	private hidden = false;
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
		this.grip = this.tray.createEl("button", { cls: "th-tray-grip", attr: { "aria-label": "Show the month" } });
		this.grip.createSpan("th-tray-grabber");
		this.calendar = this.tray.createDiv("th-cal");
		this.weeks = this.calendar.createDiv("th-cal-weeks");
		this.head = this.calendar.createDiv("th-cal-head");
		this.line = this.head.createDiv("th-cal-line");
		const line = this.line;
		this.title = line.createDiv("th-cal-month");
		this.previous = this.arrow(line, "Previous month", CHEVRON_LEFT, -1);
		this.next = this.arrow(line, "Next month", CHEVRON_RIGHT, 1);
		this.tools = line.createDiv("th-cal-tools");
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
		this.fitTitle();
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
		else this.fitTitle();
	}

	snap(open: boolean): void {
		this.settle(open ? this.maxUp() : 0);
	}

	/** The tray where it is now, as the box the marbles stand on. */
	box(): Box {
		return { left: 0, top: this.restTop - this.raised, right: this.root.clientWidth, bottom: this.root.clientHeight, radius: CORNER };
	}

	/**
	 * Takes the calendar's days and draws the month on show: this month unless an earlier one was opened with the arrows.
	 * The shown day is picked; a tap on another day picks it.
	 */
	show(days: readonly StripDay[], shown: LocalDate, today: LocalDate, pick: (day: LocalDate) => void): void {
		this.days = days;
		this.shownDay = shown;
		this.today = today;
		this.pick = pick;
		this.months = calendarMonths(days, today);
		if (this.monthIndex < 0 || this.monthIndex >= this.months.length) this.monthIndex = this.months.length - 1;
		this.renderMonth();
	}

	private arrow(line: HTMLElement, label: string, path: string, step: number): HTMLButtonElement {
		const button = line.createEl("button", { cls: "th-cal-arrow", attr: { "aria-label": label } });
		const svg = button.appendChild(document.createElementNS(SVG_NS, "svg"));
		svg.setAttribute("viewBox", "0 0 24 24");
		svg.setAttribute("aria-hidden", "true");
		const stroke = svg.appendChild(document.createElementNS(SVG_NS, "path"));
		stroke.setAttribute("d", path);
		button.addEventListener("click", () => this.turn(step));
		return button;
	}

	/** Opens the month before or after the one on show, all of it. */
	private turn(step: number): void {
		const index = Math.min(this.months.length - 1, Math.max(0, this.monthIndex + step));
		if (index === this.monthIndex) return;
		this.monthIndex = index;
		this.renderMonth();
		this.settle(this.maxUp());
	}

	private renderMonth(): void {
		const month = this.months[this.monthIndex];
		const today = this.today;
		if (!month || !today) return;
		const weeks = monthWeeks(this.days, month, today);
		this.weeks.empty();
		this.rings = [];
		this.drawn = -1;
		const list = this.weeks.createDiv("th-cal-list");
		for (const week of weeks) {
			const row = list.createDiv("th-cal-week");
			for (const day of week) this.renderDay(row, day, this.shownDay?.equals(day.date) ?? false, today);
		}
		this.fitTitle();
		this.previous.disabled = this.monthIndex === 0;
		this.next.disabled = this.monthIndex === this.months.length - 1;
		this.rows = Math.max(1, weeks.length);
		this.raised = Math.min(this.raised, this.maxUp());
		this.centerFigures();
		this.place();
	}

	/** The month's whole name, or its short one when the whole one leaves the buttons no room on its line. */
	private fitTitle(): void {
		const month = this.months[this.monthIndex];
		const today = this.today;
		if (!month || !today) return;
		this.title.setText(monthTitle(month, today));
		if (this.line.scrollWidth > this.line.clientWidth) this.title.setText(monthTitle(month, today, "short"));
	}

	/**
	 * A font's figures need not sit in the middle of their box: they can sit high or low in their line, and a narrow 1
	 * leaves a date off to one side. This finds where their ink is, in whatever font the dates are in, and moves each date
	 * to the middle of its circle.
	 */
	private centerFigures(): void {
		const figures = Array.from(this.weeks.querySelectorAll<HTMLElement>(".th-cal-figure"));
		this.figureContext ??= document.createElement("canvas").getContext("2d");
		const context = this.figureContext;
		if (!context || !figures[0]) return;
		this.centerDown(figures[0], context);
		for (const figure of figures) figure.style.left = `${this.shiftAcross(figure, context).toFixed(2)}px`;
	}

	/** Moves the dates down, or up, to put the ink of their figures in the middle of their line. */
	private centerDown(sample: HTMLElement, context: CanvasRenderingContext2D): void {
		const font = fontOf(sample);
		const line = sample.getBoundingClientRect();
		if (font === this.figureFont || line.height === 0) return;
		this.figureFont = font;
		context.font = font;
		const ink = context.measureText(FIGURES);
		const probe = sample.createSpan("th-cal-baseline");
		const baseline = probe.getBoundingClientRect().top - line.top;
		probe.remove();
		const inkMiddle = baseline + (ink.actualBoundingBoxDescent - ink.actualBoundingBoxAscent) / 2;
		this.tray.style.setProperty("--th-figure-shift", `${(line.height / 2 - inkMiddle).toFixed(2)}px`);
	}

	/** How far a date moves across to put the ink of its figures in the middle of its box. */
	private shiftAcross(figure: HTMLElement, context: CanvasRenderingContext2D): number {
		const font = fontOf(figure);
		const text = figure.textContent ?? "";
		const key = `${font}|${text}`;
		const known = this.figureShifts.get(key);
		if (known !== undefined) return known;
		context.font = font;
		context.textAlign = "center";
		const ink = context.measureText(text);
		const shift = (ink.actualBoundingBoxLeft - ink.actualBoundingBoxRight) / 2;
		this.figureShifts.set(key, shift);
		return shift;
	}

	private renderDay(row: HTMLElement, day: CalendarDay, selected: boolean, today: LocalDate): void {
		const off = day.future || day.outside;
		const percent = off ? null : donePercent(day);
		const title = dayTitle(day.date, today);
		const button = row.createEl("button", { cls: "th-cal-day", attr: { "aria-label": percent === null ? title : `${title}, ${percent}% done`, "aria-pressed": String(selected) } });
		button.toggleClass("is-selected", selected);
		button.toggleClass("is-today", day.date.equals(today));
		button.toggleClass("is-off", off);
		if (!off) this.renderRing(button, percent ?? 0);
		button.createSpan("th-cal-date").createSpan({ cls: "th-cal-figure", text: String(day.date.day) });
		button.disabled = off;
		button.addEventListener("click", () => this.pick(day.date));
	}

	/** A ring around the date, its accent part as far round as the day was done: all of it for a day done in full. */
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
			element.setAttribute("transform", `rotate(-90 ${RING / 2} ${RING / 2})`);
			return element;
		};
		const track = circle("th-cal-ring-track");
		this.rings.push({ track, done: percent === 0 ? null : circle("th-cal-ring-arc"), share: percent / 100 });
	}

	/**
	 * Draws every ring from its top, clockwise, as far round as `round` says, from none to all the way; the part the day
	 * was done grows with it, so each ring comes in drawing itself rather than fading in.
	 */
	private drawRings(round: number): void {
		if (round === this.drawn) return;
		this.drawn = round;
		for (const ring of this.rings) {
			this.drawArc(ring.track, round);
			if (ring.done) this.drawArc(ring.done, round * ring.share);
		}
	}

	private drawArc(circle: SVGCircleElement, share: number): void {
		circle.setAttribute("stroke-dasharray", `${(RING_LENGTH * share).toFixed(2)} ${RING_LENGTH.toFixed(2)}`);
		circle.style.visibility = share > 0 ? "" : "hidden";
	}

	/** Lines the month and the buttons up with the grid's outer rings, whatever the width. */
	private alignToGrid(): void {
		const column = parseFloat(getComputedStyle(this.root).getPropertyValue("--th-column")) || Infinity;
		const width = Math.min(this.calendar.clientWidth, column);
		const edge = Math.round(GRID_PAD + ((width - 2 * GRID_PAD) / WEEK_DAYS - RING) / 2);
		if (width === 0 || edge === this.edge) return;
		this.edge = edge;
		this.tray.style.setProperty("--th-cal-edge", `${edge}px`);
		this.fitTitle();
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
		// Rising, the room under this week's row grows back first and the row becomes whole; then the head opens over it, so
		// it never lies over a week; the earlier weeks get the rest. All the while, up to the first stop, the rings draw round.
		this.drawRings(clamp(raised / RINGS_DRAWN));
		this.tray.style.setProperty("--th-head-height", `${Math.min(HEAD, Math.max(0, raised - ROW_WHOLE))}px`);
		this.tray.style.setProperty("--th-open", String(clamp(raised / SHADOW_FADE)));
		// Folded, this week's row hangs low so only its dates show; pushed below its rest, the tray takes them down with it.
		this.tray.style.setProperty("--th-lift", `${Math.max(0, REST_LIFT - this.raised)}px`);
		this.alignToGrid();
		this.grip.setAttribute("aria-label", this.raised > 1 ? "Hide the month" : "Show the month");
	}

	/** Where the finger puts the tray, giving way less and less past either end of its range. */
	private bounded(raised: number): number {
		const max = this.maxUp();
		if (raised > max) return max + (raised - max) * RUBBER;
		if (raised < 0) return raised * RUBBER_LOW;
		return raised;
	}

	private readonly pointerDown = (event: PointerEvent) => {
		if (this.hidden || event.button !== 0) return;
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

	/**
	 * Moves the tray to `target` above its rest, within its range, on iOS's settling curve, and taps when it opens or
	 * folds. Folding goes back to this month, so the folded tray always shows this week.
	 */
	private settle(target: number): void {
		cancelAnimationFrame(this.settleFrame);
		if (target <= 0 && this.monthIndex !== this.months.length - 1) {
			this.monthIndex = this.months.length - 1;
			this.renderMonth();
		}
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
