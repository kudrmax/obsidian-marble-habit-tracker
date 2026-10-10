import { App, Notice, setIcon } from "obsidian";
import { Habit, TextPart } from "../domain/Habit";
import { LocalDate } from "../domain/LocalDate";
import { computeStats } from "../domain/Stats";
import { calendarStart, calendarWeeks } from "./calendar";
import { colorClass } from "./colors";
import { EditSheet } from "./EditSheet";
import { RECIPE_LABELS, dayMonth, describeChange, monthShort, recipeDays } from "./format";
import { UiContext } from "./UiContext";

const MIN_WEEKS = 12;
const RECIPE_ICONS: Record<TextPart | "schedule", string> = {
	anchor: "anchor",
	tiny: "sprout",
	full: "trending-up",
	celebration: "party-popper",
	schedule: "calendar-days",
};

/** Panels the reader folded, remembered while Obsidian is open. */
const folded = new Set<string>();
const openHistory = new Set<string>();

/** The habit's own panel in its note, next to Properties: recipe, progress and history, above the note's text. */
export class HabitBlock {
	readonly el: HTMLElement;

	constructor(
		private readonly app: App,
		private readonly ui: UiContext,
		private path: string,
	) {
		this.el = createDiv();
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
		const panel = this.el;
		panel.empty();
		panel.className = "metadata-container th-habit-panel";
		panel.toggleClass("is-collapsed", folded.has(this.path));
		const entry = this.ui.repository.get(this.path);
		const habit = entry?.kind === "ok" ? entry.habit : undefined;
		if (habit) panel.addClasses(["th-habit", colorClass(habit.color)]);
		this.renderHeading(panel);
		if (folded.has(this.path)) return;
		const content = panel.createDiv("metadata-content");
		if (!habit) {
			content.createDiv({ cls: "th-panel-quiet", text: entry?.kind === "broken" ? `Can't read this habit: ${entry.problem}` : "Habit not found" });
			return;
		}
		if (habit.archived) this.renderArchived(content);
		this.renderRecipe(content, habit);
		this.renderProgress(content, habit);
		this.renderHistory(content, habit);
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

	private renderRecipe(content: HTMLElement, habit: Habit): void {
		const rows = content.createDiv("metadata-properties");
		const row = (part: TextPart | "schedule", value: string | undefined) => {
			const item = rows.createDiv("metadata-property th-habit-property");
			const key = item.createDiv("metadata-property-key");
			setIcon(key.createSpan("metadata-property-icon"), RECIPE_ICONS[part]);
			const label = key.createEl("input", { cls: "metadata-property-key-input", type: "text", attr: { readonly: "true", tabindex: "-1" } });
			label.value = RECIPE_LABELS[part];
			const valueEl = item.createDiv("metadata-property-value");
			if (part === "schedule") {
				const days = valueEl.createDiv({ cls: "metadata-input-longtext th-habit-days", text: value ?? "" });
				days.addEventListener("click", () => new EditSheet(this.app, this.ui.service, this.path, habit, "schedule").open());
				return;
			}
			this.editable(valueEl, part, value ?? "");
		};
		const text = (part: TextPart) => habit.text(part).current();
		row("anchor", text("anchor"));
		row("tiny", text("tiny"));
		row("full", text("full"));
		row("celebration", text("celebration"));
		row("schedule", recipeDays(habit.currentSchedule));
	}

	/** A value edited in place like a text property: saving starts a new version of that part of the recipe. */
	private editable(parent: HTMLElement, part: TextPart, value: string): void {
		const input = parent.createDiv({ cls: "metadata-input-longtext", text: value, attr: { contenteditable: "true", spellcheck: "false", placeholder: "Empty" } });
		const save = () => {
			const next = (input.textContent ?? "").trim();
			if (next === value) return;
			void this.run(() => this.ui.service.replaceText(this.path, part, next)).then(() => this.render());
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

	private renderProgress(panel: HTMLElement, habit: Habit): void {
		const today = this.ui.service.today();
		const stats = computeStats(habit, today);
		const numbers = panel.createDiv("th-panel-stats");
		const stat = (value: number, label: string) => {
			const item = numbers.createDiv("th-panel-stat");
			item.createDiv({ cls: "th-panel-stat-value", text: String(value) });
			item.createDiv({ cls: "th-panel-stat-label", text: label });
		};
		stat(stats.current?.length ?? 0, "in a row");
		stat(stats.best, "best");
		stat(stats.total, "wins");
		this.renderGrid(panel, habit, today);
	}

	private renderGrid(panel: HTMLElement, habit: Habit, today: LocalDate): void {
		const year = panel.createDiv("th-year");
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

	private renderHistory(panel: HTMLElement, habit: Habit): void {
		const misses = habit.marks().flatMap(([date, mark]) => (mark.kind === "missed" ? [{ date, reason: mark.reason }] : []));
		const changes = habit.changes();
		if (misses.length === 0 && changes.length === 0) return;
		const open = openHistory.has(this.path);
		const toggle = panel.createEl("button", { cls: "th-panel-history", attr: { "aria-expanded": String(open) } });
		setIcon(toggle.createSpan("th-panel-chevron"), "chevron-right");
		const summary = [misses.length ? `${misses.length} skipped` : "", changes.length ? `${changes.length} recipe ${changes.length === 1 ? "change" : "changes"}` : ""];
		toggle.createSpan({ text: `History · ${summary.filter(Boolean).join(" · ")}` });
		toggle.addEventListener("click", () => {
			if (open) openHistory.delete(this.path);
			else openHistory.add(this.path);
			this.render();
		});
		if (!open) return;
		const list = panel.createDiv("th-panel-history-list");
		const row = (date: LocalDate, kind: "missed" | "change", text: string, note?: string) => {
			const item = list.createDiv("th-history-row");
			item.createSpan({ cls: "th-history-date", text: dayMonth(date) });
			item.createSpan({ cls: ["th-history-icon", `is-${kind}`] });
			const body = item.createSpan({ cls: "th-history-text", text });
			if (note) body.createSpan({ cls: "th-history-note", text: note });
		};
		for (const miss of misses) row(miss.date, "missed", miss.reason);
		for (const change of changes) row(change.date, "change", describeChange(change), change.because);
	}

	private async run(action: () => Promise<unknown>): Promise<void> {
		try {
			await action();
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		}
	}
}
