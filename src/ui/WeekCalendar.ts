import { LocalDate } from "../domain/LocalDate";
import { dayRing } from "./components";
import { CalendarDay, CalendarMonth, StripDay, calendarMonths, calendarWeek, dayTitle, donePercent, monthTitle, monthWeeks } from "./today";
import { mondayOf } from "./week";

const SVG_NS = "http://www.w3.org/2000/svg";
const CHEVRON_LEFT = "m15 18-6-6 6-6";
const CHEVRON_RIGHT = "m9 18 6-6-6-6";
const WEEK_DAYS = 7;

/**
 * Today's calendar on a computer, over the list instead of in a tray to pull up: a line with the month, its arrows and
 * Today's buttons, then the week of the shown day, each date in a ring of how much of that day was done. A click on
 * the month opens the whole month in place, and closes it again; the arrows step by what is on show, a week or a
 * month. A click on a day shows it. Over the week's grid, which draws its days itself, only the line is left.
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
	private shown: LocalDate | null = null;
	private pick: (day: LocalDate) => void = () => undefined;
	/** The whole month on show, instead of one week. */
	private open = false;
	/** Only the month's line, over the week's grid: the arrows step the shown day a week. */
	private grid = false;
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

	/** The month's line alone, over the week's grid: it names the shown day's month, and the arrows pick a day a week away. */
	follow(days: readonly StripDay[], shown: LocalDate, today: LocalDate, pick: (day: LocalDate) => void): void {
		this.grid = true;
		this.open = false;
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
	 * grid, the day a week away is picked, today at the latest.
	 */
	private turn(step: number): void {
		const today = this.today;
		if (!today || !this.week) return;
		if (this.open) {
			this.monthIndex = Math.min(this.months.length - 1, Math.max(0, this.monthIndex + step));
		} else {
			const week = this.week.addDays(WEEK_DAYS * step);
			if (!this.canShowWeek(week)) return;
			if (this.grid) return this.pick(week.isAfter(today) ? today : week);
			this.week = week;
		}
		this.render();
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
		const month = this.open ? this.months[this.monthIndex] : this.monthOfWeek(week);
		if (month) this.title.setText(monthTitle(month, today));
		if (this.grid) this.title.removeAttribute("aria-expanded");
		else this.title.setAttr("aria-expanded", String(this.open));
		this.title.setAttr("aria-label", this.grid ? this.title.getText() : this.open ? "Show one week" : "Show the whole month");
		const rows = this.grid ? [] : this.open && month ? monthWeeks(this.days, month, today) : [calendarWeek(this.days, week, today)];
		this.weeks.empty();
		for (const days of rows) {
			const row = this.weeks.createDiv("th-week-row");
			for (const day of days) this.renderDay(row, day, today);
		}
		this.previous.setAttr("aria-label", this.open ? "Previous month" : "Previous week");
		this.next.setAttr("aria-label", this.open ? "Next month" : "Next week");
		this.previous.disabled = this.open ? this.monthIndex <= 0 : !this.canShowWeek(week.addDays(-WEEK_DAYS));
		this.next.disabled = this.open ? this.monthIndex >= this.months.length - 1 : !this.canShowWeek(week.addDays(WEEK_DAYS));
	}

	/** The month a week belongs to: the one its Thursday is in, as calendars count weeks. */
	private monthOfWeek(day: LocalDate): CalendarMonth {
		const thursday = mondayOf(day).addDays(3);
		return { year: thursday.year, month: thursday.month };
	}

	private renderDay(row: HTMLElement, day: CalendarDay, today: LocalDate): void {
		const off = day.future || day.outside;
		const percent = off ? null : donePercent(day);
		const title = dayTitle(day.date, today);
		const selected = this.shown?.equals(day.date) ?? false;
		const button = row.createEl("button", { cls: "th-cal-day", attr: { "aria-label": percent === null ? title : `${title}, ${percent}% done`, "aria-pressed": String(selected), "data-tooltip-position": "top" } });
		button.toggleClass("is-selected", selected);
		button.toggleClass("is-today", day.date.equals(today));
		button.toggleClass("is-off", off);
		if (!off) dayRing(button, (percent ?? 0) / 100);
		button.createSpan("th-cal-date").createSpan({ cls: "th-cal-figure", text: String(day.date.day) });
		button.disabled = off;
		button.addEventListener("click", () => this.pick(day.date));
	}
}
