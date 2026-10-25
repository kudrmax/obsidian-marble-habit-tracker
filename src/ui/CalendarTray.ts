import { LocalDate } from "../domain/LocalDate";
import { toolButton } from "./components";
import { DAY_RING_LENGTH, DAY_RING_RADIUS, DESIGN } from "./design";
import { Box } from "./jar/JarPhysics";
import { CalendarDay, CalendarMonth, StripDay, calendarMonths, dayTitle, donePercent, monthTitle, trayWeeks } from "./today";

/** Over the weeks: room under the grabber, then one line with the month, its arrows and Today's buttons. */
const HEAD_ROOM = 14;
const HEAD = HEAD_ROOM + DESIGN.monthLine + DESIGN.monthLineGap;
const WEEK_DAYS = 7;
/** Room between the weeks and whatever of Obsidian covers the bottom of the view, once the tray is up. */
const BOTTOM_GAP = 8;
/** How high the folded tray stands over Obsidian's bar. Its dates sit in the middle, as far from its edge as from the bar. */
const REST_HEIGHT = 66;
/** Folded, this week's row hangs this far below the calendar, so its dates sit in the middle of the tray; rising, the room under it grows back. */
const REST_LIFT = DESIGN.weekRow / 2 + BOTTOM_GAP - REST_HEIGHT / 2;
/** The figures the dates are written in, to see where their ink sits in their line. */
const FIGURES = "0123456789";
/** How far the tray rises before this week's row is whole. */
const ROW_WHOLE = DESIGN.weekRow + DESIGN.grip + BOTTOM_GAP - REST_HEIGHT;
/** How far the tray rises while the rings draw themselves round: up to its first stop, with the head open. */
const RINGS_DRAWN = ROW_WHOLE + HEAD;
/** The furthest the tray goes up: enough for a month of six weeks, and over the week's grid the week before it. */
const MAX_UP = 400;
/** How far the tray rises before its shadow is at full strength. */
const SHADOW_FADE = 60;
/** A finger has to move this far before it is clear whether it moves the tray or taps a day. */
const SLOP = 6;
/** A flick faster than this, in px per ms, carries the tray all the way up, or all the way down. */
const FLICK = 0.45;
/** Past its top the tray follows the finger at this fraction, like iOS rubber-banding; past its bottom, less. */
const RUBBER = 0.35;
const RUBBER_LOW = 0.15;
const SETTLE_MS = 420;
const SVG_NS = "http://www.w3.org/2000/svg";

/** The days the folded tray shows over the week's grid. */
export interface TrayStrip {
	readonly days: readonly CalendarDay[];
	/** The day being answered, picked among them. */
	readonly focus: LocalDate | null;
}

/** Over the week's grid, the days on show: `count` days up to `end`, which a finger moves along the month. */
export interface TrayRange {
	readonly end: LocalDate;
	readonly count: number;
	readonly move: (end: LocalDate) => void;
}

/**
 * A day on show over the grid, its date and ring carried between its place in the folded row and its own on the month:
 * the week and the column it has there, and its place among the days on show.
 */
interface Carried {
	readonly cell: HTMLElement;
	readonly week: number;
	readonly column: number;
	readonly place: number;
}

/** A date's ring: its track all the way round, and the part of it the day was done, if any. */
interface Ring {
	readonly track: SVGCircleElement;
	readonly done: SVGCircleElement | null;
	readonly share: number;
	readonly date: LocalDate;
	readonly week: number;
	/** How far round it was last drawn. */
	drawn: number;
}
/** A calendar page with its two rings, today's date written on it. */
const PAGE = ["M8 2v4", "M16 2v4", "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"];
/** Where today's date stands on the page, and how big, in the icon's own units. */
const PAGE_DATE = { x: 12, y: 14.5, size: 10 };

const fontOf = (element: HTMLElement) => {
	const style = getComputedStyle(element);
	return `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
};
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3.4);

/**
 * Today's calendar, in a tray at the bottom of the view over Obsidian's navbar. Folded, it shows this week's dates, or
 * over the week's grid the grid's own days; pulled up, the rest of the month comes in above them, each date in a ring of
 * how much of that day was done, under a line with the month, arrows to the months before and Today's buttons. Over the
 * grid the month marks the grid's days with a band, which a finger moves along it. Let go, the tray stays on the
 * nearest whole week. Its top edge is the floor the marbles stand on, wherever it is: rising, it carries them up and
 * they hop off it.
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
	/** Over the grid, back to the days up to today, beside the month's arrows. */
	private readonly latest: HTMLButtonElement;
	/** Today's buttons, on the month's line. */
	private readonly tools: HTMLElement;
	private readonly weeks: HTMLElement;
	/** Over the week's grid, arrows in the folded row that move its days a day at a time. */
	private readonly steps: HTMLElement;
	private days: readonly StripDay[] = [];
	/** Over the week's grid, the days the folded row shows. */
	private stripDays: readonly LocalDate[] = [];
	private months: CalendarMonth[] = [];
	/** The month on show, as an index into `months`; folded, it is always this month. */
	private monthIndex = -1;
	private shownDay: LocalDate | null = null;
	private today: LocalDate | null = null;
	/** The day whose month the folded tray rests on: today, or over the grid the last day on show. */
	private rest: LocalDate | null = null;
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
	/** The view's size as last read, before the tray was placed. */
	private width = 0;
	private height = 0;
	private rows = 1;
	private rings: Ring[] = [];
	/** Over the week's grid, the days on show, marked on the month with a band. */
	private range: TrayRange | null = null;
	/** The dates of each week the month lays out, over the grid the week before it first. */
	private weekDates: LocalDate[][] = [];
	/** Each week's row, and over the grid its band. */
	private weekRows: HTMLElement[] = [];
	private bands: HTMLElement[] = [];
	/** How far up the tray was when the band was last drawn. */
	private bandDrawn = -1;
	private carried: Carried[] = [];
	/** How far up the tray was when the rings, the carried days and the arrows were last moved; each frame moves them once. */
	private ringsAt = Number.NaN;
	private carriedAt = Number.NaN;
	private stepsAt = Number.NaN;
	/** What the view was last told of the tray: its height at rest, under the list, and how high it stands over the bars. */
	private roomHeight = -1;
	private restHeight = -1;
	private insetHeight = -1;
	/** How far across the folded row's arrows travel to the month's, and how far they are now. */
	private stepsAcross = 0;
	private stepsShift = 0;
	/** Over the grid, the day being answered, picked among the days on show. */
	private focus: LocalDate | null = null;
	/** The month whose week before it shows: once the days on show reach its first week, until the tray folds. */
	private revealedIn: CalendarMonth | null = null;
	private bandDrag: { pointer: number; x: number; y: number; column: number; from: LocalDate; grabbed: LocalDate; moved: boolean } | null = null;
	/** How far above its rest the tray is. */
	private raised = 0;
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
		/** Taps when the tray opens or folds, and as the band moves a day. */
		private readonly tap: () => void,
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
		this.previous = this.arrow(line, "Previous month", "chevron-left", () => this.turn(-1));
		this.next = this.arrow(line, "Next month", "chevron-right", () => this.turn(1));
		this.latest = this.todayButton(line);
		this.tools = line.createDiv("th-cal-tools");
		this.steps = this.calendar.createDiv("th-cal-steps");
		this.tray.addEventListener("pointerdown", this.pointerDown);
		window.addEventListener("pointermove", this.pointerMove);
		window.addEventListener("pointerup", this.pointerUp);
		window.addEventListener("pointercancel", this.pointerCancel);
		this.tray.addEventListener("click", this.clickAfterDrag, true);
		// A finger moving the tray moves only the tray: Obsidian's own gestures don't get it. Its taps still do, so
		// Obsidian can take the pressed look off a date when the finger lifts.
		this.tray.addEventListener("touchmove", (event) => {
			if (this.drag?.moving || this.bandDrag) event.stopPropagation();
		});
		this.resizer = new ResizeObserver(() => {
			this.placeRest();
			this.measureSteps();
		});
		this.resizer.observe(root);
		this.place();
		this.room();
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

	snap(open: boolean): void {
		this.settle(open ? this.maxUp() : 0);
	}

	/** The tray where it is now, as the box the marbles stand on. */
	box(): Box {
		return { left: 0, top: this.restTop - this.raised, right: this.width, bottom: this.height, radius: DESIGN.trayCorner };
	}

	/**
	 * Takes the calendar's days and draws the month on show: this month unless another one was opened with the arrows.
	 * Folded, the tray shows this week. The shown day is picked; a tap on another day picks it.
	 */
	show(days: readonly StripDay[], shown: LocalDate, today: LocalDate, pick: (day: LocalDate) => void): void {
		this.range = null;
		this.tray.removeClass("is-ranged");
		this.update(days, shown, today, pick, today);
	}

	/**
	 * Over the week's grid: the month of the days on show, them marked on it with a band. A finger on the band moves it
	 * along the days, a day for each column it crosses and a week for each week, never past today; each day it moves,
	 * the grid follows. Folded, the tray shows the days over the grid's columns, see `setStrip`.
	 */
	showRange(days: readonly StripDay[], today: LocalDate, range: TrayRange): void {
		const moving = this.bandDrag !== null && this.range !== null;
		this.range = range;
		this.tray.addClass("is-ranged");
		if (!moving) return this.update(days, range.end, today, () => undefined, range.end);
		this.shownDay = range.end;
		this.rest = range.end;
		this.placeBand();
	}

	/** The month the folded tray rests on is the one of `rest`. */
	private update(days: readonly StripDay[], shown: LocalDate, today: LocalDate, pick: (day: LocalDate) => void, rest: LocalDate): void {
		const restMoved = !this.rest?.equals(rest);
		this.days = days;
		this.shownDay = shown;
		this.today = today;
		this.rest = rest;
		this.pick = pick;
		const open = this.months[this.monthIndex];
		this.months = calendarMonths(days, today);
		this.monthIndex = open ? this.indexOf(open) : -1;
		if (this.monthIndex < 0 || (restMoved && this.raised <= 1)) this.monthIndex = this.restIndex();
		this.renderMonth();
	}

	/**
	 * Over the week's grid the folded tray shows the grid's own days, each under its column of circles, the day being
	 * answered picked. They are the month's own days, carried down into a row of places under the columns; pulled up,
	 * each travels to its place on the month, its ring and the band drawing round it, and the rest of the month comes in.
	 */
	setStrip(strip: TrayStrip | null): void {
		this.steps.empty();
		this.focus = strip?.focus ?? null;
		this.stripDays = strip?.days.map((day) => day.date) ?? [];
		const range = this.range;
		if (strip && range && this.today) {
			const first = this.months[0];
			const earliest = first ? LocalDate.of(first.year, first.month, 1) : this.today;
			const latest = !range.end.isBefore(this.today);
			this.arrow(this.steps, "Previous day", "chevron-left", () => this.moveTo(range.end.addDays(-1))).disabled = !range.end.isAfter(earliest);
			this.arrow(this.steps, "Next day", "chevron-right", () => this.moveTo(range.end.addDays(1))).disabled = latest;
			if (!latest) this.todayButton(this.steps);
			this.latest.toggle(!latest);
			this.writeToday(this.latest);
		}
		this.measureSteps();
		this.carry();
	}

	/** How far the month's arrows stand from the folded row's, across, for the folded ones to travel up to them. */
	private measureSteps(): void {
		const first = this.steps.querySelector<HTMLElement>(".th-cal-arrow");
		if (!first) return;
		this.stepsAcross = this.previous.getBoundingClientRect().left - first.getBoundingClientRect().left + this.stepsShift;
		this.stepsAt = Number.NaN;
		this.moveSteps();
	}

	/**
	 * Carries the folded row's arrows up to the month's as the tray rises, there once the head is open; the month's own
	 * wait hidden until then, and the folded ones hide once they are there.
	 */
	private moveSteps(): void {
		if (!this.steps.firstChild || this.raised === this.stepsAt) return;
		this.stepsAt = this.raised;
		const raised = Math.max(0, this.raised);
		const travel = clamp(raised / (ROW_WHOLE + HEAD));
		const head = Math.min(HEAD, Math.max(0, raised - ROW_WHOLE));
		const lift = Math.max(0, REST_LIFT - this.raised);
		const up = head - DESIGN.monthLineGap - DESIGN.monthLine / 2 - (REST_HEIGHT - BOTTOM_GAP - DESIGN.grip + raised + lift - DESIGN.weekRow / 2);
		this.stepsShift = this.stepsAcross * travel;
		this.steps.style.setProperty("--th-steps-x", `${this.stepsShift.toFixed(2)}px`);
		this.steps.style.setProperty("--th-steps-y", `${(up * travel).toFixed(2)}px`);
		this.steps.style.setProperty("--th-steps-fill", travel.toFixed(3));
		this.tray.toggleClass("is-stepped-up", travel >= 1);
	}

	/** The month the folded tray rests on: the one of `rest`. */
	private restIndex(): number {
		const index = this.rest ? this.indexOf(this.rest) : -1;
		return index < 0 ? this.months.length - 1 : index;
	}

	/** Where a month is among the calendar's, kept by the month itself: days answered before them add months in front. */
	private indexOf(month: CalendarMonth): number {
		return this.months.findIndex((known) => known.year === month.year && known.month === month.month);
	}

	/** The month's arrows and the folded row's: Today's round tools, with a chevron. */
	private arrow(parent: HTMLElement, label: string, chevron: string, onClick: () => void): HTMLButtonElement {
		const button = toolButton(parent, label, chevron, onClick);
		button.addClass("th-cal-arrow");
		return button;
	}

	/** Back to the days up to today: today's page from the calendar, its date on it. Away from today only. */
	private todayButton(parent: HTMLElement): HTMLButtonElement {
		const button = toolButton(parent, "Up to today", (icon) => this.drawPage(icon), () => this.showLatest());
		button.addClass("th-cal-arrow", "th-cal-latest");
		this.writeToday(button);
		return button;
	}

	/** A calendar page drawn as Lucide draws its icons, with room for a date on it. */
	private drawPage(icon: HTMLElement): void {
		const svg = icon.appendChild(document.createElementNS(SVG_NS, "svg"));
		svg.setAttribute("viewBox", "0 0 24 24");
		svg.setAttribute("aria-hidden", "true");
		svg.setAttribute("class", "th-page-icon");
		for (const path of PAGE) svg.appendChild(document.createElementNS(SVG_NS, "path")).setAttribute("d", path);
		const date = svg.appendChild(document.createElementNS(SVG_NS, "text"));
		date.setAttribute("x", String(PAGE_DATE.x));
		date.setAttribute("y", String(PAGE_DATE.y));
		date.setAttribute("font-size", String(PAGE_DATE.size));
		date.setAttribute("text-anchor", "middle");
		date.setAttribute("dominant-baseline", "central");
	}

	private writeToday(button: HTMLButtonElement): void {
		const date = button.querySelector("text");
		if (date && this.today) date.textContent = String(this.today.day);
	}

	/** Back to the days up to today, on this month. */
	private showLatest(): void {
		if (!this.today) return;
		this.monthIndex = this.months.length - 1;
		this.moveTo(this.today);
	}

	/**
	 * Opens the month before or after the one on show, all of it. Over the grid the band stays where it is when the
	 * month shows its days too, as the weeks the two months share do; otherwise it moves to the month's last days.
	 */
	private turn(step: number): void {
		const index = Math.min(this.months.length - 1, Math.max(0, this.monthIndex + step));
		if (index === this.monthIndex) return;
		this.monthIndex = index;
		const range = this.range;
		const end = range && !this.holds(this.months[index], range) ? this.lastDayOf(this.months[index]) : null;
		if (range && end) {
			this.range = { ...range, end };
			this.shownDay = end;
			this.rest = end;
		}
		this.renderMonth();
		this.settle(this.maxUp());
		if (range && end) range.move(end);
	}

	/** Whether a month's weeks, the week before it included, show all the days on show. */
	private holds(month: CalendarMonth, range: TrayRange): boolean {
		const today = this.today;
		if (!today) return false;
		const weeks = trayWeeks(this.days, month, today, 1);
		const first = weeks[0][0].date;
		const last = weeks[weeks.length - 1][WEEK_DAYS - 1].date;
		return !range.end.addDays(1 - range.count).isBefore(first) && !range.end.isAfter(last);
	}

	/** A month's last day, or today in this month. */
	private lastDayOf(month: CalendarMonth): LocalDate {
		const last = LocalDate.of(month.year, month.month + 1, 0);
		return this.today && last.isAfter(this.today) ? this.today : last;
	}

	private renderMonth(): void {
		const month = this.months[this.monthIndex];
		const today = this.today;
		if (!month || !today) return;
		const weeks = trayWeeks(this.days, month, today, this.range ? 1 : 0);
		this.weeks.empty();
		this.rings = [];
		this.ringsAt = Number.NaN;
		this.weekRows = [];
		this.bands = [];
		this.weekDates = weeks.map((week) => week.map((day) => day.date));
		const list = this.weeks.createDiv("th-cal-list");
		weeks.forEach((week, index) => {
			const row = list.createDiv("th-cal-week");
			this.weekRows.push(row);
			if (this.range) this.bands.push(row.createDiv("th-cal-band"));
			for (const day of week) {
				if (this.range) this.renderBandDay(row, day, index, today);
				else this.renderDay(row, day, index, this.shownDay?.equals(day.date) ?? false, today);
			}
		});
		this.alignToGrid();
		this.fitTitle();
		this.previous.disabled = this.monthIndex === 0;
		this.next.disabled = this.monthIndex === this.months.length - 1;
		this.rows = Math.max(1, weeks.length - (this.range && !this.revealed() ? 1 : 0));
		this.raised = Math.min(this.raised, this.maxUp());
		this.centerFigures();
		this.placeBand();
		this.carry();
		this.place();
	}

	/** Whether the week before the month shows over the grid, its days there for the band to move onto. */
	private revealed(): boolean {
		const revealed = this.revealedIn;
		return this.range !== null && revealed !== null && this.monthIndex >= 0 && this.indexOf(revealed) === this.monthIndex;
	}

	/**
	 * Marks the days on show with a band on each week they are in, from the first of them there to the last. A week
	 * without them keeps its band folded away on the side they lie past, so it grows from there when they come in.
	 * Once they reach the month's first week, the week before it comes in over it.
	 */
	private placeBand(): void {
		const range = this.range;
		if (!range) return;
		const start = range.end.addDays(1 - range.count);
		const first = this.weekDates[1];
		if (first && !this.revealed() && !start.isAfter(first[WEEK_DAYS - 1])) this.reveal();
		this.bands.forEach((band, index) => {
			const dates = this.weekDates[index];
			const held = dates.flatMap((date, column) => (date.isBefore(start) || date.isAfter(range.end) ? [] : [column]));
			const from = held[0] ?? (dates[0].isAfter(range.end) ? 0 : WEEK_DAYS - 1);
			const to = held[held.length - 1] ?? from;
			band.style.setProperty("--th-band-first", String((from + 0.5) / WEEK_DAYS));
			band.style.setProperty("--th-band-last", String((to + 0.5) / WEEK_DAYS));
			band.toggleClass("is-empty", held.length === 0);
		});
		this.bandDrawn = -1;
		this.ringsAt = Number.NaN;
		this.drawBand();
	}

	/** Brings the week before the month in over its first week, the tray rising a week to show it if it is up. */
	private reveal(): void {
		this.revealedIn = this.months[this.monthIndex] ?? null;
		this.rows += 1;
		if (this.raised > 1) this.settle(this.raised + DESIGN.weekRow);
	}

	/** Draws each week's band back from its last day on show to its first while their dates travel up to it. */
	private drawBand(): void {
		if (this.raised === this.bandDrawn) return;
		this.bandDrawn = this.raised;
		this.bands.forEach((band, week) => band.style.setProperty("--th-band-shown", this.travel(week).toFixed(3)));
	}

	/**
	 * How far the folded tray's dates have come to their week of the month: from nothing, folded, to all the way once
	 * the tray shows that week whole, so each lands as its week comes in.
	 */
	private travel(week: number): number {
		const whole = ROW_WHOLE + HEAD + (this.weekDates.length - 1 - week) * DESIGN.weekRow;
		return clamp(Math.max(0, this.raised) / whole);
	}

	/** Whether a day is one of the days on show over the grid. */
	private onShow(date: LocalDate): boolean {
		const range = this.range;
		return !!range && !date.isAfter(range.end) && !date.isBefore(range.end.addDays(1 - range.count));
	}

	/**
	 * Tells each day on show where its place in the folded row stands against its own on the month: how many columns in
	 * from the row's end it is, how many places in from the folded row's end, and how many weeks up. The styles carry it
	 * between the two from that alone, so nothing is measured, and no change of width or late stylesheet leaves it behind.
	 */
	private carry(): void {
		for (const item of this.carried) item.cell.removeClass("is-carried", "is-selected");
		this.carried = [];
		const count = this.stripDays.length;
		if (this.range)
			this.stripDays.forEach((date, place) => {
				const week = this.weekDates.findIndex((dates) => dates.some((day) => day.equals(date)));
				const column = week < 0 ? -1 : this.weekDates[week].findIndex((day) => day.equals(date));
				const cell = this.weekRows[week]?.querySelector<HTMLElement>(`.th-cal-day[data-date="${date.toString()}"]`);
				if (!cell) return;
				cell.addClass("is-carried");
				cell.toggleClass("is-selected", this.focus?.equals(date) ?? false);
				cell.style.setProperty("--th-carry-columns", String(WEEK_DAYS - column - 0.5));
				cell.style.setProperty("--th-carry-places", String(count - place - 0.5));
				this.carried.push({ cell, week, column, place });
			});
		this.weekRows.forEach((row, week) => row.style.setProperty("--th-carry-weeks", String(this.weekDates.length - 1 - week)));
		const columns = (item: Carried | undefined) => String(item ? (WEEK_DAYS - item.column - 0.5) / WEEK_DAYS : 0);
		const places = (item: Carried | undefined) => String(item ? count - item.place - 0.5 : 0);
		this.bands.forEach((band, week) => {
			const held = this.carried.filter((item) => item.week === week);
			band.style.setProperty("--th-band-first-columns", columns(held[0]));
			band.style.setProperty("--th-band-first-places", places(held[0]));
			band.style.setProperty("--th-band-last-columns", columns(held[held.length - 1]));
			band.style.setProperty("--th-band-last-places", places(held[held.length - 1]));
		});
		this.carriedAt = Number.NaN;
		this.moveCarried();
	}

	/**
	 * Carries each day on show straight from its place in the folded row to its own on the month as the tray rises,
	 * there once its week shows whole; on its way it passes over the head. Each week's band stretches with its days, from
	 * the first of them there to the last.
	 */
	private moveCarried(): void {
		if (!this.range || this.raised === this.carriedAt) return;
		this.carriedAt = this.raised;
		let carrying = false;
		this.weekRows.forEach((row, week) => {
			const travel = this.travel(week);
			carrying ||= travel < 1 && this.carried.some((item) => item.week === week);
			row.style.setProperty("--th-carry", (1 - travel).toFixed(3));
		});
		this.tray.toggleClass("is-carrying", carrying);
		this.tray.style.setProperty("--th-month-in", clamp((Math.max(0, this.raised) - ROW_WHOLE - HEAD) / DESIGN.weekRow).toFixed(3));
	}

	/** The month's whole name, or its short one when the whole one leaves the buttons no room on its line. */
	private fitTitle(): void {
		const month = this.months[this.monthIndex];
		const today = this.today;
		if (!month || !today) return;
		this.title.setText(monthTitle(month, today));
		if (this.line.scrollWidth > this.line.clientWidth) this.title.setText(monthTitle(month, today, "short"));
		this.measureSteps();
	}

	/**
	 * A font's figures need not sit in the middle of their box: they can sit high or low in their line, and a narrow 1
	 * leaves a date off to one side. This finds where their ink is, in whatever font the dates are in, and moves each date
	 * to the middle of its circle.
	 */
	private centerFigures(): void {
		const figures = Array.from(this.calendar.querySelectorAll<HTMLElement>(".th-cal-weeks .th-cal-figure"));
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

	private renderDay(row: HTMLElement, day: CalendarDay, week: number, selected: boolean, today: LocalDate): void {
		const off = day.future;
		const percent = off ? null : donePercent(day);
		const title = dayTitle(day.date, today);
		const button = row.createEl("button", { cls: "th-cal-day", attr: { "aria-label": percent === null ? title : `${title}, ${percent}% done`, "aria-pressed": String(selected) } });
		button.toggleClass("is-selected", selected);
		button.toggleClass("is-today", day.date.equals(today));
		button.toggleClass("is-off", off);
		button.toggleClass("is-other", day.outside);
		if (!off) this.renderRing(button, percent ?? 0, day.date, week);
		button.createSpan("th-cal-date").createSpan({ cls: "th-cal-figure", text: String(day.date.day) });
		button.disabled = off;
		button.addEventListener("click", () => this.pick(day.date));
	}

	/**
	 * A day of the month over the grid: its ring and date as on Today, in any month, but not a button: the band over the
	 * days on show is what a finger moves.
	 */
	private renderBandDay(row: HTMLElement, day: CalendarDay, week: number, today: LocalDate): void {
		const percent = day.future ? null : donePercent(day);
		const title = dayTitle(day.date, today);
		const cell = row.createDiv({ cls: "th-cal-day", attr: { "data-date": day.date.toString(), "aria-label": percent === null ? title : `${title}, ${percent}% done` } });
		cell.toggleClass("is-today", day.date.equals(today));
		cell.toggleClass("is-off", day.future);
		cell.toggleClass("is-other", day.outside);
		if (!day.future) this.renderRing(cell, percent ?? 0, day.date, week);
		cell.createSpan("th-cal-date").createSpan({ cls: "th-cal-figure", text: String(day.date.day) });
	}

	/** A ring around the date, its accent part as far round as the day was done: all of it for a day done in full. */
	private renderRing(button: HTMLElement, percent: number, date: LocalDate, week: number): void {
		const svg = button.appendChild(document.createElementNS(SVG_NS, "svg"));
		svg.setAttribute("class", "th-cal-ring");
		svg.setAttribute("viewBox", `0 0 ${DESIGN.ring} ${DESIGN.ring}`);
		svg.setAttribute("aria-hidden", "true");
		const circle = (cls: string) => {
			const element = svg.appendChild(document.createElementNS(SVG_NS, "circle"));
			element.setAttribute("class", cls);
			element.setAttribute("cx", String(DESIGN.ring / 2));
			element.setAttribute("cy", String(DESIGN.ring / 2));
			element.setAttribute("r", String(DAY_RING_RADIUS));
			element.setAttribute("transform", `rotate(-90 ${DESIGN.ring / 2} ${DESIGN.ring / 2})`);
			return element;
		};
		const track = circle("th-cal-ring-track");
		this.rings.push({ track, done: percent === 0 ? null : circle("th-cal-ring-arc"), share: percent / 100, date, week, drawn: -1 });
	}

	/**
	 * Draws every ring from its top, clockwise, as far round as `round` says, from none to all the way; the part the day
	 * was done grows with it, so each ring comes in drawing itself rather than fading in. Over the grid the rings of the
	 * days on show draw round their dates as those travel up to them.
	 */
	private drawRings(round: number): void {
		if (this.raised === this.ringsAt) return;
		this.ringsAt = this.raised;
		for (const ring of this.rings) {
			const drawn = this.onShow(ring.date) ? this.travel(ring.week) : round;
			if (drawn === ring.drawn) continue;
			ring.drawn = drawn;
			this.drawArc(ring.track, drawn);
			if (ring.done) this.drawArc(ring.done, drawn * ring.share);
		}
	}

	private drawArc(circle: SVGCircleElement, share: number): void {
		circle.setAttribute("stroke-dasharray", `${(DAY_RING_LENGTH * share).toFixed(2)} ${DAY_RING_LENGTH.toFixed(2)}`);
		circle.style.visibility = share > 0 ? "" : "hidden";
	}

	/** Lines the month and the buttons up with the grid's outer rings, whatever the width. */
	private alignToGrid(): void {
		const column = parseFloat(getComputedStyle(this.root).getPropertyValue("--th-column")) || Infinity;
		const width = Math.min(this.calendar.clientWidth, column);
		const edge = Math.round(DESIGN.weekPad + ((width - 2 * DESIGN.weekPad) / WEEK_DAYS - DESIGN.ring) / 2);
		if (width === 0 || edge === this.edge) return;
		this.edge = edge;
		this.tray.style.setProperty("--th-cal-edge", `${edge}px`);
		this.fitTitle();
	}

	private maxUp(): number {
		return Math.min(MAX_UP, ROW_WHOLE + HEAD + (this.rows - 1) * DESIGN.weekRow);
	}

	/** Places the tray again after the view or Obsidian's bars changed. */
	private placeRest(): void {
		if (this.held()) return;
		this.place();
		this.alignToGrid();
		this.room();
	}

	/**
	 * Tells the view how high the tray stands, so the list keeps room under its last row: only where the tray comes to
	 * rest, not every frame it moves, so the list isn't laid out again all the way.
	 */
	private room(): void {
		const height = Math.round(this.root.clientHeight - this.restTop + this.raised);
		if (height === this.roomHeight) return;
		this.roomHeight = height;
		this.root.style.setProperty("--th-tray-height", `${height}px`);
	}

	/**
	 * Puts the tray where it is now, every frame it moves. The view's size is read first, before anything is written,
	 * so the browser lays nothing out again mid-frame.
	 */
	private place(): void {
		const height = this.root.clientHeight;
		this.height = height;
		this.width = this.root.clientWidth;
		const restTop = height - this.inset - REST_HEIGHT;
		this.restTop = restTop;
		const top = restTop - this.raised;
		// The tray's own position goes on the tray, so only it is styled again as it moves, not the whole view.
		this.tray.style.setProperty("--th-tray-top", `${top}px`);
		if (this.ready && top !== this.lastTop) this.onMove();
		this.lastTop = top;
		if (height - restTop !== this.restHeight) {
			this.restHeight = height - restTop;
			this.root.style.setProperty("--th-tray-rest", `${this.restHeight}px`);
		}
		if (this.inset + BOTTOM_GAP !== this.insetHeight) {
			this.insetHeight = this.inset + BOTTOM_GAP;
			this.calendar.style.setProperty("--th-tray-inset", `${this.insetHeight}px`);
		}
		const raised = Math.max(0, this.raised);
		// Rising, the room under this week's row grows back first and the row becomes whole; then the head opens over it, so
		// it never lies over a week; the earlier weeks get the rest. All the while, up to the first stop, the rings draw round.
		this.drawRings(clamp(raised / RINGS_DRAWN));
		this.drawBand();
		this.moveCarried();
		this.moveSteps();
		const head = `${Math.min(HEAD, Math.max(0, raised - ROW_WHOLE))}px`;
		this.head.style.setProperty("--th-head-height", head);
		this.weeks.style.setProperty("--th-head-height", head);
		this.tray.style.setProperty("--th-open", String(clamp(raised / SHADOW_FADE)));
		// Folded, this week's row hangs low so only its dates show; pushed below its rest, the tray takes them down with it.
		this.calendar.style.setProperty("--th-lift", `${Math.max(0, REST_LIFT - this.raised)}px`);
		const up = this.raised > 1;
		if (up === this.tray.hasClass("is-up")) return;
		this.grip.setAttribute("aria-label", up ? "Hide the month" : "Show the month");
		this.tray.toggleClass("is-up", up);
	}

	/** Where the finger puts the tray, giving way less and less past either end of its range. */
	private bounded(raised: number): number {
		const max = this.maxUp();
		if (raised > max) return max + (raised - max) * RUBBER;
		if (raised < 0) return raised * RUBBER_LOW;
		return raised;
	}

	private readonly pointerDown = (event: PointerEvent) => {
		if (event.button !== 0 || this.grabBand(event)) return;
		cancelAnimationFrame(this.settleFrame);
		this.drag = { pointer: event.pointerId, startY: event.clientY, startRaised: this.raised, lastY: event.clientY, lastAt: event.timeStamp, speed: 0, moving: false };
	};

	/** A finger down on the days on show takes the band, to move them along the month; anywhere else it moves the tray. */
	private grabBand(event: PointerEvent): boolean {
		const range = this.range;
		const cell = event.target instanceof Element ? event.target.closest<HTMLElement>(".th-cal-weeks .th-cal-day") : null;
		const date = cell?.dataset.date ? LocalDate.parse(cell.dataset.date) : null;
		const week = cell?.parentElement;
		if (!range || !date || !week || this.raised <= 1) return false;
		if (date.isAfter(range.end) || date.isBefore(range.end.addDays(1 - range.count))) return false;
		const column = (week.clientWidth - 2 * DESIGN.weekPad) / WEEK_DAYS;
		this.bandDrag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, column, from: range.end, grabbed: date, moved: false };
		this.tray.addClass("is-moving");
		return true;
	}

	/** Moves the band a day for each column the finger crosses and a week for each week; the grid follows at once. */
	private moveBand(event: PointerEvent): void {
		const drag = this.bandDrag;
		const range = this.range;
		if (!drag || !range || event.pointerId !== drag.pointer) return;
		drag.moved ||= Math.hypot(event.clientX - drag.x, event.clientY - drag.y) >= SLOP;
		const days = Math.round((event.clientX - drag.x) / drag.column) + WEEK_DAYS * Math.round((event.clientY - drag.y) / DESIGN.weekRow);
		this.moveTo(this.reachable(drag.from.addDays(days), range.count));
	}

	/**
	 * A tap on a day makes it the last day on show: on the month when the tray is up, or on the days themselves when it
	 * is folded.
	 */
	private pickDay(target: EventTarget | null): void {
		const range = this.range;
		const cell = target instanceof Element ? target.closest<HTMLElement>(".th-cal-weeks .th-cal-day") : null;
		const date = cell?.dataset.date ? LocalDate.parse(cell.dataset.date) : null;
		if (!range || !cell || !date || cell.hasClass("is-off")) return;
		if (this.raised > 1) this.moveTo(this.reachable(date, range.count));
		else if (cell.hasClass("is-carried")) this.moveTo(date);
	}

	/** Moves the days on show to end on `end`, never past today; the grid follows at once. */
	private moveTo(end: LocalDate): void {
		const range = this.range;
		const latest = this.today && end.isAfter(this.today) ? this.today : end;
		if (!range || latest.equals(range.end)) return;
		this.range = { ...range, end: latest };
		this.placeBand();
		this.tap();
		range.move(latest);
	}

	/** Keeps the days on show on the weeks the tray shows now, and none of them after today. */
	private reachable(end: LocalDate, count: number): LocalDate {
		const weeks = this.weekDates;
		const shownWeeks = Math.floor((Math.round(this.raised) - ROW_WHOLE - HEAD) / DESIGN.weekRow) + 1;
		const top = Math.max(weeks.length - this.rows, weeks.length - Math.max(1, shownWeeks));
		const earliest = weeks[top][0].addDays(count - 1);
		const last = weeks[weeks.length - 1][WEEK_DAYS - 1];
		const latest = this.today && this.today.isBefore(last) ? this.today : last;
		if (end.isAfter(latest)) return latest;
		return end.isBefore(earliest) ? earliest : end;
	}

	private readonly pointerMove = (event: PointerEvent) => {
		if (this.bandDrag) return this.moveBand(event);
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
		const band = this.bandDrag;
		if (band?.pointer === event.pointerId) {
			this.bandDrag = null;
			this.tray.removeClass("is-moving");
			if (!band.moved && !cancelled) this.moveTo(this.reachable(band.grabbed, this.range?.count ?? 1));
			return;
		}
		const drag = this.drag;
		if (!drag || event.pointerId !== drag.pointer) return;
		this.drag = null;
		this.tray.removeClass("is-dragging");
		if (!drag.moving) {
			if (!cancelled && this.grip.contains(event.target as Node)) this.snap(this.raised <= 1);
			else if (!cancelled) this.pickDay(event.target);
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

	/**
	 * Folded, the head over this week, or the head over one more whole week each time, up to all the way. Over the grid
	 * only folded or all the way, so the days on show never stop on their way up to their week.
	 */
	private nearestStop(raised: number): number {
		const stops = [0, this.maxUp()];
		for (let week = 0; !this.range && ROW_WHOLE + HEAD + week * DESIGN.weekRow < this.maxUp(); week++) stops.push(ROW_WHOLE + HEAD + week * DESIGN.weekRow);
		return stops.reduce((best, stop) => (Math.abs(stop - raised) < Math.abs(best - raised) ? stop : best));
	}

	/**
	 * Moves the tray to `target` above its rest, within its range, on iOS's settling curve, and taps when it opens or
	 * folds. Folding goes back to the month it rests on, so the folded tray always shows its week; once folded, the week
	 * before the month goes away again.
	 */
	private settle(target: number): void {
		cancelAnimationFrame(this.settleFrame);
		if (target <= 0 && this.monthIndex !== this.restIndex()) {
			this.monthIndex = this.restIndex();
			this.renderMonth();
		}
		const to = Math.min(this.maxUp(), Math.max(0, target));
		if ((to > 1) !== (this.raised > 1)) this.tap();
		const from = this.raised;
		const start = performance.now();
		const step = (now: number) => {
			const t = Math.min(1, (now - start) / SETTLE_MS);
			this.raised = from + (to - from) * easeOut(t);
			this.place();
			if (t < 1) return void (this.settleFrame = requestAnimationFrame(step));
			this.room();
			if (to <= 0 && this.revealed()) this.forget();
		};
		this.settleFrame = requestAnimationFrame(step);
	}

	/** Hides the week before the month again, unless the days on show still reach into its first week. */
	private forget(): void {
		this.revealedIn = null;
		this.renderMonth();
	}
}
