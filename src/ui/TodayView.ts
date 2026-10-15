import { ItemView, Notice, Platform, WorkspaceLeaf, setIcon } from "obsidian";
import { HabitEntry } from "../application/ports";
import { DayMark, SKIPPED, done, isDone, isOffTrigger, missed } from "../domain/DayMark";
import { Habit } from "../domain/Habit";
import { LocalDate } from "../domain/LocalDate";
import { HabitColor } from "../domain/HabitColor";
import { buildJar } from "../domain/Jar";
import { colorClass } from "./colors";
import { chip, icon, iconButton } from "./components";
import { recipeDays } from "./format";
import { computeStats } from "../domain/Stats";
import { DayWatcher } from "./DayWatcher";
import { EditSheet } from "./EditSheet";
import { Haptics } from "./Haptics";
import { helpRows } from "./help";
import { HelpModal } from "./HelpModal";
import { Hsl, parseColor } from "./jar/color";
import { JarCanvas, JarItem } from "./jar/JarCanvas";
import { KeyboardWatch } from "./KeyboardWatch";
import { LEAVE_MS, Motion, Slide } from "./Motion";
import { TodaySheet } from "./TodaySheet";
import { Box } from "./jar/JarPhysics";
import { Point } from "./jar/JarPhysics";
import { IN_HAND, TiltSensor } from "./jar/TiltSensor";
import { Placement, arrange, groupBySection, visibleEntries } from "./order";
import { Drop, RowDrag } from "./RowDrag";
import { SectionNameModal } from "./SectionNameModal";
import { ScreenChrome } from "./ScreenChrome";
import { closedDayLine, dayTitle, isMore, totalWins, winsLabel, winsSince, offersShrink, todayEntries } from "./today";
import { UiContext } from "./UiContext";

export const HABITS_VIEW = "tiny-habits-grid";
const SVG_NS = "http://www.w3.org/2000/svg";
const RING_RADIUS = 50;
const RING_GAP = 9;

/** How long the circle of a just-marked habit keeps popping, while its row is still on screen. */
const POP_MS = 450;
const CAPTION_MS = 2000;
/** How far a row with an open menu keeps from the sheet's edges. */
const VIEW_GAP = 12;
/** How far a name moved aside by the choices keeps from the last of them. */
const NAME_GAP = 12;
const DAY_CHECK_MS = 60_000;
/** Obsidian re-reads a note a moment after it is written, so the tap point has to wait for the new mark. */
const ORIGIN_TTL_MS = 4000;
const FALLBACK_COLOR: Hsl = { h: 258, s: 88, l: 66 };

type Answer = "skip" | "full" | "tiny";

export class TodayView extends ItemView {
	private scrollEl!: HTMLElement;
	private columnEl!: HTMLElement;
	private captionEl: HTMLElement | null = null;
	private jar: JarCanvas | null = null;
	private chrome: ScreenChrome | null = null;
	private keyboard: KeyboardWatch | null = null;
	private rowDrag: RowDrag | null = null;
	/** A redraw was asked for while a row was being dragged; it runs on drop. */
	private stale = false;
	private menu: string | null = null;
	/** In the open menu, the next tiny or full answer is marked as done without the anchor. */
	private offTrigger = false;
	private asking: string | null = null;
	private other: string | null = null;
	private otherText = "";
	private shrink: string | null = null;
	private showDone = false;
	/** A past day picked with the arrows, to mark what was forgotten; none means today. */
	private day: LocalDate | null = null;
	/** Today's list, or every habit including the ones not due and the archived ones. */
	private screen: "today" | "all" = "today";
	private showArchived = false;
	/** The card opened to show its recipe; one at a time. */
	private expanded: string | null = null;
	private shownRows = new Set<string>();
	private renderingRows = new Set<string>();
	private wasClosed: boolean | null = null;
	private captionTimer = 0;
	private readonly celebrating = new Map<string, number>();
	private readonly origins = new Map<string, { point: Point; at: number }>();
	private readonly colors = new Map<string, Hsl>();
	private readonly haptics = new Haptics(() => this.ui.settings().haptics);
	private readonly motion = new Motion(() => this.ui.settings().reduceMotion);
	/** Rows just answered, with when: they stay in the list until they have folded away. */
	private readonly leaving = new Map<string, number>();
	/** How the next redraw arrives: from an earlier or later day, or into and out of All habits. */
	private slide: Slide | null = null;
	/** The card just opened, to grow its recipe in once. */
	private opening: string | null = null;
	private menuOpening = false;
	private sheet: TodaySheet | null = null;
	/** The choices' arrival while it plays, so a cancel mid-way stops it. */
	private unfolding: { stop(): void } | null = null;
	/** The row whose choices just closed, to slide its content back in, and how far its name had moved aside. */
	private closing: string | null = null;
	private push = 0;
	private shelves: readonly Box[] = [];
	private sheetTop = 0;
	private shownWins: number | null = null;
	private readonly tilt = new TiltSensor((gravity) => this.jar?.setGravity(gravity));

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
		const root = this.contentEl;
		root.empty();
		root.addClass("tiny-habits", "th-today");
		const sheet = new TodaySheet(
			root,
			(top) => this.sheetMoved(top),
			() => this.haptics.tap(),
		);
		this.sheet = sheet;
		this.scrollEl = sheet.scroll;
		this.columnEl = this.scrollEl.createDiv("th-column");
		this.rowDrag = new RowDrag(
			this.columnEl,
			() => this.haptics.tap(),
			(drop) => this.dropped(drop),
		);
		this.jar = new JarCanvas(root, this.jarOptions());
		this.updateFloor();
		this.chrome = new ScreenChrome(root, this.containerEl, (shelves, ledges) => {
			this.shelves = shelves;
			this.updateFloor();
			this.jar?.setLedges(ledges);
		});
		const keyboard = new KeyboardWatch(root, () => this.jar?.refit());
		this.keyboard = keyboard;
		this.jar.holdWhile(() => keyboard.isOpen());
		this.registerEvent(this.app.workspace.on("layout-change", () => this.chrome?.measure()));
		this.registerDomEvent(window, "resize", () => this.chrome?.measure());
		this.registerEvent(
			this.app.workspace.on("css-change", () => {
				this.colors.clear();
				this.refresh();
			}),
		);
		this.registerDomEvent(root, "click", (event) => this.closeMenuOutside(event));
		if (!Platform.isMobile) {
			this.registerDomEvent(root, "pointermove", (event) => {
				if (event.pointerType === "mouse" && this.cursorPushEnabled()) this.jar?.setPusher({ x: event.clientX, y: event.clientY });
			});
			this.registerDomEvent(root, "pointerleave", () => this.jar?.setPusher(null));
		}
		this.registerDomEvent(root, "pointerdown", () => {
			if (this.tiltEnabled()) void this.tilt.askOnTap();
		});
		const recheck = () => this.applyTilt();
		this.registerEvent(this.app.workspace.on("active-leaf-change", recheck));
		this.registerEvent(this.app.workspace.on("layout-change", recheck));
		this.registerEvent(this.app.workspace.on("resize", recheck));
		this.registerDomEvent(document, "visibilitychange", recheck);
		this.applyTilt();
		this.render();
	}

	override async onClose(): Promise<void> {
		this.tilt.stop();
		this.chrome?.destroy();
		this.chrome = null;
		this.keyboard?.destroy();
		this.keyboard = null;
		this.rowDrag?.destroy();
		this.rowDrag = null;
		this.jar?.destroy();
		this.jar = null;
		this.sheet?.destroy();
		this.sheet = null;
		window.clearTimeout(this.captionTimer);
		for (const timer of this.celebrating.values()) window.clearTimeout(timer);
	}

	refresh(): void {
		this.jar?.setOptions(this.jarOptions());
		if (!this.cursorPushEnabled()) this.jar?.setPusher(null);
		this.applyTilt();
		this.render();
	}

	private render(): void {
		if (!this.columnEl) return;
		if (this.rowDrag?.active) {
			this.stale = true;
			return;
		}
		this.stale = false;
		const column = this.columnEl;
		column.empty();
		this.renderingRows = new Set();
		const all = visibleEntries(this.ui.repository.list());
		this.syncJar(all);
		if (all.length === 0) {
			this.renderEmpty(column);
			return;
		}
		if (this.screen === "all") {
			this.renderAll(column, all);
			this.renderFooter(column, false);
			this.playMotion(column);
			return;
		}
		const today = this.shownDay();
		const entries = todayEntries(all, today);
		const habits = entries.flatMap((entry) => (entry.kind === "ok" ? [entry] : []));
		const answeredHabits = habits.filter((entry) => entry.habit.markOn(today) !== undefined);
		const closed = habits.length > 0 && answeredHabits.length === habits.length && this.leaving.size === 0;
		this.renderHero(all, habits.length, answeredHabits.filter((entry) => isDone(entry.habit.markOn(today))).length);
		this.renderHead();
		if (closed) this.renderRing(column, habits.map((entry) => entry.habit), this.wasClosed === false);
		this.wasClosed = closed;
		if (habits.length === 0) column.createDiv("th-ring-block").createEl("h2", { cls: "th-title", text: "Nothing for today" });

		const hideDone = this.ui.settings().hideDone;
		const open = (entry: Extract<HabitEntry, { kind: "ok" }>) =>
			entry.habit.markOn(today) === undefined ||
			this.menu === entry.path ||
			this.asking === entry.path ||
			this.shrink === entry.path ||
			this.leaving.has(entry.path);
		const ordered = groupBySection(
			all.flatMap((entry) => (entry.kind === "ok" ? [entry] : [])),
			(entry) => entry.habit.section,
		).flatMap((group) => group.items.filter((item) => habits.some((habit) => habit.path === item.path)));
		const shown = ordered.filter((entry) => !hideDone || this.showDone || open(entry));
		let section: string | undefined | null = null;
		for (const entry of shown) {
			if (entry.habit.section !== section) {
				section = entry.habit.section;
				if (section !== undefined) this.renderSection(column, section);
			}
			this.renderRow(column, entry.path, entry.habit);
		}
		for (const entry of entries) if (entry.kind === "broken") this.renderBroken(column, entry);
		this.renderNewSection(column);
		this.renderFolded(column, answeredHabits.filter((entry) => !this.leaving.has(entry.path)));
		this.renderFooter(column, true);
		this.shownRows = this.renderingRows;
		this.playMotion(column);
	}

	/** Scrolls the sheet, and only the sheet, so a row half under the navbar is in full view while it shows its choices. */
	private bringIntoView(element: HTMLElement): void {
		const inset = parseFloat(this.contentEl.style.getPropertyValue("--th-bottom-inset")) || 0;
		const visible = this.scrollEl.getBoundingClientRect();
		const box = element.getBoundingClientRect();
		const below = box.bottom - (visible.bottom - inset - VIEW_GAP);
		const above = visible.top + VIEW_GAP - box.top;
		if (below > 0) this.scrollEl.scrollTop += below;
		else if (above > 0) this.scrollEl.scrollTop -= above;
	}

	/** The sheet moved: its top edge is the jar's floor, and the celebration line rides just above it. */
	private sheetMoved(top: number): void {
		const first = this.sheetTop <= 0 && top > 0;
		this.sheetTop = top;
		this.updateFloor();
		if (first) this.syncJar(visibleEntries(this.ui.repository.list()));
	}

	private updateFloor(): void {
		const width = this.contentEl.clientWidth;
		const height = this.contentEl.clientHeight;
		const floor: Box = { left: -width, top: this.sheetTop, right: 2 * width, bottom: height + this.sheetTop, radius: 0 };
		this.jar?.setObstacles(this.sheetTop > 0 ? [...this.shelves, floor] : this.shelves);
	}

	/** Starts what moves after a redraw: rows folding away, a new day or screen sliding in, a recipe growing open. */
	private playMotion(column: HTMLElement): void {
		for (const [path, since] of this.leaving) {
			const row = column.querySelector<HTMLElement>(`.th-row[data-drag="${CSS.escape(path)}"]`);
			if (row) this.motion.leave(row, since);
		}
		if (this.slide) {
			this.motion.slide([...column.children].filter((child): child is HTMLElement => child instanceof HTMLElement), this.slide);
			this.slide = null;
		}
		if (this.opening) {
			const recipe = column.querySelector<HTMLElement>(".th-row.is-expanded .th-card-recipe");
			if (recipe) this.motion.grow(recipe);
			this.opening = null;
		}
	}

	showAll(): void {
		this.slide = this.screen === "all" ? null : "push";
		this.screen = "all";
		this.menu = null;
		this.asking = null;
		this.shrink = null;
		this.render();
	}

	private showToday(): void {
		this.slide = "pop";
		this.screen = "today";
		this.wasClosed = null;
		this.render();
	}

	/** Every habit by section, with its days and wins; archived ones fold away at the bottom. */
	private renderAll(column: HTMLElement, visible: readonly HabitEntry[]): void {
		this.renderHead();
		const habits = visible.flatMap((entry) => (entry.kind === "ok" ? [entry] : []));
		for (const group of groupBySection(habits, (entry) => entry.habit.section)) {
			if (group.items.length === 0) continue;
			if (group.section !== undefined) column.createDiv({ cls: "th-group", text: group.section });
			for (const entry of group.items) this.renderListed(column, entry.path, entry.habit, false);
		}
		for (const entry of visible) if (entry.kind === "broken") this.renderBroken(column, entry);
		const archived = this.ui.repository.list().flatMap((entry) => (entry.kind === "ok" && entry.habit.archived ? [entry] : []));
		if (archived.length === 0) return;
		const toggle = column.createEl("button", { cls: "th-meta-done th-archived-toggle", attr: { "aria-expanded": String(this.showArchived) } });
		toggle.createSpan({ text: `Archived · ${archived.length}` });
		setIcon(toggle.createSpan("th-meta-chevron"), "chevron-right");
		toggle.addEventListener("click", () => {
			this.showArchived = !this.showArchived;
			this.render();
		});
		if (this.showArchived) for (const entry of archived) this.renderListed(column, entry.path, entry.habit, true);
	}

	private renderListed(column: HTMLElement, path: string, habit: Habit, archived: boolean): void {
		this.renderCard(column, path, habit, {
			dimmed: archived,
			sub: `${recipeDays(habit.currentSchedule)} · ${winsLabel(computeStats(habit, this.ui.service.today()).total)}`,
		});
	}

	/**
	 * A habit's card, the same on Today and in All habits: a circle in its color, then its name, which opens its recipe.
	 * `lead` puts Today's working circle in front; the card is returned for what goes under it.
	 */
	private renderCard(
		column: HTMLElement,
		path: string,
		habit: Habit,
		options: { dimmed: boolean; sub?: string; attrs?: Record<string, string>; lead?: (main: HTMLElement) => void },
	): HTMLElement {
		const row = column.createDiv({ cls: ["th-row", "th-habit", colorClass(habit.color)], attr: options.attrs ?? {} });
		row.toggleClass("is-answered", options.dimmed);
		const main = row.createDiv("th-row-main");
		if (options.lead) options.lead(main);
		else main.createSpan("th-mark-slot").createSpan("th-mark");
		const text = main.createDiv("th-row-text");
		text.createDiv({ cls: "th-row-title", text: habit.name });
		if (options.sub) text.createDiv({ cls: "th-row-sub", text: options.sub });
		text.setAttribute("aria-expanded", String(this.expanded === path));
		row.toggleClass("is-expanded", this.expanded === path);
		text.addEventListener("click", () => void this.toggleRecipe(path));
		if (this.expanded === path) this.renderRecipe(row, path, habit);
		return row;
	}

	/** Opens a card's recipe, or folds the open one away first; one card is open at a time. */
	private async toggleRecipe(path: string): Promise<void> {
		const open = this.columnEl.querySelector<HTMLElement>(".is-expanded .th-card-recipe");
		if (open) await this.motion.fold(open);
		const closing = this.expanded === path;
		this.expanded = closing ? null : path;
		this.opening = closing ? null : path;
		this.render();
	}

	/** The day Today shows: today, or a past day picked with the arrows. */
	private shownDay(): LocalDate {
		const today = this.ui.service.today();
		return this.day && this.day.isBefore(today) ? this.day : today;
	}

	/**
	 * The stage above the sheet: the wins as one big number with a small line under it, and the day's count on the
	 * right. The number pops when it grows.
	 */
	private renderHero(all: readonly HabitEntry[], due: number, done: number): void {
		const hero = this.sheet?.hero;
		if (!hero) return;
		hero.empty();
		const today = this.ui.service.today();
		const wins = totalWins(all);
		const main = hero.createDiv("th-hero-main");
		if (this.ui.settings().showWins) {
			const number = main.createDiv({ cls: "th-hero-number", text: String(wins) });
			if (this.shownWins !== null && wins > this.shownWins) this.motion.bump(number);
			main.createDiv({ cls: "th-hero-caption", text: winsSince(all, today) });
		}
		this.shownWins = wins;
		if (due === 0) return;
		const side = hero.createDiv("th-hero-side");
		const count = side.createDiv("th-hero-count");
		count.createSpan({ text: String(done) });
		count.createSpan({ cls: "th-hero-of", text: `/${due}` });
		side.createDiv({ cls: "th-hero-caption", text: dayTitle(this.shownDay(), today).toLowerCase() });
	}

	/** The sheet's header: the day with arrows to step through past days, or All habits with the way back. */
	private renderHead(): void {
		const head = this.sheet?.head;
		if (!head) return;
		head.empty();
		const line = head.createDiv("th-head-line");
		if (this.screen === "all") {
			const back = line.createEl("button", { cls: "th-back" });
			setIcon(back.createSpan("th-back-icon"), "chevron-left");
			back.appendText("Today");
			back.addEventListener("click", () => this.showToday());
			line.createEl("h2", { cls: "th-sheet-title", text: "All habits" });
			return;
		}
		const today = this.ui.service.today();
		const shown = this.shownDay();
		const isToday = shown.equals(today);
		line.createEl("h2", { cls: "th-sheet-title", text: dayTitle(shown, today) });
		if (!isToday) {
			const back = line.createEl("button", { cls: "th-head-today", text: "Today", attr: { title: "Back to today" } });
			back.addEventListener("click", () => this.showDay(today));
		}
		const step = (label: string, iconName: string, days: number, disabled: boolean) => {
			const button = line.createEl("button", { cls: "th-head-step", attr: { "aria-label": label, title: label } });
			setIcon(button, iconName);
			button.disabled = disabled;
			button.addEventListener("click", () => this.showDay(shown.addDays(days)));
		};
		step("Previous day", "chevron-left", -1, false);
		step("Next day", "chevron-right", 1, isToday);
	}

	/** A closed day: a ring with an arc per habit, done in its color and skipped in grey. */
	private renderRing(column: HTMLElement, habits: readonly Habit[], justClosed: boolean): void {
		const day = this.shownDay();
		const done = habits.filter((habit) => isDone(habit.markOn(day))).length;
		const block = column.createDiv("th-ring-block");
		block.toggleClass("is-fresh", justClosed);
		const ring = block.createDiv("th-ring");
		const svg = ring.appendChild(document.createElementNS(SVG_NS, "svg"));
		svg.setAttribute("viewBox", "-60 -60 120 120");
		svg.setAttribute("aria-hidden", "true");
		const circumference = 2 * Math.PI * RING_RADIUS;
		const share = circumference / habits.length;
		const gap = habits.length > 1 ? RING_GAP : 0;
		const arc = (classes: string[], length: number, offset: number, index: number) => {
			const circle = svg.appendChild(document.createElementNS(SVG_NS, "circle"));
			circle.setAttribute("r", String(RING_RADIUS));
			circle.setAttribute("class", classes.join(" "));
			circle.style.setProperty("--th-arc", `${length}`);
			circle.style.setProperty("--th-rest", `${circumference - length}`);
			circle.style.setProperty("stroke-dashoffset", `${-offset}`);
			circle.style.setProperty("animation-delay", `${index * 90}ms`);
		};
		arc(["th-ring-track"], circumference, 0, 0);
		habits.forEach((habit, index) => {
			const classes = isDone(habit.markOn(day)) ? ["th-ring-arc", "th-habit", colorClass(habit.color)] : ["th-ring-arc", "is-missed"];
			arc(classes, share - gap, index * share + gap / 2, index);
		});
		ring.createDiv({ cls: "th-ring-count", text: `${done}/${habits.length}` });
		block.createEl("h2", { cls: "th-title", text: "Day closed" });
		block.createDiv({ cls: "th-ring-sub", text: closedDayLine(habits.length - done) });
		if (justClosed) this.haptics.merge();
	}

	/** The answered habits folded into one row at the end of the list, "3 done · 1 skipped", which opens them. */
	private renderFolded(column: HTMLElement, answered: readonly Extract<HabitEntry, { kind: "ok" }>[]): void {
		if (answered.length === 0 || !this.ui.settings().hideDone) return;
		const day = this.shownDay();
		const done = answered.filter((entry) => isDone(entry.habit.markOn(day)));
		const skipped = answered.length - done.length;
		const toggle = column.createEl("button", { cls: "th-fold", attr: { "aria-expanded": String(this.showDone) } });
		const dots = toggle.createSpan("th-done-dots");
		for (const entry of answered) {
			const color = isDone(entry.habit.markOn(day)) ? ["th-habit", colorClass(entry.habit.color)] : ["is-skipped"];
			dots.createSpan({ cls: ["th-done-dot", ...color] });
		}
		toggle.createSpan({ cls: "th-fold-text", text: [done.length ? `${done.length} done` : "", skipped ? `${skipped} skipped` : ""].filter(Boolean).join(" · ") });
		toggle.createSpan({ cls: "th-fold-action", text: this.showDone ? "Hide" : "Show" });
		toggle.addEventListener("click", () => {
			this.showDone = !this.showDone;
			this.render();
		});
	}

	private showDay(day: LocalDate): void {
		this.slide = day.isBefore(this.shownDay()) ? "earlier" : "later";
		this.leaving.clear();
		this.day = day.isBefore(this.ui.service.today()) ? day : null;
		this.menu = null;
		this.asking = null;
		this.other = null;
		this.otherText = "";
		this.shrink = null;
		this.showDone = false;
		this.wasClosed = null;
		this.render();
	}

	/** Reads the new order and sections off the screen after a drop and saves them; a row dropped into the new-section zone asks for a name first. */
	private dropped(drop: Drop | null): void {
		if (!drop || !this.columnEl) {
			if (this.stale) this.render();
			return;
		}
		const shown: Placement[] = [];
		let section: string | undefined;
		for (const slot of this.columnEl.querySelectorAll<HTMLElement>("[data-slot]")) {
			if (slot.dataset.slot === "header") section = slot.dataset.section;
			else if (slot.dataset.drag) {
				const moved = drop.kind === "row" && slot === drop.element;
				shown.push({ path: slot.dataset.drag, section: moved ? section : slot.dataset.section || undefined });
			}
		}
		const path = drop.element.dataset.drag;
		if (!drop.newSection || !path) return void this.saveArrangement(shown);
		new SectionNameModal(
			this.app,
			(name) => void this.saveArrangement(shown.map((item) => (item.path === path ? { path, section: name } : item))),
			() => this.render(),
		).open();
	}

	private async saveArrangement(shown: readonly Placement[]): Promise<void> {
		const habits = visibleEntries(this.ui.repository.list()).flatMap((entry) => (entry.kind === "ok" ? [entry] : []));
		const before = groupBySection(habits, (entry) => entry.habit.section).flatMap((group) => group.items.map((entry) => ({ path: entry.path, section: entry.habit.section })));
		try {
			await this.ui.service.arrange(arrange(before, shown));
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		}
		this.render();
	}




	/**
	 * The end of the list, as in Reminders: a row to add a habit, then the rarely used places — All habits and the help —
	 * as rows that lead on. Obsidian's header stays Obsidian's.
	 */
	private renderFooter(column: HTMLElement, onToday: boolean): void {
		const footer = column.createDiv("th-footer");
		const add = footer.createEl("button", { cls: "th-footer-add" });
		setIcon(add.createSpan("th-footer-add-icon"), "plus");
		add.appendText("New habit");
		add.addEventListener("click", () => this.ui.newHabit());
		const links = footer.createDiv("th-footer-links");
		const link = (text: string, iconName: string, onClick: () => void) => {
			const button = links.createEl("button", { cls: "th-footer-link" });
			setIcon(button.createSpan("th-footer-link-icon"), iconName);
			button.createSpan({ cls: "th-footer-link-text", text });
			setIcon(button.createSpan("th-footer-chevron"), "chevron-right");
			button.addEventListener("click", onClick);
			return button;
		};
		if (onToday) link("All habits", "list", () => this.showAll());
		const help = link("How it works", "circle-help", () => {
			new HelpModal(this.app, helpRows(Platform.isMobile, this.ui.settings().merge)).open();
			this.ui.markHintsSeen();
		});
		help.toggleClass("th-has-dot", !this.ui.settings().hintsSeen);
	}

	private renderEmpty(column: HTMLElement): void {
		const empty = column.createDiv("th-empty");
		empty.createEl("h1", { cls: "th-title", text: "Add your first habit" });
		iconButton(empty, { icon: "plus", label: "New habit", primary: true, large: true, onClick: () => this.ui.newHabit() });
	}

	private renderSection(column: HTMLElement, section: string): void {
		column.createDiv({ cls: "th-group", text: section, attr: { "data-slot": "header", "data-section": section } });
	}

	private renderNewSection(column: HTMLElement): void {
		column.createDiv({ cls: "th-section-new", text: "+ New section", attr: { "data-zone": "" } });
	}

	private renderBroken(column: HTMLElement, entry: Extract<HabitEntry, { kind: "broken" }>): void {
		const row = column.createDiv("th-row is-answered");
		const text = row.createDiv("th-row-main").createDiv("th-row-text");
		text.createDiv({ cls: "th-row-title", text: `Can't read ${entry.name}` });
		text.createDiv({ cls: "th-row-sub", text: entry.problem });
		text.addEventListener("click", () => void this.app.workspace.openLinkText(entry.path, "", "tab"));
	}

	private renderRow(column: HTMLElement, path: string, habit: Habit): void {
		const today = this.shownDay();
		const mark = habit.markOn(today);
		const row = this.renderCard(column, path, habit, {
			dimmed: mark !== undefined,
			attrs: { "data-slot": "row", "data-drag": path, "data-section": habit.section ?? "" },
			lead: (main) => this.renderMark(main, path, habit, mark),
		});
		row.toggleClass("is-new", !this.shownRows.has(path));
		this.renderingRows.add(path);
		const main = row.querySelector<HTMLElement>(".th-row-main");
		if (main && this.menu === path) this.renderChoices(main, path, habit, mark);
		if (main && this.closing === path) {
			this.motion.refold(this.contentOf(main), this.push);
			this.closing = null;
		}
		if (this.asking === path) this.renderReasons(row, path);
		if (this.shrink === path && mark?.kind === "missed") this.renderShrink(row, path, habit);
	}

	/**
	 * The answers in the row, as marbles with a sign and no words: cancel where the circle was, under the finger, then
	 * full in the habit's color, tiny tinted with it, and skip in grey. The name moves aside to make room, and a long one
	 * runs off the row. They arrive rolling: the circle fills into the skip marble, which rolls right and pushes the name,
	 * and the others roll in from the left behind it; all of them stop at once. A tap anywhere else brings the row back.
	 */
	private renderChoices(main: HTMLElement, path: string, habit: Habit, mark: DayMark | undefined): void {
		const labels = this.ui.labels();
		const offTrigger = this.offTrigger && this.canGoOffTrigger(habit);
		const chosen = (kind: "full" | "tiny") => mark?.kind === kind && isOffTrigger(mark) === offTrigger;
		const origin = main.querySelector<HTMLElement>(".th-mark")?.getBoundingClientRect() ?? null;
		const bar = main.createDiv("th-row-choices");
		const marble = (cls: string, label: string, sign: "x" | "check" | "minus", selected: boolean) => {
			const button = bar.createEl("button", { cls: ["th-choice", cls], attr: { "aria-label": label, title: label, "aria-pressed": String(selected) } });
			icon(button.createSpan("th-choice-ball").createSpan("th-choice-sign"), sign);
			return button;
		};
		const cancel = marble("is-cancel", "Cancel", "x", false);
		cancel.removeAttribute("aria-pressed");
		cancel.addEventListener("click", () => this.closeChoices());
		const option = (answer: Answer, label: string, cls: string, sign: "check" | "minus", selected: boolean) => {
			const button = marble(cls, label, sign, selected);
			button.addEventListener("click", (event) => {
				this.unfolding?.stop();
				this.unfolding = null;
				button.addClass("is-picked");
				this.haptics.tap();
				void this.choose(path, answer, mark, event);
			});
		};
		if (habit.hasFull) option("full", labels.title("full"), "is-full", "check", chosen("full"));
		if (habit.hasTiny) option("tiny", labels.title("tiny"), "is-tiny", "check", chosen("tiny"));
		option("skip", "Skip", "is-skip", "minus", mark?.kind === "missed");
		if (this.canGoOffTrigger(habit)) {
			const toggle = bar.createEl("button", { cls: "th-choices-toggle", attr: { "aria-pressed": String(this.offTrigger), "aria-label": "Not at trigger", title: "Not at trigger" } });
			setIcon(toggle, "unlink");
			toggle.addEventListener("click", () => {
				this.offTrigger = !this.offTrigger;
				this.render();
			});
		}
		const name = main.querySelector<HTMLElement>(".th-row-text");
		const last = bar.lastElementChild as HTMLElement;
		const edge = (last.querySelector<HTMLElement>(".th-choice-ball") ?? last).getBoundingClientRect().right;
		this.push = name ? Math.max(0, edge + NAME_GAP - name.getBoundingClientRect().left) : 0;
		main.setCssProps({ "--th-push": `${this.push}px` });
		main.addClass("is-choosing");
		if (!this.menuOpening) return;
		this.menuOpening = false;
		this.bringIntoView(main);
		this.unfolding = this.motion.rollChoices([...bar.querySelectorAll<HTMLElement>(".th-choice")], [...bar.querySelectorAll<HTMLElement>(".th-choices-toggle")], name, this.push, origin);
	}

	/** Back from the choices to the row; anything still unfolding stops at once, so cancel works mid-animation. */
	private closeChoices(): void {
		this.unfolding?.stop();
		this.unfolding = null;
		this.closing = this.menu;
		this.menu = null;
		this.render();
	}

	/** The row's own content — circle and name — without the choices laid over it. */
	private contentOf(main: HTMLElement): HTMLElement[] {
		return [...main.children].filter((child): child is HTMLElement => child instanceof HTMLElement && !child.hasClass("th-row-choices"));
	}

	/** An opened card: the recipe line by line, and a way to the habit's note. */
	private renderRecipe(row: HTMLElement, path: string, habit: Habit): void {
		const labels = this.ui.labels();
		const recipe = row.createDiv("th-card-recipe");
		for (const part of ["anchor", "tiny", "full", "celebration"] as const) {
			const value = habit.current(part);
			if (!value) continue;
			recipe.createSpan({ cls: "th-card-key", text: labels.title(part) });
			recipe.createSpan({ cls: "th-card-value", text: value });
		}
		const open = recipe.createEl("button", { cls: "th-card-open" });
		open.appendText("Open note");
		setIcon(open.createSpan("th-card-open-icon"), "arrow-up-right");
		open.addEventListener("click", () => this.ui.openHabit(path, this.leaf));
	}




	private renderMark(parent: HTMLElement, path: string, habit: Habit, mark: DayMark | undefined): void {
		const labels = this.ui.labels();
		const first = habit.hasTiny ? labels.of("tiny") : "done";
		const hint = `Choose: ${first}, ${labels.of("full")} or skipped`;
		const button = parent.createEl("button", { cls: "th-mark-button", attr: { title: hint } });
		button.createSpan({ cls: "th-sr-only", text: hint });
		const circle = button.createSpan("th-mark");
		if (isDone(mark)) {
			circle.addClass("is-done");
			circle.toggleClass("is-more", isMore(habit, mark));
			if (this.celebrating.has(path)) circle.addClass("is-popping");
			icon(circle, "check");
		} else if (mark?.kind === "missed") circle.addClass("is-missed");
		else if (this.asking === path) circle.addClass("is-asking");

		button.addEventListener("contextmenu", (event) => {
			event.preventDefault();
			this.showMenu(path);
		});
		button.addEventListener("click", () => this.showMenu(path));
	}

	private renderReasons(row: HTMLElement, path: string): void {
		const extra = row.createDiv("th-row-extra");
		extra.createDiv({ cls: "th-label", text: "What got in the way? · optional" });
		const chips = extra.createDiv("th-chips");
		for (const reason of this.ui.settings().missReasons) chip(chips, reason, () => void this.answer(path, missed(reason)));
		const other = chip(chips, "Other…", () => {
			this.other = path;
			this.render();
		}, "ghost");
		other.toggleClass("is-on", this.other === path);
		if (this.other !== path) return;
		const form = extra.createDiv("th-inline-form");
		const input = form.createEl("input", { cls: "th-inline-input", type: "text", attr: { placeholder: "What happened?", "aria-label": "Your reason" } });
		input.value = this.otherText;
		const save = chip(form, "Save", () => void submit(), "strong");
		const sync = () => {
			this.otherText = input.value;
			save.disabled = input.value.trim() === "";
		};
		const submit = async () => {
			const reason = input.value.trim();
			if (reason) await this.answer(path, missed(reason));
		};
		input.addEventListener("input", sync);
		input.addEventListener("keydown", (event) => {
			if (event.key !== "Enter") return;
			event.preventDefault();
			void submit();
		});
		sync();
		window.setTimeout(() => input.focus(), 0);
	}

	private renderShrink(row: HTMLElement, path: string, habit: Habit): void {
		const extra = row.createDiv("th-row-extra");
		const link = extra.createEl("button", { cls: "th-link" });
		icon(link, "shrink");
		link.appendText("Make it even tinier");
		link.addEventListener("click", () => new EditSheet(this.app, this.ui.service, path, habit, "tiny", this.ui.labels()).open());
	}

	private showMenu(path: string): void {
		if (this.menu === path) return;
		this.menu = path;
		this.menuOpening = true;
		this.haptics.tap();
		const entry = this.ui.repository.get(path);
		this.offTrigger = entry?.kind === "ok" && isOffTrigger(entry.habit.markOn(this.shownDay()));
		this.render();
	}

	/** A click elsewhere closes the answer menu, and the optional reasons of a skip. */
	private closeMenuOutside(event: MouseEvent): void {
		if (!this.menu && !this.asking) return;
		const target = event.target as HTMLElement | null;
		if (target?.closest(".th-row-choices, .th-mark-button, .th-row-extra")) return;
		this.unfolding?.stop();
		this.unfolding = null;
		this.closing = this.menu;
		this.menu = null;
		this.asking = null;
		this.other = null;
		this.otherText = "";
		this.render();
	}

	private async choose(path: string, answer: Answer, current: DayMark | undefined, event: MouseEvent): Promise<void> {
		const entry = this.ui.repository.get(path);
		const offTrigger = this.offTrigger && entry?.kind === "ok" && this.canGoOffTrigger(entry.habit);
		const same = (answer === "skip" && current?.kind === "missed") || (answer !== "skip" && current?.kind === answer && isOffTrigger(current) === offTrigger);
		if (same) return this.answer(path, undefined);
		if (answer === "skip") {
			await this.answer(path, SKIPPED, undefined, false);
			this.asking = path;
			this.render();
			return;
		}
		return this.answer(path, done(answer, offTrigger), event);
	}

	private async answer(path: string, mark: DayMark | undefined, event?: MouseEvent, leave = true): Promise<void> {
		if (!isDone(mark)) this.origins.delete(path);
		const target = event?.currentTarget as HTMLElement | null | undefined;
		if (target && isDone(mark)) {
			const box = target.getBoundingClientRect();
			this.origins.set(path, { point: { x: box.left + box.width / 2, y: box.top + box.height / 2 }, at: Date.now() });
		}
		try {
			const habit = await this.ui.service.setMark(path, this.shownDay(), mark);
			this.menu = null;
			this.asking = null;
			this.other = null;
			this.otherText = "";
			this.shrink = mark && offersShrink(habit, mark, this.ui.settings().redesignThreshold, this.ui.settings().shrinkReason) ? path : null;
			if (mark && leave && this.ui.settings().hideDone && !this.showDone) this.startLeaving(path);
			else this.leaving.delete(path);
			if (mark && isDone(mark)) {
				this.haptics.tap();
				this.celebrate(path);
				const phrase = habit.current("celebration");
				if (phrase && this.ui.settings().celebrationLine) this.caption(habit, phrase);
			}
			else this.stopCelebrating(path);
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		}
		this.render();
	}

	/** The answered row stays while its circle fills, then folds into the done line. */
	private startLeaving(path: string): void {
		const since = Date.now();
		this.leaving.set(path, since);
		window.setTimeout(() => {
			if (this.leaving.get(path) !== since) return;
			this.leaving.delete(path);
			this.render();
		}, LEAVE_MS);
	}

	private celebrate(path: string): void {
		this.stopCelebrating(path);
		this.celebrating.set(
			path,
			window.setTimeout(() => {
				this.celebrating.delete(path);
			}, POP_MS),
		);
	}

	private stopCelebrating(path: string): void {
		window.clearTimeout(this.celebrating.get(path));
		this.celebrating.delete(path);
	}

	private syncJar(entries: readonly HabitEntry[]): void {
		// Until the sheet has its place there is no floor; marbles laid out now would be shot up when it appears.
		if (!this.jar || this.sheetTop <= 0) return;
		const today = this.ui.service.today();
		const names = new Map<string, Habit>();
		const items: JarItem[] = entries.flatMap((entry) => {
			if (entry.kind !== "ok") return [];
			names.set(entry.path, entry.habit);
			const color = this.resolve(entry.habit.color);
			return buildJar(entry.habit, today, this.ui.settings().merge).map((piece) => ({ ...piece, key: `${entry.path}|${piece.id}`, group: entry.path, color }));
		});
		this.jar.setOptions({
			...this.jarOptions(),
			onMerge: (item) => {
				this.haptics.merge();
				const habit = names.get(item.group);
				const { smallPerMedium, mediumPerBig } = this.ui.settings().merge;
				if (habit) this.caption(habit, `${item.size === "big" ? smallPerMedium * mediumPerBig : smallPerMedium} wins`);
			},
		});
		const now = Date.now();
		for (const [path, origin] of this.origins) if (now - origin.at > ORIGIN_TTL_MS) this.origins.delete(path);
		const used = this.jar.sync(items, new Map([...this.origins].map(([path, origin]) => [path, origin.point])));
		for (const path of used) this.origins.delete(path);
	}

	/** A short line above the marbles in the habit's color; a new one replaces the one on screen. */
	private caption(habit: Habit, text: string): void {
		this.captionEl?.remove();
		window.clearTimeout(this.captionTimer);
		this.captionEl = this.contentEl.createDiv({ cls: ["th-caption", "th-habit", colorClass(habit.color)], text });
		this.captionTimer = window.setTimeout(() => {
			this.captionEl?.remove();
			this.captionEl = null;
		}, CAPTION_MS);
	}

	private jarOptions() {
		const settings = this.ui.settings();
		return {
			material: settings.material,
			reduceMotion: settings.reduceMotion,
			sizes: settings.marbleSizes,
			speed: settings.speed / 100,
			screenCorners: this.ui.screenCorners(),
			background: this.resolveVar("--background-primary"),
			onImpact: (strength: number) => this.haptics.impact(strength),
		};
	}

	/** "Not at trigger" means something only when it is turned on, for a habit that allows it and has a trigger to miss. */
	private canGoOffTrigger(habit: Habit): boolean {
		return this.ui.settings().notAtTrigger && habit.anytime && habit.current("anchor") !== undefined;
	}

	private cursorPushEnabled(): boolean {
		const settings = this.ui.settings();
		return settings.cursorPush && !settings.reduceMotion;
	}

	private tiltEnabled(): boolean {
		const settings = this.ui.settings();
		return settings.tilt && !settings.reduceMotion;
	}

	/** The motion sensor runs only while Today is actually on screen: not in a background tab, not with the app hidden. */
	private applyTilt(): void {
		if (!this.tiltEnabled() || !Platform.isMobile) {
			this.tilt.stop();
			this.jar?.setGravity(IN_HAND);
			return;
		}
		if (!this.contentEl.isShown() || document.hidden) {
			this.tilt.stop();
			return;
		}
		this.tilt.start();
		void this.tilt.askSilently();
	}

	private resolve(color: HabitColor | undefined): Hsl {
		const key = color ?? "accent";
		const cached = this.colors.get(key);
		if (cached) return cached;
		const resolved = this.probe(["th-habit", colorClass(color)], "var(--th-habit)") ?? FALLBACK_COLOR;
		this.colors.set(key, resolved);
		return resolved;
	}

	private resolveVar(name: string): Hsl {
		return this.probe([], `var(${name})`) ?? { h: 0, s: 0, l: 12 };
	}

	private probe(classes: string[], color: string): Hsl | null {
		const probe = this.contentEl.createSpan({ cls: classes });
		probe.addClass("th-probe");
		probe.setCssProps({ color });
		const value = getComputedStyle(probe).color;
		probe.remove();
		return parseColor(value);
	}
}

