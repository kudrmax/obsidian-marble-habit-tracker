import { ItemView, Notice, ViewStateResult, WorkspaceLeaf } from "obsidian";
import { HabitEntry } from "../application/ports";
import { Habit, Part, TextPart } from "../domain/Habit";
import { LocalDate, WEEKDAYS } from "../domain/LocalDate";
import { missesInARow, needsRedesign } from "../domain/RedesignRule";
import { HabitStats, WINDOW_DAYS, computeStats } from "../domain/Stats";
import { calendarStart, calendarWeeks } from "./calendar";
import { ColorPicker } from "./ColorPicker";
import { colorClass } from "./colors";
import { ScheduleModal, TextComponentModal } from "./ComponentModal";
import { DayWatcher } from "./DayWatcher";
import { BREAKDOWN_LABELS, dayMonth, describeChange, monthShort, scheduleLabel, weekdayShort } from "./format";
import { PartPickerModal } from "./PartPickerModal";
import { UiContext } from "./UiContext";

export const HABIT_VIEW = "tiny-habits-habit";

const BREAKDOWN_ORDER = ["full", "tiny", "missed", "empty"] as const;
const DAY_CHECK_MS = 60_000;

function section(root: HTMLElement, title: string): HTMLElement {
	const block = root.createDiv("th-section");
	block.createDiv({ cls: "th-section-title", text: title });
	return block;
}

export class HabitScreenView extends ItemView {
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
			page.createDiv({ cls: "th-empty-title", text: entry ? "Can't read this habit" : "Habit not found" });
			if (entry) page.createDiv({ cls: "th-empty-hint", text: entry.problem });
			return;
		}
		const habit = entry.habit;
		const today = this.ui.service.today();
		const stats = computeStats(habit, today);
		const page = root.createDiv({ cls: ["tiny-habits", "th-screen", "th-habit", colorClass(habit.color)] });
		page.createDiv({ cls: "th-screen-title", text: habit.name });
		this.renderRecipe(page, habit);
		if (needsRedesign(habit, this.ui.settings().redesignThreshold)) this.renderRedesign(page, habit);
		this.renderStats(page, stats);
		this.renderCalendar(page, habit, today);
		this.renderStreaks(page, stats);
		this.renderMisses(page, habit);
		this.renderHistory(page, habit);
		this.renderFooter(page);
	}

	private renderRecipe(page: HTMLElement, habit: Habit): void {
		const recipe = page.createDiv("th-recipe");
		const sentence = recipe.createDiv("th-recipe-sentence");
		sentence.appendText("After I ");
		this.editable(sentence, "anchor", habit.text("anchor").current());
		sentence.appendText(", I'll ");
		this.editable(sentence, "tiny", habit.text("tiny").current());
		sentence.appendText(".");

		const details = recipe.createDiv("th-recipe-details");
		const detail = (label: string, fill: (value: HTMLElement) => void) => {
			const row = details.createDiv("th-recipe-detail");
			row.createDiv({ cls: "th-recipe-label", text: label });
			fill(row.createDiv("th-recipe-value"));
		};
		detail("Aiming for", (value) => this.editable(value, "full", habit.text("full").current()));
		detail("Celebrate", (value) => this.editable(value, "celebration", habit.text("celebration").current()));
		detail("Schedule", (value) => this.editable(value, "schedule", scheduleLabel(habit.currentSchedule)));
		detail("Color", (value) => {
			new ColorPicker(value, habit.color, (color) => void this.run(() => this.ui.service.setColor(this.path, color)));
		});
	}

	private editable(parent: HTMLElement, part: Part, value: string | undefined): void {
		const span = parent.createSpan({ cls: value ? "th-editable" : "th-editable is-empty", text: value ?? "add" });
		span.addEventListener("click", () => this.editPart(part));
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
			}, entry.habit.color).open();
			return;
		}
		const textPart: TextPart = part;
		new TextComponentModal(this.app, textPart, entry.habit.text(textPart).current(), {
			replace: (value, because) => service.replaceText(path, textPart, value, because),
			correct: (value) => service.correctText(path, textPart, value),
		}, entry.habit.color).open();
	}

	private renderRedesign(page: HTMLElement, habit: Habit): void {
		const banner = page.createDiv("th-banner");
		const text = banner.createDiv("th-banner-text");
		text.createDiv({ cls: "th-banner-title", text: `${missesInARow(habit)} misses in a row` });
		text.createDiv({ cls: "th-banner-hint", text: "It's the recipe, not you. Try a different anchor or make it even tinier." });
		banner.createEl("button", { cls: "th-pill th-pill-habit", text: "Redesign" }).addEventListener("click", () => {
			new PartPickerModal(this.app, (part) => this.editPart(part)).open();
		});
	}

	private renderStats(page: HTMLElement, stats: HabitStats): void {
		const block = section(page, `Last ${WINDOW_DAYS} days`);
		const tiles = block.createDiv("th-tiles");
		const tile = (value: string, label: string) => {
			const item = tiles.createDiv("th-tile");
			item.createDiv({ cls: "th-tile-value", text: value });
			item.createDiv({ cls: "th-tile-label", text: label });
		};
		const { window: period } = stats;
		tile(period.percent === null ? "—" : `${period.percent}%`, `${period.done} of ${period.scheduled} planned days`);
		tile(String(stats.current?.length ?? 0), "Current streak");
		tile(String(stats.best), "Best streak");
		tile(String(stats.total), "Times done");
		const bar = block.createDiv("th-bar");
		const legend = block.createDiv("th-legend");
		for (const kind of BREAKDOWN_ORDER) {
			const count = period.breakdown[kind];
			if (count) bar.createDiv(`th-bar-part is-${kind}`).style.flexGrow = String(count);
			const item = legend.createDiv(`th-legend-item is-${kind}`);
			item.createSpan("th-legend-dot");
			item.createSpan({ text: `${BREAKDOWN_LABELS[kind]} ${count}` });
		}
	}

	private renderCalendar(page: HTMLElement, habit: Habit, today: LocalDate): void {
		const block = section(page, "Calendar");
		const changes = habit.changes();
		const changed = new Set(changes.map((change) => change.date.toString()));
		const wrap = block.createDiv("th-calendar-wrap");
		const weekdays = wrap.createDiv("th-calendar-weekdays");
		weekdays.createDiv("th-calendar-month");
		WEEKDAYS.forEach((day, index) => weekdays.createDiv({ cls: "th-calendar-weekday", text: index % 2 === 0 ? weekdayShort(day) : "" }));
		const scroller = wrap.createDiv("th-calendar-scroller");
		const calendar = scroller.createDiv("th-calendar");
		calendarWeeks(calendarStart(habit, today), today).forEach((week, weekIndex) => {
			const column = calendar.createDiv("th-calendar-week");
			const monthStart = week.find((date) => date?.day === 1) ?? (weekIndex === 0 ? week.find((date) => date) : undefined);
			column.createDiv({ cls: "th-calendar-month", text: monthStart ? monthShort(monthStart) : "" });
			for (const date of week) {
				const cell = column.createDiv("th-calendar-day");
				if (!date) {
					cell.addClass("is-future");
					continue;
				}
				const mark = habit.markOn(date);
				const state = mark ? mark.kind : date.isBefore(habit.createdOn) ? "before" : habit.isScheduled(date) ? "empty" : "off";
				cell.addClass(`is-${state}`);
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
		});
		const scrollToToday = () => {
			scroller.scrollLeft = scroller.scrollWidth;
		};
		scrollToToday();
		window.requestAnimationFrame(scrollToToday);
	}

	private renderStreaks(page: HTMLElement, stats: HabitStats): void {
		const block = section(page, "Streaks");
		if (stats.streaks.length === 0) {
			block.createDiv({ cls: "th-quiet", text: "Your first streak starts with one tiny day." });
			return;
		}
		const longest = Math.max(...stats.streaks.map((streak) => streak.length));
		for (const streak of stats.streaks) {
			const isCurrent = streak === stats.current;
			const row = block.createDiv("th-streak");
			const track = row.createDiv("th-streak-track");
			const bar = track.createDiv(isCurrent ? "th-streak-bar is-current" : "th-streak-bar");
			bar.style.width = `${(streak.length / longest) * 100}%`;
			row.createDiv({ cls: "th-streak-length", text: `${streak.length} ${streak.length === 1 ? "day" : "days"}` });
			row.createDiv({ cls: "th-streak-dates", text: `${dayMonth(streak.start)} – ${isCurrent ? "now" : dayMonth(streak.end)}` });
		}
	}

	private renderMisses(page: HTMLElement, habit: Habit): void {
		const block = section(page, "What got in the way");
		const misses = habit.marks().flatMap(([date, mark]) => (mark.kind === "missed" ? [{ date, reason: mark.reason }] : []));
		if (misses.length === 0) {
			block.createDiv({ cls: "th-quiet", text: "Nothing yet." });
			return;
		}
		const list = block.createDiv("th-list");
		for (const miss of misses) {
			const row = list.createDiv("th-list-row");
			row.createDiv({ cls: "th-list-date", text: dayMonth(miss.date) });
			row.createDiv({ cls: "th-list-text", text: miss.reason });
		}
	}

	private renderHistory(page: HTMLElement, habit: Habit): void {
		const block = section(page, "Recipe history");
		const list = block.createDiv("th-list");
		for (const change of habit.changes()) {
			const row = list.createDiv("th-list-row");
			row.createDiv({ cls: "th-list-date", text: dayMonth(change.date) });
			const body = row.createDiv("th-list-text");
			body.createDiv({ text: describeChange(change) });
			if (change.because) body.createDiv({ cls: "th-list-note", text: change.because });
		}
		const created = list.createDiv("th-list-row");
		created.createDiv({ cls: "th-list-date", text: dayMonth(habit.createdOn) });
		created.createDiv({ cls: "th-list-text", text: "Habit created" });
	}

	private renderFooter(page: HTMLElement): void {
		const footer = page.createDiv("th-actions-row th-footer");
		footer.createEl("button", { cls: "th-pill", text: "Open note" }).addEventListener("click", () => {
			void this.app.workspace.openLinkText(this.path, "", "tab");
		});
		footer.createEl("button", { cls: "th-pill", text: "Archive" }).addEventListener("click", () => {
			void this.run(async () => {
				await this.ui.service.archive(this.path);
				this.leaf.detach();
			});
		});
	}

	private async run(action: () => Promise<unknown>): Promise<void> {
		try {
			await action();
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		}
	}
}
