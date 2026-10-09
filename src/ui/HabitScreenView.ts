import { ItemView, Notice, ViewStateResult, WorkspaceLeaf } from "obsidian";
import { HabitEntry } from "../application/ports";
import { Habit, Part, TEXT_PARTS } from "../domain/Habit";
import { LocalDate } from "../domain/LocalDate";
import { missesInARow, needsRedesign } from "../domain/RedesignRule";
import { HabitStats, WINDOW_DAYS, computeStats } from "../domain/Stats";
import { calendarStart, calendarWeeks } from "./calendar";
import { ScheduleModal, TextComponentModal } from "./ComponentModal";
import { BREAKDOWN_LABELS, PART_LABELS, dayMonth, describeChange, scheduleLabel } from "./format";
import { PartPickerModal } from "./PartPickerModal";
import { UiContext } from "./UiContext";

export const HABIT_VIEW = "tiny-habits-habit";

const BREAKDOWN_ORDER = ["tiny", "full", "missed", "empty"] as const;
const STREAK_BAR_PX = 200;

function section(root: HTMLElement, title: string): void {
	root.createEl("h4", { cls: "th-section", text: title });
}

export class HabitScreenView extends ItemView {
	private path = "";

	constructor(
		leaf: WorkspaceLeaf,
		private readonly ui: UiContext,
	) {
		super(leaf);
	}

	override getViewType(): string {
		return HABIT_VIEW;
	}

	override getDisplayText(): string {
		const entry = this.entry();
		if (entry?.kind === "ok") return entry.habit.name;
		return entry?.name ?? "Привычка";
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
		root.addClass("tiny-habits", "th-screen");
		const entry = this.entry();
		if (!entry) {
			root.createDiv({ cls: "th-empty", text: "Привычка не найдена" });
			return;
		}
		if (entry.kind === "broken") {
			root.createDiv({ cls: "th-empty", text: `Не удалось прочитать: ${entry.problem}` });
			return;
		}
		const habit = entry.habit;
		const today = this.ui.service.today();
		const stats = computeStats(habit, today);
		root.createDiv({ cls: "th-screen-title", text: habit.name });
		root.createDiv({ cls: "th-muted", text: scheduleLabel(habit.currentSchedule) });
		this.renderRecipe(root, habit);
		if (needsRedesign(habit, this.ui.settings().redesignThreshold)) this.renderRedesign(root, habit);
		this.renderStats(root, stats);
		this.renderCalendar(root, habit, today);
		this.renderStreaks(root, stats);
		this.renderMisses(root, habit);
		this.renderHistory(root, habit);
		this.renderFooter(root);
	}

	private renderRecipe(root: HTMLElement, habit: Habit): void {
		const recipe = root.createDiv("th-recipe");
		const row = (part: Part, value: string | undefined) => {
			const line = recipe.createDiv("th-recipe-row");
			line.createSpan({ cls: "th-recipe-key", text: PART_LABELS[part] });
			line.createSpan({ cls: value ? "th-recipe-value" : "th-recipe-value is-empty", text: value ?? "добавить" });
			line.addEventListener("click", () => this.editPart(part));
		};
		for (const part of TEXT_PARTS) row(part, habit.text(part).current());
		row("schedule", scheduleLabel(habit.currentSchedule));
	}

	private editPart(part: Part): void {
		const entry = this.entry();
		if (entry?.kind !== "ok") return;
		const { service } = this.ui;
		const path = this.path;
		if (part === "schedule") {
			new ScheduleModal(this.app, entry.habit.currentSchedule, {
				replace: (days, because) => service.replaceSchedule(path, days, because),
				correct: (days) => service.correctSchedule(path, days),
			}).open();
			return;
		}
		new TextComponentModal(this.app, part, entry.habit.text(part).current(), {
			replace: (value, because) => service.replaceText(path, part, value, because),
			correct: (value) => service.correctText(path, part, value),
		}).open();
	}

	private renderRedesign(root: HTMLElement, habit: Habit): void {
		const banner = root.createDiv("th-banner");
		banner.createSpan({
			text: `${missesInARow(habit)} «не получилось» подряд после последнего выполнения. Может, переделать рецепт?`,
		});
		banner.createEl("button", { cls: "mod-cta", text: "Переделать" }).addEventListener("click", () => {
			new PartPickerModal(this.app, (part) => this.editPart(part)).open();
		});
	}

	private renderStats(root: HTMLElement, stats: HabitStats): void {
		section(root, `Последние ${WINDOW_DAYS} дней`);
		const tiles = root.createDiv("th-tiles");
		const tile = (value: string, label: string) => {
			const item = tiles.createDiv("th-tile");
			item.createDiv({ cls: "th-tile-value", text: value });
			item.createDiv({ cls: "th-muted", text: label });
		};
		const { window: period } = stats;
		tile(period.percent === null ? "—" : `${period.percent}%`, `${period.done} из ${period.scheduled} запланированных дней`);
		tile(String(stats.current?.length ?? 0), "текущая серия");
		tile(String(stats.best), "лучшая серия");
		tile(String(stats.total), "всего выполнений");
		const bar = root.createDiv("th-bar");
		const legend = root.createDiv("th-legend");
		for (const kind of BREAKDOWN_ORDER) {
			const count = period.breakdown[kind];
			if (count) bar.createDiv(`th-bar-part is-${kind}`).style.flexGrow = String(count);
			const item = legend.createSpan(`th-legend-item is-${kind}`);
			item.createSpan("th-legend-dot");
			item.appendText(`${BREAKDOWN_LABELS[kind]} ${count}`);
		}
	}

	private renderCalendar(root: HTMLElement, habit: Habit, today: LocalDate): void {
		section(root, "Календарь");
		const changes = habit.changes();
		const changed = new Set(changes.map((change) => change.date.toString()));
		const scroller = root.createDiv("th-calendar-scroller");
		const calendar = scroller.createDiv("th-calendar");
		for (const week of calendarWeeks(calendarStart(habit, today), today)) {
			const column = calendar.createDiv("th-calendar-week");
			for (const date of week) {
				const cell = column.createDiv("th-calendar-day");
				if (!date) {
					cell.addClass("is-future");
					continue;
				}
				const mark = habit.markOn(date);
				cell.addClass(mark ? `is-${mark.kind}` : habit.isScheduled(date) ? "is-empty" : "is-off");
				cell.setAttribute("aria-label", dayMonth(date));
				if (!changed.has(date.toString())) continue;
				cell.addClass("is-changed");
				cell.addEventListener("click", () => {
					new Notice(
						changes
							.filter((change) => change.date.equals(date))
							.map(describeChange)
							.join("\n"),
					);
				});
			}
		}
		const scrollToToday = () => {
			scroller.scrollLeft = scroller.scrollWidth;
		};
		scrollToToday();
		window.requestAnimationFrame(scrollToToday);
	}

	private renderStreaks(root: HTMLElement, stats: HabitStats): void {
		section(root, "Серии");
		if (stats.streaks.length === 0) {
			root.createDiv({ cls: "th-muted", text: "Пока нет" });
			return;
		}
		const longest = Math.max(...stats.streaks.map((streak) => streak.length));
		for (const streak of stats.streaks) {
			const isCurrent = streak === stats.current;
			const row = root.createDiv("th-streak");
			const bar = row.createDiv(isCurrent ? "th-streak-bar is-current" : "th-streak-bar");
			bar.style.width = `${Math.max(6, Math.round((streak.length / longest) * STREAK_BAR_PX))}px`;
			row.createSpan({
				text: `${streak.length} · ${dayMonth(streak.start)} – ${isCurrent ? "сейчас" : dayMonth(streak.end)}`,
			});
		}
	}

	private renderMisses(root: HTMLElement, habit: Habit): void {
		section(root, "Не получилось");
		const misses = habit.marks().flatMap(([date, mark]) => (mark.kind === "missed" ? [{ date, reason: mark.reason }] : []));
		if (misses.length === 0) {
			root.createDiv({ cls: "th-muted", text: "Пока нет" });
			return;
		}
		for (const miss of misses) {
			const row = root.createDiv("th-list-row");
			row.createSpan({ cls: "th-list-date", text: dayMonth(miss.date) });
			row.createSpan({ text: miss.reason });
		}
	}

	private renderHistory(root: HTMLElement, habit: Habit): void {
		section(root, "История рецепта");
		for (const change of habit.changes()) {
			const row = root.createDiv("th-list-row");
			row.createSpan({ cls: "th-list-date", text: dayMonth(change.date) });
			const body = row.createDiv();
			body.createDiv({ text: describeChange(change) });
			if (change.because) body.createDiv({ cls: "th-muted", text: change.because });
		}
		const created = root.createDiv("th-list-row");
		created.createSpan({ cls: "th-list-date", text: dayMonth(habit.createdOn) });
		created.createSpan({ text: "создана" });
	}

	private renderFooter(root: HTMLElement): void {
		const footer = root.createDiv("th-buttons th-footer");
		footer.createEl("button", { text: "Открыть заметку" }).addEventListener("click", () => {
			void this.app.workspace.openLinkText(this.path, "", "tab");
		});
		footer.createEl("button", { text: "Архивировать" }).addEventListener("click", () => void this.archive());
	}

	private async archive(): Promise<void> {
		try {
			await this.ui.service.archive(this.path);
			this.leaf.detach();
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		}
	}
}
