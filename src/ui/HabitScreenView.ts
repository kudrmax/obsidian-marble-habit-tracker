import { ItemView, Menu, Notice, ViewStateResult, WorkspaceLeaf } from "obsidian";
import { HabitEntry } from "../application/ports";
import { Habit, TextPart } from "../domain/Habit";
import { LocalDate } from "../domain/LocalDate";
import { computeStats } from "../domain/Stats";
import { calendarStart, calendarWeeks } from "./calendar";
import { colorClass } from "./colors";
import { DayWatcher } from "./DayWatcher";
import { EditSheet, EditTarget } from "./EditSheet";
import { FIELD_LABELS, PART_LABELS, dayMonth, describeChange, monthShort, scheduleLabel } from "./format";
import { UiContext } from "./UiContext";

export const HABIT_VIEW = "tiny-habits-habit";

const DAY_CHECK_MS = 60_000;
const MIN_WEEKS = 26;

export class HabitScreenView extends ItemView {
	override navigation = true;
	private path = "";

	constructor(
		leaf: WorkspaceLeaf,
		private readonly ui: UiContext,
	) {
		super(leaf);
		const watcher = new DayWatcher(ui.service, () => this.refresh());
		const check = () => watcher.check();
		this.registerDomEvent(window, "focus", check);
		this.registerDomEvent(document, "visibilitychange", check);
		this.registerInterval(window.setInterval(check, DAY_CHECK_MS));
	}

	override getViewType(): string {
		return HABIT_VIEW;
	}

	override getDisplayText(): string {
		const entry = this.entry();
		if (entry?.kind === "ok") return entry.habit.name;
		return entry?.name ?? "Habit";
	}

	override getIcon(): string {
		return "sprout";
	}

	override getState(): Record<string, unknown> {
		return { path: this.path };
	}

	override async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const path = (state as { path?: unknown } | null)?.path;
		if (typeof path === "string") this.path = path;
		this.render();
		await super.setState(state, result);
	}

	override onPaneMenu(menu: Menu, source: string): void {
		super.onPaneMenu(menu, source);
		const entry = this.entry();
		if (entry?.kind !== "ok") return;
		menu.addItem((item) => item.setTitle("Color").setIcon("palette").onClick(() => this.edit(entry.habit, "color")));
		menu.addItem((item) => item.setTitle("Open note").setIcon("file-text").onClick(() => void this.app.workspace.openLinkText(this.path, "", "tab")));
		menu.addItem((item) =>
			item
				.setTitle("Archive")
				.setIcon("archive")
				.onClick(() =>
					void this.run(async () => {
						await this.ui.service.archive(this.path);
						this.leaf.detach();
					}),
				),
		);
	}

	refresh(): void {
		this.render();
	}

	renamed(oldPath: string, newPath: string): void {
		if (this.path !== oldPath) return;
		this.path = newPath;
		this.render();
	}

	private entry(): HabitEntry | undefined {
		return this.path ? this.ui.repository.get(this.path) : undefined;
	}

	private render(): void {
		const root = this.contentEl;
		root.empty();
		const entry = this.entry();
		if (!entry || entry.kind === "broken") {
			const page = root.createDiv("tiny-habits th-screen");
			page.createEl("h1", { cls: "th-title", text: entry ? "Can't read this habit" : "Habit not found" });
			if (entry) page.createDiv({ cls: "th-quiet", text: entry.problem });
			return;
		}
		const habit = entry.habit;
		const page = root.createDiv({ cls: ["tiny-habits", "th-screen", "th-habit", colorClass(habit.color)] });
		const header = page.createDiv("th-screen-header");
		header.createSpan("th-screen-dot");
		header.createEl("h1", { cls: "th-title", text: habit.name });
		this.renderRecipe(page, habit);
		this.renderProgress(page, habit);
		this.renderHistory(page, habit);
	}

	private section(page: HTMLElement, title: string): HTMLElement {
		const section = page.createDiv("th-section");
		section.createEl("h2", { cls: "th-section-title", text: title });
		return section;
	}

	private renderRecipe(page: HTMLElement, habit: Habit): void {
		const section = this.section(page, "Recipe");
		const main = section.createDiv("th-recipe");
		const details = section.createDiv("th-recipe");
		const row = (grid: HTMLElement, label: string, value: string | undefined, target: EditTarget, isMain = false) => {
			grid.createSpan({ cls: "th-label", text: label });
			const cell = grid.createSpan({ cls: "th-recipe-value", text: value ?? "add" });
			cell.toggleClass("is-main", isMain);
			cell.toggleClass("is-empty", value === undefined);
			cell.addEventListener("click", () => this.edit(habit, target));
		};
		const text = (part: TextPart) => habit.text(part).current();
		row(main, FIELD_LABELS.anchor, text("anchor"), "anchor", true);
		row(main, FIELD_LABELS.tiny, text("tiny"), "tiny", true);
		row(details, PART_LABELS.full, text("full"), "full");
		row(details, PART_LABELS.celebration, text("celebration"), "celebration");
		row(details, PART_LABELS.schedule, scheduleLabel(habit.currentSchedule), "schedule");
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
