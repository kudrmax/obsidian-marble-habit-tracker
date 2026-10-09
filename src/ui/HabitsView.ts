import { ItemView, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import { HabitEntry } from "../application/ports";
import { FULL, TINY, missed } from "../domain/DayMark";
import { Habit } from "../domain/Habit";
import { LocalDate } from "../domain/LocalDate";
import { needsRedesign } from "../domain/RedesignRule";
import { computeStats } from "../domain/Stats";
import { celebrate } from "./CelebrationOverlay";
import { cellLook } from "./chain";
import { DayState, chainLayout, dayState } from "./chainLayout";
import { drawChain } from "./ChainRenderer";
import { colorClass } from "./colors";
import { DayWatcher } from "./DayWatcher";
import { anchorLine, celebrationText, weekdayShort } from "./format";
import { MissReasonModal } from "./MissReasonModal";
import { visibleEntries } from "./order";
import { ScrollAnchor } from "./ScrollAnchor";
import { UiContext } from "./UiContext";

export const HABITS_VIEW = "tiny-habits-grid";

const PAGE_DAYS = 60;
const LONG_PRESS_MS = 500;
const LOAD_MORE_THRESHOLD_PX = 200;
const DAY_CHECK_MS = 60_000;

function weekendClasses(day: LocalDate): string[] {
	const weekday = day.weekday();
	if (weekday === "sat") return ["is-weekend", "is-sat"];
	if (weekday === "sun") return ["is-weekend", "is-sun"];
	return [];
}

export class HabitsView extends ItemView {
	private daysShown = PAGE_DAYS;
	private scroller: HTMLElement | null = null;
	private readonly anchor = new ScrollAnchor();
	private readonly resizes = new ResizeObserver(() => this.applyAnchor());
	private retryScheduled = false;

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
		return "Habits";
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
		root.addClass("tiny-habits", "th-grid-view");
		const header = root.createDiv("th-header");
		header.createDiv({ cls: "th-title", text: "Habits" });
		const actions = header.createDiv("th-header-actions");
		this.iconButton(actions, "chevron-left", "Earlier", () => this.page(-1));
		this.iconButton(actions, "chevron-right", "Later", () => this.page(1));
		this.iconButton(actions, "plus", "New habit", () => this.ui.newHabit());

		const entries = visibleEntries(this.ui.repository.list());
		if (entries.length === 0) {
			this.scroller = null;
			const empty = root.createDiv("th-empty");
			empty.createDiv({ cls: "th-empty-title", text: "No habits yet" });
			empty.createDiv({ cls: "th-empty-hint", text: "Start with something you can do in under 30 seconds, right after something you already do." });
			empty.createEl("button", { cls: "th-pill th-pill-primary", text: "New habit" }).addEventListener("click", () => this.ui.newHabit());
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
			const cell = dates.createDiv({ cls: ["th-date", ...weekendClasses(day)] });
			cell.toggleClass("is-today", day.equals(today));
			cell.createDiv({ cls: "th-date-number", text: String(day.day) });
			cell.createDiv({ cls: "th-date-weekday", text: weekdayShort(day.weekday()) });
		}
		entries.forEach((entry, index) => {
			this.renderName(names, entry);
			this.renderRow(scroller, entry, days, index === entries.length - 1);
		});
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
			cell.setAttribute("aria-label", entry.problem);
			cell.createDiv({ cls: "th-name-anchor", text: "Can't read this note" });
			cell.createDiv({ cls: "th-name-title", text: entry.name });
			cell.addEventListener("click", () => void this.app.workspace.openLinkText(entry.path, "", "tab"));
			return;
		}
		const { habit } = entry;
		cell.addClass("th-habit", colorClass(habit.color));
		cell.createDiv({ cls: "th-name-anchor", text: anchorLine(habit) });
		const title = cell.createDiv({ cls: "th-name-title", text: habit.name });
		if (needsRedesign(habit, this.ui.settings().redesignThreshold)) {
			const hint = title.createSpan({ cls: "th-redesign", attr: { "aria-label": "Recipe needs a redesign" } });
			setIcon(hint, "refresh-ccw");
		}
		cell.addEventListener("click", () => this.ui.openHabit(entry.path));
	}

	private renderRow(scroller: HTMLElement, entry: HabitEntry, days: readonly LocalDate[], last: boolean): void {
		const row = scroller.createDiv("th-row th-habit-row");
		const habit = entry.kind === "ok" ? entry.habit : undefined;
		if (habit) row.addClass("th-habit", colorClass(habit.color));
		const states: DayState[] = [];
		for (const day of days) {
			const cell = row.createDiv({ cls: ["th-cell", ...weekendClasses(day)] });
			cell.toggleClass("is-last", last);
			if (!habit) {
				cell.addClass("is-inert");
				continue;
			}
			const state = dayState(cellLook(habit, day));
			states.push(state);
			if (state === "before") {
				cell.addClass("is-inert");
				continue;
			}
			this.bindCell(
				cell,
				() => void this.tap(entry.path, habit, day),
				() => this.openMiss(entry.path, habit, day),
			);
		}
		if (!habit) return;
		const chain = drawChain(row, days.length, chainLayout(states));
		if (chain) row.prepend(chain);
		else this.retryWhenStylesLoad();
	}

	private retryWhenStylesLoad(): void {
		if (this.retryScheduled) return;
		this.retryScheduled = true;
		window.requestAnimationFrame(() => {
			this.retryScheduled = false;
			this.refresh();
		});
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
			color: habit.color,
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
			full: mark.kind === "full",
			color: habit.color,
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

	private iconButton(parent: HTMLElement, icon: string, label: string, onClick: () => void): void {
		const button = parent.createDiv({ cls: "clickable-icon th-icon-button", attr: { "aria-label": label } });
		setIcon(button, icon);
		button.addEventListener("click", onClick);
	}
}
