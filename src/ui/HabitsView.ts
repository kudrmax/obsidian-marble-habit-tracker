import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import { HabitEntry } from "../application/ports";
import { FULL, TINY, missed } from "../domain/DayMark";
import { Habit } from "../domain/Habit";
import { LocalDate } from "../domain/LocalDate";
import { needsRedesign } from "../domain/RedesignRule";
import { computeStats } from "../domain/Stats";
import { celebrate } from "./CelebrationOverlay";
import { cellLook } from "./chain";
import { celebrationText, recipeLine, weekdayShort } from "./format";
import { MissReasonModal } from "./MissReasonModal";
import { visibleEntries } from "./order";
import { DayWatcher } from "./DayWatcher";
import { ScrollAnchor } from "./ScrollAnchor";
import { UiContext } from "./UiContext";

export const HABITS_VIEW = "tiny-habits-grid";

const PAGE_DAYS = 60;
const LONG_PRESS_MS = 500;
const LOAD_MORE_THRESHOLD_PX = 200;

const DAY_CHECK_MS = 60_000;

export class HabitsView extends ItemView {
	private daysShown = PAGE_DAYS;
	private scroller: HTMLElement | null = null;
	private readonly anchor = new ScrollAnchor();
	private readonly resizes = new ResizeObserver(() => this.applyAnchor());

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
		return HABITS_VIEW;
	}

	override getDisplayText(): string {
		return "Привычки";
	}

	override getIcon(): string {
		return "sprout";
	}

	override async onOpen(): Promise<void> {
		this.register(() => this.resizes.disconnect());
		this.render();
	}

	refresh(): void {
		this.render();
	}

	private applyAnchor(): void {
		if (this.scroller) this.scroller.scrollLeft = this.anchor.scrollLeft(this.scroller);
	}

	private render(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass("tiny-habits");
		const header = root.createDiv("th-header");
		header.createDiv({ cls: "th-title", text: "Привычки" });
		const actions = header.createDiv("th-actions");
		this.button(actions, "‹", "Раньше", () => this.page(-1));
		this.button(actions, "›", "Позже", () => this.page(1));
		this.button(actions, "+", "Новая привычка", () => this.ui.newHabit());

		const entries = visibleEntries(this.ui.repository.list());
		if (entries.length === 0) {
			this.scroller = null;
			const empty = root.createDiv("th-empty");
			empty.createDiv({ text: "Привычек пока нет" });
			this.button(empty, "Новая привычка", "Новая привычка", () => this.ui.newHabit());
			return;
		}

		const today = this.ui.service.today();
		const days = Array.from({ length: this.daysShown }, (_, index) => today.addDays(index - this.daysShown + 1));
		const grid = root.createDiv("th-grid");
		const names = grid.createDiv("th-names");
		names.createDiv("th-corner");
		const scroller = grid.createDiv("th-scroller");
		this.scroller = scroller;
		this.resizes.disconnect();
		this.resizes.observe(scroller);

		const dates = scroller.createDiv("th-row th-dates");
		for (const day of days) {
			const cell = dates.createDiv(day.equals(today) ? "th-date is-today" : "th-date");
			cell.createDiv({ text: weekdayShort(day.weekday()) });
			cell.createDiv({ cls: "th-date-number", text: String(day.day) });
		}
		for (const entry of entries) {
			this.renderName(names, entry);
			const row = scroller.createDiv("th-row");
			if (entry.kind === "broken") continue;
			for (const day of days) this.renderCell(row, entry.path, entry.habit, day);
		}
		this.applyAnchor();
		scroller.addEventListener("scroll", () => {
			this.anchor.remember(scroller);
			if (scroller.scrollLeft < LOAD_MORE_THRESHOLD_PX) this.loadMore();
		});
	}

	private renderName(parent: HTMLElement, entry: HabitEntry): void {
		const cell = parent.createDiv("th-name");
		if (entry.kind === "broken") {
			cell.addClass("is-broken");
			cell.createDiv({ cls: "th-name-title", text: entry.name });
			cell.createDiv({ cls: "th-name-sub", text: `Не удалось прочитать: ${entry.problem}` });
			cell.addEventListener("click", () => void this.app.workspace.openLinkText(entry.path, "", "tab"));
			return;
		}
		const title = cell.createDiv({ cls: "th-name-title", text: entry.habit.name });
		if (needsRedesign(entry.habit, this.ui.settings().redesignThreshold)) title.createSpan({ cls: "th-redesign", text: " ↻" });
		cell.createDiv({ cls: "th-name-sub", text: recipeLine(entry.habit) });
		cell.addEventListener("click", () => this.ui.openHabit(entry.path));
	}

	private renderCell(row: HTMLElement, path: string, habit: Habit, day: LocalDate): void {
		const look = cellLook(habit, day);
		const cell = row.createDiv("th-cell");
		cell.toggleClass("is-off", !look.scheduled && !look.mark);
		cell.toggleClass("join-left", look.joinLeft);
		cell.toggleClass("join-right", look.joinRight);
		if (look.mark) cell.addClass(`is-${look.mark.kind}`);
		cell.createDiv("th-dot");
		this.bindCell(
			cell,
			() => void this.tap(path, habit, day),
			() => this.openMiss(path, habit, day),
		);
	}

	private bindCell(cell: HTMLElement, onTap: () => void, onLongPress: () => void): void {
		let timer = 0;
		let longPressed = false;
		const cancel = () => window.clearTimeout(timer);
		cell.addEventListener("pointerdown", () => {
			longPressed = false;
			timer = window.setTimeout(() => {
				longPressed = true;
				onLongPress();
			}, LONG_PRESS_MS);
		});
		for (const type of ["pointerup", "pointerleave", "pointercancel"]) cell.addEventListener(type, cancel);
		cell.addEventListener("contextmenu", (event) => {
			event.preventDefault();
			cancel();
			if (longPressed) return;
			longPressed = true;
			onLongPress();
		});
		cell.addEventListener("click", () => {
			if (!longPressed) onTap();
		});
	}

	private async tap(path: string, habit: Habit, day: LocalDate): Promise<void> {
		if (habit.markOn(day)?.kind === "missed") {
			this.openMiss(path, habit, day);
			return;
		}
		await this.run(async () => this.celebrateIfDone(await this.ui.service.cycle(path, day), day));
	}

	private openMiss(path: string, habit: Habit, day: LocalDate): void {
		const mark = habit.markOn(day);
		const anchor = habit.text("anchor");
		new MissReasonModal(this.app, {
			habitName: habit.name,
			date: day,
			anchor: anchor.at(day) ?? anchor.current() ?? "",
			reason: mark?.kind === "missed" ? mark.reason : undefined,
			onSave: (reason) => void this.run(() => this.ui.service.setMark(path, day, missed(reason))),
			onDone: (kind) =>
				void this.run(async () => this.celebrateIfDone(await this.ui.service.setMark(path, day, kind === "tiny" ? TINY : FULL), day)),
			onClear: () => void this.run(() => this.ui.service.setMark(path, day, undefined)),
		}).open();
	}

	private celebrateIfDone(habit: Habit, day: LocalDate): void {
		const mark = habit.markOn(day);
		if (!mark || mark.kind === "missed") return;
		celebrate({
			...celebrationText(habit, mark.kind),
			streak: computeStats(habit, this.ui.service.today()).current?.length ?? 0,
			confetti: this.ui.settings().confetti,
		});
	}

	private async run(action: () => Promise<unknown>): Promise<void> {
		try {
			await action();
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		}
	}

	private loadMore(): void {
		this.daysShown += PAGE_DAYS;
		this.refresh();
	}

	private page(direction: -1 | 1): void {
		this.scroller?.scrollBy({ left: direction * this.scroller.clientWidth, behavior: "smooth" });
	}

	private button(parent: HTMLElement, text: string, label: string, onClick: () => void): void {
		const button = parent.createEl("button", { cls: "th-button", text });
		button.setAttribute("aria-label", label);
		button.addEventListener("click", onClick);
	}
}
