import { App, Notice, setIcon } from "obsidian";
import { Habit, TextPart } from "../domain/Habit";
import { LocalDate } from "../domain/LocalDate";
import { computeStats } from "../domain/Stats";
import { calendarStart, calendarWeeks } from "./calendar";
import { EditSheet } from "./EditSheet";
import { dayMonth, monthShort, recipeDays } from "./format";
import { UiContext } from "./UiContext";

const RECIPE_ICONS: Record<TextPart | "schedule", string> = {
	anchor: "anchor",
	tiny: "sprout",
	full: "trending-up",
	celebration: "party-popper",
	schedule: "calendar-days",
};
const SECTION_ICON = "layers";

/** Panels the reader folded, remembered while Obsidian is open. */
const folded = new Set<string>();
const openHistory = new Set<string>();

/** What the panel shows: everything, in the habit's note, or just the filled recipe fields, in Today's open card. */
export type HabitBlockView = "full" | "recipe";

/** The habit's own panel in its note, next to Properties: recipe, progress and history, above the note's text. */
export class HabitBlock {
	readonly el: HTMLElement;
	/** A redraw was asked for while a value was being typed; it runs when editing ends. */
	private stale = false;

	constructor(
		private readonly app: App,
		private readonly ui: UiContext,
		private path: string,
		private readonly view: HabitBlockView = "full",
	) {
		this.el = createDiv();
		this.el.setAttribute("contenteditable", "false");
		for (const type of ["mousedown", "pointerdown", "click"]) this.el.addEventListener(type, (event) => event.stopPropagation());
	}

	get file(): string {
		return this.path;
	}

	/** A recipe value is being typed: redrawing now would throw the unsaved text away. */
	private isEditing(): boolean {
		const active = document.activeElement;
		return active instanceof HTMLElement && active.isContentEditable && this.el.contains(active);
	}

	moveTo(path: string): void {
		this.path = path;
		this.render();
	}

	render(): void {
		if (this.isEditing()) {
			this.stale = true;
			return;
		}
		this.stale = false;
		const panel = this.el;
		panel.empty();
		panel.className = "metadata-container th-habit-panel";
		panel.toggleClass("is-collapsed", folded.has(this.path));
		const entry = this.ui.repository.get(this.path);
		const habit = entry?.kind === "ok" ? entry.habit : undefined;
		if (this.view === "recipe") {
			if (habit) this.renderRecipeFields(panel.createDiv("metadata-content").createDiv("metadata-properties"), habit, true);
			return;
		}
		this.renderHeading(panel);
		if (folded.has(this.path)) return;
		const content = panel.createDiv("metadata-content");
		if (!habit) {
			content.createDiv({ cls: "th-panel-quiet", text: entry?.kind === "broken" ? `Can't read this habit: ${entry.problem}` : "Habit not found" });
			return;
		}
		if (habit.archived) this.renderArchived(content);
		const rows = content.createDiv("metadata-properties");
		this.renderRecipe(rows, habit);
		this.renderProgress(rows, habit);
		this.renderHistory(rows, habit);
	}

	private renderHeading(panel: HTMLElement): void {
		const heading = panel.createDiv({ cls: "metadata-properties-heading", attr: { tabindex: "0" } });
		const fold = heading.createDiv({ cls: "collapse-indicator collapse-icon" });
		fold.toggleClass("is-collapsed", folded.has(this.path));
		setIcon(fold, "right-triangle");
		heading.createDiv({ cls: "metadata-properties-title", text: "Habit" });
		heading.addEventListener("click", () => {
			if (folded.has(this.path)) folded.delete(this.path);
			else folded.add(this.path);
			this.render();
		});
	}

	private renderArchived(panel: HTMLElement): void {
		const banner = panel.createDiv("th-archived");
		banner.createSpan({ cls: "th-archived-text", text: "Archived · hidden from Today" });
		const restore = banner.createEl("button", { cls: "mod-cta", text: "Restore" });
		restore.addEventListener("click", () => void this.run(() => this.ui.service.restore(this.path)));
	}

	/** One row of the panel, shaped like a property: icon and name on the left, the content on the right. */
	private property(rows: HTMLElement, icon: string, name: string): HTMLElement {
		const item = rows.createDiv("metadata-property th-habit-property");
		const key = item.createDiv("metadata-property-key");
		setIcon(key.createSpan("metadata-property-icon"), icon);
		const label = key.createEl("input", { cls: "metadata-property-key-input", type: "text", attr: { readonly: "true", tabindex: "-1" } });
		label.value = name;
		return item.createDiv("metadata-property-value");
	}

	private renderRecipe(rows: HTMLElement, habit: Habit): void {
		const labels = this.ui.labels();
		this.renderRecipeFields(rows, habit, false);
		const days = this.property(rows, RECIPE_ICONS.schedule, labels.of("schedule")).createDiv({ cls: "metadata-input-longtext th-habit-days", text: recipeDays(habit.currentSchedule) });
		days.addEventListener("click", () => new EditSheet(this.app, this.ui.service, this.path, habit, "schedule", labels).open());
		this.editable(this.property(rows, SECTION_ICON, "section"), habit.section ?? "", (next) => this.ui.service.setSection(this.path, next));
		if (!this.ui.settings().notAtTrigger) return;
		const anytime = this.property(rows, "unlink", "not at trigger").createEl("input", { cls: "metadata-input-checkbox", type: "checkbox", attr: { title: "Can also be done without the trigger" } });
		anytime.checked = habit.anytime;
		anytime.addEventListener("change", () => void this.run(() => this.ui.service.setAnytime(this.path, anytime.checked)));
	}

	/** The recipe's text parts as editable rows; `filledOnly` leaves out the empty ones. */
	private renderRecipeFields(rows: HTMLElement, habit: Habit, filledOnly: boolean): void {
		const labels = this.ui.labels();
		for (const part of ["anchor", "tiny", "full", "celebration"] as const satisfies readonly TextPart[]) {
			const value = habit.current(part) ?? "";
			if (filledOnly && !value) continue;
			this.editable(this.property(rows, RECIPE_ICONS[part], labels.of(part)), value, (next) => (next ? this.ui.service.replaceText(this.path, part, next) : this.ui.service.clearText(this.path, part)));
		}
	}

	/** A value edited in place like a text property, saved when the field loses focus. */
	private editable(parent: HTMLElement, value: string, change: (next: string) => Promise<unknown>): void {
		const input = parent.createDiv({ cls: "metadata-input-longtext", text: value, attr: { contenteditable: "true", spellcheck: "false", placeholder: "Empty" } });
		const save = () => {
			const next = (input.textContent ?? "").trim();
			if (next !== value) void this.run(() => change(next)).then(() => this.render());
			else if (this.stale) this.render();
		};
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				input.blur();
			}
			if (event.key === "Escape") {
				input.textContent = value;
				input.blur();
			}
		});
		input.addEventListener("blur", save);
	}

	private renderProgress(rows: HTMLElement, habit: Habit): void {
		const today = this.ui.service.today();
		const stats = computeStats(habit, today, this.ui.settings().wins);
		const numbers = this.property(rows, "flame", "progress").createDiv("th-panel-cell th-panel-stats");
		const stat = (value: number, label: string) => {
			const item = numbers.createSpan("th-panel-stat");
			item.createSpan({ cls: "th-panel-stat-value", text: String(value) });
			item.appendText(` ${label}`);
		};
		stat(stats.current?.length ?? 0, "in a row");
		stat(stats.best, "best");
		stat(stats.total, "wins");
		this.renderGrid(this.property(rows, "layout-grid", "calendar").createDiv("th-panel-cell"), habit, today);
	}

	/** Days as circles, a week per column up to today; it reaches back far enough to fill its row, so a new habit still shows a grid. */
	private renderGrid(cell: HTMLElement, habit: Habit, today: LocalDate): void {
		const year = cell.createDiv("th-year");
		const labels = year.createDiv("th-year-labels");
		["M", "", "W", "", "F", "", ""].forEach((label) => labels.createSpan({ text: label }));
		const scroller = year.createDiv("th-year-scroll");
		const weeks = scroller.createDiv("th-year-weeks");
		const draw = (from: LocalDate) => {
			weeks.empty();
			calendarWeeks(from, today).forEach((week, index) => this.renderWeek(weeks, week, index, habit, today));
			scroller.scrollLeft = scroller.scrollWidth;
		};
		const start = calendarStart(habit, today);
		draw(start);
		window.requestAnimationFrame(() => {
			const column = weeks.firstElementChild;
			if (!(column instanceof HTMLElement) || column.offsetWidth === 0) return;
			const gap = parseFloat(getComputedStyle(weeks).columnGap) || 0;
			const fits = Math.floor((scroller.clientWidth + gap) / (column.offsetWidth + gap));
			const filled = today.addDays(-7 * (fits - 1));
			if (filled.isBefore(start)) draw(filled);
			else scroller.scrollLeft = scroller.scrollWidth;
		});
	}

	private renderWeek(weeks: HTMLElement, week: Array<LocalDate | undefined>, index: number, habit: Habit, today: LocalDate): void {
		const column = weeks.createDiv("th-year-week");
		const monthStart = week.find((date) => date?.day === 1) ?? (index === 0 ? week.find((date) => date) : undefined);
		column.createDiv({ cls: "th-year-month", text: monthStart ? monthShort(monthStart) : "" });
		for (const date of week) {
			const day = column.createDiv("th-year-day");
			if (!date) {
				day.addClass("is-future");
				continue;
			}
			const mark = habit.markOn(date);
			const state = mark ? (mark.kind === "offTrigger" ? "off-trigger" : mark.kind) : date.isBefore(habit.createdOn) ? "before" : habit.isScheduled(date) ? "empty" : "off";
			day.addClass(`is-${state}`);
			day.toggleClass("is-today", date.equals(today));
			day.setAttribute("aria-label", dayMonth(date));
		}
	}


	private renderHistory(rows: HTMLElement, habit: Habit): void {
		const misses = habit.marks().flatMap(([date, mark]) => (mark.kind === "missed" ? [{ date, reason: mark.reason }] : []));
		const changes = habit.changes();
		if (misses.length === 0 && changes.length === 0) return;
		const open = openHistory.has(this.path);
		const cell = this.property(rows, "history", "history").createDiv("th-panel-cell th-panel-history");
		const toggle = cell.createDiv({ cls: "th-panel-history-toggle", attr: { role: "button", "aria-expanded": String(open) } });
		const summary = [misses.length ? `${misses.length} skipped` : "", changes.length ? `${changes.length} recipe ${changes.length === 1 ? "change" : "changes"}` : ""];
		toggle.createSpan({ text: summary.filter(Boolean).join(" · ") });
		setIcon(toggle.createSpan("th-panel-chevron"), "chevron-right");
		toggle.addEventListener("click", () => {
			if (open) openHistory.delete(this.path);
			else openHistory.add(this.path);
			this.render();
		});
		if (!open) return;
		const row = (date: LocalDate, kind: "missed" | "change", text: string, note?: string) => {
			const item = cell.createDiv("th-history-row");
			item.createSpan({ cls: "th-history-date", text: dayMonth(date) });
			item.createSpan({ cls: ["th-history-icon", `is-${kind}`] });
			const body = item.createSpan({ cls: "th-history-text", text });
			if (note) body.createSpan({ cls: "th-history-note", text: note });
		};
		for (const miss of misses) row(miss.date, "missed", miss.reason ?? "Skipped");
		for (const change of changes) row(change.date, "change", this.ui.labels().describeChange(change), change.because);
	}

	private async run(action: () => Promise<unknown>): Promise<void> {
		try {
			await action();
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		}
	}
}
