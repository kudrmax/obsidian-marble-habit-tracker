import { LocalDate } from "../domain/LocalDate";
import { dayRing } from "./components";
import { CalendarDay, CalendarMonth, StripDay, calendarMonths, calendarWeek, dayTitle, donePercent, monthTitle, monthWeeks } from "./today";
import { daysUpTo, mondayOf } from "./week";

const SVG_NS = "http://www.w3.org/2000/svg";
const CHEVRON_LEFT = "m15 18-6-6 6-6";
const CHEVRON_RIGHT = "m9 18 6-6-6-6";
const WEEK_DAYS = 7;

/**
 * Today's calendar on a computer, over the list instead of in a tray to pull up: a line with the month, its arrows and
 * Today's buttons, then the week of the shown day, each date in a ring of how much of that day was done. A click on
 * the month opens the whole month in place, and closes it again; the arrows step by what is on show, a week or a
 * month. A click on a day shows it. Over the week's grid the week stays one week, its days over the grid's columns.
 */
export class WeekCalendar {
	readonly el: HTMLElement;
	private readonly title: HTMLButtonElement;
	private readonly previous: HTMLButtonElement;
	private readonly next: HTMLButtonElement;
	private readonly tools: HTMLElement;
	private readonly weeks: HTMLElement;
	private days: readonly StripDay[] = [];
	private months: CalendarMonth[] = [];
	private today: LocalDate | null = null;
	/** Over the grid, how many days it shows. */
	private count = 0;
	private shown: LocalDate | null = null;
	private pick: (day: LocalDate) => void = () => undefined;
	/** The whole month on show, instead of one week. */
	private open = false;
	/** Over the grid: the grid's days up to the shown day, and the arrows step the shown day as many days. */
	private grid = false;
	/** Over the grid, the day being answered. */
	private focus: LocalDate | null = null;
	/** A day in the week on show, while only a week is. */
	private week: LocalDate | null = null;
	private monthIndex = -1;

	constructor(parent: HTMLElement, before: HTMLElement) {
		this.el = createDiv("th-week");
		parent.insertBefore(this.el, before);
		const line = this.el.createDiv("th-week-line");
		this.title = line.createEl("button", { cls: ["th-week-title", "th-cal-month"] });
		this.title.addEventListener("click", () => this.toggle());
		this.previous = this.arrow(line, CHEVRON_LEFT, -1);
		this.next = this.arrow(line, CHEVRON_RIGHT, 1);
		this.tools = line.createDiv("th-week-tools");
		this.weeks = this.el.createDiv("th-week-days");
	}

	/** Puts Today's buttons on the month's line, in place of the ones there. */
	setTools(tools: HTMLElement): void {
		this.tools.empty();
		this.tools.appendChild(tools);
	}

	/**
	 * Takes the calendar's days and draws them with the shown day picked. A newly shown day brings its week and its month
	 * on show; otherwise the week or month the arrows went to stays.
	 */
	show(days: readonly StripDay[], shown: LocalDate, today: LocalDate, pick: (day: LocalDate) => void): void {
		const moved = this.grid || !this.shown?.equals(shown) || !this.today?.equals(today);
		this.grid = false;
		this.take(days, shown, today, pick);
		if (moved || !this.week) {
			this.week = shown;
			this.monthIndex = this.monthOf(shown);
		}
		this.render();
	}

	/**
	 * Over the grid: the `count` days up to the shown day as its columns' dates, plain, with the day being answered picked.
	 * The month's name names the shown day's month, and the arrows step `count` days.
	 */
	follow(days: readonly StripDay[], shown: LocalDate, today: LocalDate, pick: (day: LocalDate) => void, focus: LocalDate | null, count: number): void {
		this.grid = true;
		this.open = false;
		this.focus = focus;
		this.count = count;
		this.take(days, shown, today, pick);
		this.week = shown;
		this.render();
	}

	private take(days: readonly StripDay[], shown: LocalDate, today: LocalDate, pick: (day: LocalDate) => void): void {
		this.days = days;
		this.today = today;
		this.shown = shown;
		this.pick = pick;
		this.months = calendarMonths(days, today);
	}

	private arrow(line: HTMLElement, path: string, step: number): HTMLButtonElement {
		const button = line.createEl("button", { cls: "th-cal-arrow", attr: { "data-tooltip-position": "top" } });
		const svg = button.appendChild(document.createElementNS(SVG_NS, "svg"));
		svg.setAttribute("viewBox", "0 0 24 24");
		svg.setAttribute("aria-hidden", "true");
		svg.appendChild(document.createElementNS(SVG_NS, "path")).setAttribute("d", path);
		button.addEventListener("click", () => this.turn(step));
		return button;
	}

	private toggle(): void {
		if (this.grid) return;
		this.open = !this.open;
		if (this.open && this.week) this.monthIndex = this.monthOf(this.week);
		this.render();
	}

	/**
	 * A week or a month before or after the one on show, never past this week nor before the calendar starts. Over the
	 * grid, the day as many days away as the grid shows is picked, today at the latest.
	 */
	private turn(step: number): void {
		const today = this.today;
		if (!today || !this.week) return;
		if (this.grid) {
			const end = this.week.addDays(this.count * step);
			if (this.canStep(step)) this.pick(end.isAfter(today) ? today : end);
			return;
		}
		if (this.open) {
			this.monthIndex = Math.min(this.months.length - 1, Math.max(0, this.monthIndex + step));
		} else {
			const week = this.week.addDays(WEEK_DAYS * step);
			if (!this.canShowWeek(week)) return;
			this.week = week;
		}
		this.render();
	}

	/** Over the grid, a step on goes as far as today, and a step back no earlier than the calendar's first day. */
	private canStep(step: number): boolean {
		const today = this.today;
		const first = this.days[0]?.date;
		const end = this.week;
		if (!today || !first || !end) return false;
		return step > 0 ? end.isBefore(today) : !end.addDays(-this.count).isBefore(first);
	}

	private canShowWeek(day: LocalDate): boolean {
		const today = this.today;
		const first = this.days[0]?.date;
		if (!today || !first) return false;
		return !mondayOf(day).isAfter(mondayOf(today)) && !mondayOf(day).isBefore(mondayOf(first));
	}

	private monthOf(day: LocalDate): number {
		const index = this.months.findIndex((month) => month.year === day.year && month.month === day.month);
		return index < 0 ? this.months.length - 1 : index;
	}

	private render(): void {
		const today = this.today;
		const week = this.week;
		if (!today || !week) return;
		this.el.toggleClass("is-open", this.open);
		this.el.toggleClass("is-grid", this.grid);
		const month = this.grid ? { year: week.year, month: week.month } : this.open ? this.months[this.monthIndex] : this.monthOfWeek(week);
		if (month) this.title.setText(monthTitle(month, today));
		if (this.grid) this.title.removeAttribute("aria-expanded");
		else this.title.setAttr("aria-expanded", String(this.open));
		this.title.setAttr("aria-label", this.grid ? this.title.getText() : this.open ? "Show one week" : "Show the whole month");
		const rows = this.grid ? [daysUpTo(this.days, week, today, this.count)] : this.open && month ? monthWeeks(this.days, month, today) : [calendarWeek(this.days, week, today)];
		this.weeks.empty();
		for (const days of rows) {
			const row = this.weeks.createDiv("th-week-row");
			for (const day of days) this.renderDay(row, day, today);
		}
		this.previous.setAttr("aria-label", this.grid ? "Five days back" : this.open ? "Previous month" : "Previous week");
		this.next.setAttr("aria-label", this.grid ? "Five days on" : this.open ? "Next month" : "Next week");
		this.previous.disabled = this.grid ? !this.canStep(-1) : this.open ? this.monthIndex <= 0 : !this.canShowWeek(week.addDays(-WEEK_DAYS));
		this.next.disabled = this.grid ? !this.canStep(1) : this.open ? this.monthIndex >= this.months.length - 1 : !this.canShowWeek(week.addDays(WEEK_DAYS));
	}

	/** The month a week belongs to: the one its Thursday is in, as calendars count weeks. */
	private monthOfWeek(day: LocalDate): CalendarMonth {
		const thursday = mondayOf(day).addDays(3);
		return { year: thursday.year, month: thursday.month };
	}

	/** A date in its ring of how much of the day was done; over the grid a plain date, picked while it is being answered. */
	private renderDay(row: HTMLElement, day: CalendarDay, today: LocalDate): void {
		const off = day.future || day.outside;
		const percent = off ? null : donePercent(day);
		const title = dayTitle(day.date, today);
		const selected = (this.grid ? this.focus : this.shown)?.equals(day.date) ?? false;
		const button = row.createEl("button", { cls: "th-cal-day", attr: { "aria-label": percent === null ? title : `${title}, ${percent}% done`, "aria-pressed": String(selected), "data-tooltip-position": "top" } });
		button.toggleClass("is-selected", selected);
		button.toggleClass("is-today", day.date.equals(today));
		button.toggleClass("is-off", off);
		if (!off && !this.grid) dayRing(button, (percent ?? 0) / 100);
		button.createSpan("th-cal-date").createSpan({ cls: "th-cal-figure", text: String(day.date.day) });
		button.disabled = off || this.grid;
		button.addEventListener("click", () => this.pick(day.date));
	}
}
