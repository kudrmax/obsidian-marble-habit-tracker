import { LocalDate, WEEKDAYS } from "../domain/LocalDate";
import { CalendarDay, CalendarMonth, StripDay, calendarMonths, calendarWeek, dayTitle, donePercent, monthTitle, monthWeeks } from "./today";

const SVG_NS = "http://www.w3.org/2000/svg";
/** The ring around each date, as in the phone's calendar. */
const RING = 40;
const RING_RADIUS = 19;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
const CHEVRON_LEFT = "m15 18-6-6 6-6";
const CHEVRON_RIGHT = "m9 18 6-6-6-6";

/**
 * Today's calendar on a computer, over the list instead of in a tray to pull up: a line with the month, its arrows and
 * Today's buttons, then the week of the shown day, each date in a ring of how much of that day was done. A click on
 * the month opens the whole month in place, and closes it again; the arrows step by what is on show, a week or a
 * month. A click on a day shows it.
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
		const moved = !this.shown?.equals(shown) || !this.today?.equals(today);
		this.days = days;
		this.today = today;
		this.shown = shown;
		this.pick = pick;
		this.months = calendarMonths(days, today);
		if (moved || !this.week) {
			this.week = shown;
			this.monthIndex = this.monthOf(shown);
		}
		this.render();
	}

	private arrow(line: HTMLElement, path: string, step: number): HTMLButtonElement {
		const button = line.createEl("button", { cls: "th-cal-arrow" });
		const svg = button.appendChild(document.createElementNS(SVG_NS, "svg"));
		svg.setAttribute("viewBox", "0 0 24 24");
		svg.setAttribute("aria-hidden", "true");
		svg.appendChild(document.createElementNS(SVG_NS, "path")).setAttribute("d", path);
		button.addEventListener("click", () => this.turn(step));
		return button;
	}

	private toggle(): void {
		this.open = !this.open;
		if (this.open && this.week) this.monthIndex = this.monthOf(this.week);
		this.render();
	}

	/** A week or a month before or after the one on show, never past this week nor before the calendar starts. */
	private turn(step: number): void {
		const today = this.today;
		if (!today || !this.week) return;
		if (this.open) {
			this.monthIndex = Math.min(this.months.length - 1, Math.max(0, this.monthIndex + step));
		} else {
			const week = this.week.addDays(7 * step);
			if (!this.canShowWeek(week)) return;
			this.week = week;
		}
		this.render();
	}

	private canShowWeek(day: LocalDate): boolean {
		const today = this.today;
		const first = this.days[0]?.date;
		if (!today || !first) return false;
		return !this.monday(day).isAfter(this.monday(today)) && !this.monday(day).isBefore(this.monday(first));
	}

	private monday(day: LocalDate): LocalDate {
		return day.addDays(-WEEKDAYS.indexOf(day.weekday()));
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
		this.title.setAttr("aria-expanded", String(this.open));
		this.title.setAttr("aria-label", this.open ? "Show one week" : "Show the whole month");
		const month = this.open ? this.months[this.monthIndex] : this.monthOfWeek(week);
		if (month) this.title.setText(monthTitle(month, today));
		const rows = this.open && month ? monthWeeks(this.days, month, today) : [calendarWeek(this.days, week, today)];
		this.weeks.empty();
		for (const days of rows) {
			const row = this.weeks.createDiv("th-week-row");
			for (const day of days) this.renderDay(row, day, today);
		}
		this.previous.setAttr("aria-label", this.open ? "Previous month" : "Previous week");
		this.next.setAttr("aria-label", this.open ? "Next month" : "Next week");
		this.previous.disabled = this.open ? this.monthIndex <= 0 : !this.canShowWeek(week.addDays(-7));
		this.next.disabled = this.open ? this.monthIndex >= this.months.length - 1 : !this.canShowWeek(week.addDays(7));
	}

	/** The month a week belongs to: the one its Thursday is in, as calendars count weeks. */
	private monthOfWeek(day: LocalDate): CalendarMonth {
		const thursday = this.monday(day).addDays(3);
		return { year: thursday.year, month: thursday.month };
	}

	private renderDay(row: HTMLElement, day: CalendarDay, today: LocalDate): void {
		const off = day.future || day.outside;
		const percent = off ? null : donePercent(day);
		const title = dayTitle(day.date, today);
		const selected = this.shown?.equals(day.date) ?? false;
		const button = row.createEl("button", { cls: "th-cal-day", attr: { "aria-label": percent === null ? title : `${title}, ${percent}% done`, "aria-pressed": String(selected) } });
		button.toggleClass("is-selected", selected);
		button.toggleClass("is-today", day.date.equals(today));
		button.toggleClass("is-off", off);
		if (!off) this.renderRing(button, (percent ?? 0) / 100);
		button.createSpan("th-cal-date").createSpan({ cls: "th-cal-figure", text: String(day.date.day) });
		button.disabled = off;
		button.addEventListener("click", () => this.pick(day.date));
	}

	/** A ring around the date, its accent part as far round as the day was done. */
	private renderRing(button: HTMLElement, share: number): void {
		const svg = button.appendChild(document.createElementNS(SVG_NS, "svg"));
		svg.setAttribute("class", "th-cal-ring");
		svg.setAttribute("viewBox", `0 0 ${RING} ${RING}`);
		svg.setAttribute("aria-hidden", "true");
		const circle = (cls: string, length: number) => {
			const element = svg.appendChild(document.createElementNS(SVG_NS, "circle"));
			element.setAttribute("class", cls);
			element.setAttribute("cx", String(RING / 2));
			element.setAttribute("cy", String(RING / 2));
			element.setAttribute("r", String(RING_RADIUS));
			element.setAttribute("transform", `rotate(-90 ${RING / 2} ${RING / 2})`);
			element.setAttribute("stroke-dasharray", `${(RING_LENGTH * length).toFixed(2)} ${RING_LENGTH.toFixed(2)}`);
		};
		circle("th-cal-ring-track", 1);
		if (share > 0) circle("th-cal-ring-arc", share);
	}
}
