import { App, Notice } from "obsidian";
import { Habit, Part, TextPart } from "../domain/Habit";
import { LocalDate } from "../domain/LocalDate";
import { computeStats } from "../domain/Stats";
import { calendarStart, calendarWeeks } from "./calendar";
import { colorClass } from "./colors";
import { EditSheet, EditTarget } from "./EditSheet";
import { RECIPE_LABELS, dayMonth, describeChange, monthShort, recipeDays } from "./format";
import { UiContext } from "./UiContext";

const MIN_WEEKS = 26;

/** The habit's recipe, progress and history, drawn at the top of its note above the note's own text. */
export class HabitBlock {
	readonly el: HTMLElement;

	constructor(
		private readonly app: App,
		private readonly ui: UiContext,
		private path: string,
	) {
		this.el = createDiv({ cls: ["tiny-habits", "th-screen", "th-note-block"] });
		this.el.setAttribute("contenteditable", "false");
		for (const type of ["mousedown", "pointerdown", "click"]) this.el.addEventListener(type, (event) => event.stopPropagation());
	}

	get file(): string {
		return this.path;
	}

	moveTo(path: string): void {
		this.path = path;
		this.render();
	}

	render(): void {
		const page = this.el;
		page.empty();
		page.className = "tiny-habits th-screen th-note-block";
		const entry = this.ui.repository.get(this.path);
		if (!entry || entry.kind === "broken") {
			page.createDiv({ cls: "th-quiet", text: entry ? `Can't read this habit: ${entry.problem}` : "Habit not found" });
			return;
		}
		const habit = entry.habit;
		page.addClasses(["th-habit", colorClass(habit.color)]);
		if (habit.archived) this.renderArchived(page);
		this.renderRecipe(page, habit);
		this.renderProgress(page, habit);
		this.renderHistory(page, habit);
	}

	private renderArchived(page: HTMLElement): void {
		const banner = page.createDiv("th-archived");
		banner.createSpan({ cls: "th-archived-text", text: "Archived · hidden from Today" });
		const restore = banner.createEl("button", { cls: "th-link", text: "Restore" });
		restore.addEventListener("click", () => void this.run(() => this.ui.service.restore(this.path)));
	}

	private section(page: HTMLElement, title: string): HTMLElement {
		const section = page.createDiv("th-section");
		section.createEl("h2", { cls: "th-section-title", text: title });
		return section;
	}

	private renderRecipe(page: HTMLElement, habit: Habit): void {
		const section = page.createDiv("th-section th-section-first");
		section.createEl("h2", { cls: "th-section-title", text: "Recipe" });
		const grid = section.createDiv("th-recipe");
		const row = (part: Part, value: string | undefined, target: EditTarget) => {
			grid.createSpan({ cls: ["th-label", `th-recipe-label-${part}`], text: RECIPE_LABELS[part] });
			const cell = grid.createSpan({ cls: ["th-recipe-value", `th-recipe-value-${part}`], text: value ?? "add" });
			cell.toggleClass("is-empty", value === undefined);
			cell.addEventListener("click", () => this.edit(habit, target));
		};
		const text = (part: TextPart) => habit.text(part).current();
		row("anchor", text("anchor"), "anchor");
		row("tiny", text("tiny"), "tiny");
		row("full", text("full"), "full");
		row("celebration", text("celebration"), "celebration");
		row("schedule", recipeDays(habit.currentSchedule), "schedule");
	}

	private renderProgress(page: HTMLElement, habit: Habit): void {
		const today = this.ui.service.today();
		const stats = computeStats(habit, today);
		const section = this.section(page, "Progress");
		const numbers = section.createDiv("th-stats");
		const stat = (value: number, label: string) => {
			const item = numbers.createDiv("th-stat");
			item.createDiv({ cls: "th-stat-value", text: String(value) });
			item.createDiv({ cls: "th-stat-label", text: label });
		};
		stat(stats.current?.length ?? 0, "in a row");
		stat(stats.best, "best");
		stat(stats.total, "wins");
		this.renderYear(section, habit, today);
	}

	private renderYear(section: HTMLElement, habit: Habit, today: LocalDate): void {
		const year = section.createDiv("th-year");
		const labels = year.createDiv("th-year-labels");
		["M", "", "W", "", "F", "", ""].forEach((label) => labels.createSpan({ text: label }));
		const scroller = year.createDiv("th-year-scroll");
		const weeks = scroller.createDiv("th-year-weeks");
		const earliest = today.addDays(-7 * (MIN_WEEKS - 1));
		const start = calendarStart(habit, today);
		calendarWeeks(start.isBefore(earliest) ? start : earliest, today).forEach((week, index) => {
			const column = weeks.createDiv("th-year-week");
			const monthStart = week.find((date) => date?.day === 1) ?? (index === 0 ? week.find((date) => date) : undefined);
			column.createDiv({ cls: "th-year-month", text: monthStart ? monthShort(monthStart) : "" });
			for (const date of week) {
				const cell = column.createDiv("th-year-day");
				if (!date) {
					cell.addClass("is-future");
					continue;
				}
				const mark = habit.markOn(date);
				const state = mark ? mark.kind : date.isBefore(habit.createdOn) ? "before" : habit.isScheduled(date) ? "empty" : "off";
				cell.addClass(`is-${state}`);
				cell.toggleClass("is-today", date.equals(today));
				cell.setAttribute("aria-label", dayMonth(date));
			}
		});
		const toToday = () => {
			scroller.scrollLeft = scroller.scrollWidth;
		};
		toToday();
		window.requestAnimationFrame(toToday);
	}

	private renderHistory(page: HTMLElement, habit: Habit): void {
		const misses = habit.marks().flatMap(([date, mark]) => (mark.kind === "missed" ? [{ date, reason: mark.reason }] : []));
		const changes = habit.changes();
		if (misses.length === 0 && changes.length === 0) return;
		const section = this.section(page, "History");
		const row = (date: LocalDate, kind: "missed" | "change", text: string, note?: string) => {
			const item = section.createDiv("th-history-row");
			item.createSpan({ cls: "th-history-date", text: dayMonth(date) });
			item.createSpan({ cls: ["th-history-icon", `is-${kind}`] });
			const body = item.createSpan({ cls: "th-history-text", text });
			if (note) body.createSpan({ cls: "th-history-note", text: note });
		};
		if (misses.length) {
			section.createEl("h3", { cls: "th-subtitle", text: "Not today" });
			for (const miss of misses) row(miss.date, "missed", miss.reason);
		}
		if (changes.length) {
			section.createEl("h3", { cls: "th-subtitle", text: "Recipe changes" });
			for (const change of changes) row(change.date, "change", describeChange(change), change.because);
		}
	}

	private edit(habit: Habit, target: EditTarget): void {
		new EditSheet(this.app, this.ui.service, this.path, habit, target).open();
	}

	private async run(action: () => Promise<unknown>): Promise<void> {
		try {
			await action();
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		}
	}
}
