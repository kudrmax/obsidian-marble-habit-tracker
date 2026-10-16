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
import { StripDay, closedDayLine, dayStrip, dayTitle, winsLabel, offersShrink, todayEntries } from "./today";
import { weekdayShort } from "./format";
import { UiContext } from "./UiContext";

export const HABITS_VIEW = "tiny-habits-grid";
const SVG_NS = "http://www.w3.org/2000/svg";
const RING_RADIUS = 50;
const RING_GAP = 9;

/** How long the circle of a just-marked habit keeps popping, while its row is still on screen. */
const POP_MS = 450;
const CAPTION_MS = 2000;
/** The word on each answer: short and the same whatever the recipe's fields are called. */
const CHOICE_WORDS: Record<Answer, string> = { full: "Full", tiny: "Tiny", skip: "Skip" };
const DAY_CHECK_MS = 60_000;
/** How far a day's column reaches under the sheet; matches `--th-day-under` in the styles. */
const DAY_UNDER = 40;
/** How far the sheet drops before the days are fully in sight. */
const DAYS_FADE_IN = 48;
/** The height a day's fill needs to hold its count inside. */
const DAY_VALUE_ROOM = 32;
/** Obsidian re-reads a note a moment after it is written, so the tap point has to wait for the new mark. */
const ORIGIN_TTL_MS = 4000;
const FALLBACK_COLOR: Hsl = { h: 258, s: 88, l: 66 };
/** How long to wait for the plugin's stylesheet before reading the colors again. */
const STYLES_RETRY_MS = 200;

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
	private stylesTimer = 0;
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
	/** The row whose choices just closed, to bring its circle and name back. */
	private closing: string | null = null;
	/** The choices as they stood when closed without an answer, to slide back out past the row's left edge. */
	private leavingChoices: HTMLElement | null = null;
	private shelves: readonly Box[] = [];
	/** The day the strip was last scrolled to, so it only scrolls again when the shown day changes. */
	private stripDay: string | null = null;
	/** Whether the sheet is pulled down far enough to show the days. */
	private stripOpen = false;
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
		window.clearTimeout(this.stylesTimer);
		for (const timer of this.celebrating.values()) window.clearTimeout(timer);
	}

	refresh(): void {
		this.jar?.setOptions(this.jarOptions());
		if (!this.cursorPushEnabled()) this.jar?.setPusher(null);
		this.applyTilt();
		this.render();
	}

	/**
	 * Redraws the list where it stands. While the column is rebuilt it is briefly shorter, and anything that measures
	 * mid-way lets the browser pull the scroll up, so the scroll is put back once the column is whole again.
	 */
	private render(): void {
		if (!this.columnEl) return;
		if (this.rowDrag?.active) {
			this.stale = true;
			return;
		}
		this.stale = false;
		const scrolled = this.scrollEl.scrollTop;
		this.draw(this.columnEl);
		this.scrollEl.scrollTop = scrolled;
	}

	private draw(column: HTMLElement): void {
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
		this.renderDays(all);
		this.renderHead();
		const chipLine = this.renderDayChip(column);
		const hideDone = this.ui.settings().hideDone;
		const hidden = hideDone && !this.showDone ? answeredHabits.filter((entry) => !this.leaving.has(entry.path)).length : 0;
		const tools = () => this.renderTools(hidden, hideDone && answeredHabits.length > 0);
		const place = (element: HTMLElement) => (chipLine ? chipLine.appendChild(element) : column.appendChild(this.toolsLine(element)));
		if (closed) {
			place(tools());
			this.renderRing(column, habits.map((entry) => entry.habit), this.wasClosed === false);
		}
		this.wasClosed = closed;
		if (habits.length === 0) {
			place(tools());
			column.createDiv("th-ring-block").createEl("h2", { cls: "th-title", text: "Nothing for today" });
		}

		const open =(entry: Extract<HabitEntry, { kind: "ok" }>) =>
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
		// The buttons sit on the first header's line, so the habits start as high as they can.
		let pending: HTMLElement | null = closed || habits.length === 0 ? null : tools();
		if (pending && chipLine) {
			chipLine.appendChild(pending);
			pending = null;
		}
		let section: string | undefined | null = null;
		for (const entry of shown) {
			if (entry.habit.section !== section) {
				section = entry.habit.section;
				if (section !== undefined) {
					const header = this.renderSection(column, section);
					if (pending) header.appendChild(pending);
					pending = null;
				}
			}
			if (pending) {
				column.appendChild(this.toolsLine(pending));
				pending = null;
			}
			this.renderRow(column, entry.path, entry.habit);
		}
		if (pending) column.appendChild(this.toolsLine(pending));
		for (const entry of entries) if (entry.kind === "broken") this.renderBroken(column, entry);
		this.renderNewSection(column);
		this.shownRows = this.renderingRows;
		this.playMotion(column);
	}

	/** The sheet moved: the day columns stretch to its edge, and the shown day's count keeps where it can be read. */
	private sheetMoved(top: number): void {
		const strip = this.sheet?.days;
		// Each time the days come into sight they open on the shown day; Obsidian may have reset their scroll meanwhile.
		const shown = strip ? top - strip.offsetTop : 0;
		const open = shown > 2;
		if (open && !this.stripOpen) this.scrollToShownDay();
		this.stripOpen = open;
		// Hidden while the sheet is up, or its labels would show in the sheet's rounded corners.
		strip?.style.setProperty("opacity", String(Math.min(1, Math.max(0, shown / DAYS_FADE_IN))));
		this.placeDayValue();
	}

	/** The marbles fall to the bottom of the screen, over the sheet, and lie on Obsidian's bars there. */
	private updateFloor(): void {
		this.jar?.setObstacles(this.shelves);
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
		this.sheet?.snap("up");
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
	 * The days under the sheet, one column each: how much of the day was done fills it from the bottom, and the column
	 * reaches under the sheet's edge so it stretches as the sheet is pulled down. A tap shows that day. The strip keeps
	 * where it was scrolled, and moves only to bring a newly shown day into view.
	 */
	private renderDays(all: readonly HabitEntry[]): void {
		const strip = this.sheet?.days;
		if (!strip) return;
		const scrolled = strip.scrollLeft;
		strip.empty();
		const today = this.ui.service.today();
		const shown = this.shownDay();
		const row = strip.createDiv("th-days-row");
		let selected: HTMLElement | null = null;
		for (const day of dayStrip(all, today)) {
			const button = this.renderDay(row, day, day.date.equals(shown), day.date.equals(today));
			if (day.date.equals(shown)) selected = button;
		}
		strip.scrollLeft = scrolled;
		if (selected && this.stripDay !== shown.toString()) this.scrollToShownDay();
		this.placeDayValue();
	}

	/** Brings the shown day into view, a little right of the middle; waits until the strip has a width to scroll in. */
	private scrollToShownDay(): void {
		const strip = this.sheet?.days;
		const selected = strip?.querySelector<HTMLElement>(".th-day.is-selected");
		// Before Obsidian has laid the view out, the strip can have a width while its days still sit at zero.
		if (!strip || !selected || strip.clientWidth === 0 || (selected.offsetLeft === 0 && selected.previousElementSibling)) return;
		strip.scrollLeft = selected.offsetLeft - (strip.clientWidth - selected.offsetWidth) * 0.6;
		this.stripDay = this.shownDay().toString();
	}

	private renderDay(row: HTMLElement, day: StripDay, selected: boolean, today: boolean): HTMLElement {
		const share = day.due === 0 ? 0 : day.done / day.due;
		const button = row.createEl("button", { cls: "th-day", attr: { "aria-label": dayTitle(day.date, this.ui.service.today()), "aria-pressed": String(selected) } });
		button.toggleClass("is-selected", selected);
		button.toggleClass("is-today", today);
		button.toggleClass("is-future", day.future);
		button.style.setProperty("--th-share", String(share));
		button.createSpan({ cls: "th-day-dow", text: weekdayShort(day.date.weekday()) });
		button.createSpan({ cls: "th-day-num", text: String(day.date.day) });
		const fill = button.createSpan("th-day-pill").createSpan("th-day-fill");
		if (selected && day.due > 0) fill.createSpan({ cls: "th-day-value", text: `${day.done}/${day.due}` });
		button.disabled = day.future;
		button.addEventListener("click", () => this.showDay(day.date));
		return button;
	}

	/** The shown day's count sits at the top of its fill, or just above it when the fill is too short to hold it. */
	private placeDayValue(): void {
		const day = this.sheet?.days.querySelector<HTMLElement>(".th-day.is-selected");
		const fill = day?.querySelector<HTMLElement>(".th-day-fill");
		if (!day || !fill) return;
		const visible = fill.getBoundingClientRect().height - DAY_UNDER;
		day.toggleClass("is-low", visible < DAY_VALUE_ROOM);
	}

	/** On a past day, a chip at the top says which one, and its cross goes back to today. */
	private renderDayChip(column: HTMLElement): HTMLElement | null {
		const today = this.ui.service.today();
		const shown = this.shownDay();
		if (shown.equals(today)) return null;
		const line = column.createDiv("th-day-chip-line");
		const chip = line.createEl("button", { cls: "th-day-chip", attr: { "aria-label": "Back to today" } });
		chip.createSpan({ text: dayTitle(shown, today) });
		setIcon(chip.createSpan("th-day-chip-x"), "x");
		chip.addEventListener("click", () => this.showDay(today));
		return line;
	}

	/**
	 * Today's buttons, small and round: how many answered habits are hidden (a tap shows them), All habits, a new
	 * habit, and the help. They ride on the first section header's line.
	 */
	private renderTools(hidden: number, foldable: boolean): HTMLElement {
		const tools = createDiv("th-tools");
		if (foldable) {
			const count = this.showDone ? "" : String(hidden);
			const done = tools.createEl("button", { cls: "th-tool th-tool-done", attr: { "aria-label": this.showDone ? "Hide answered" : "Show answered", "aria-pressed": String(this.showDone) } });
			setIcon(done.createSpan("th-tool-icon"), this.showDone ? "eye-off" : "check");
			if (count) done.createSpan({ cls: "th-tool-count", text: count });
			done.addEventListener("click", () => {
				this.showDone = !this.showDone;
				this.render();
			});
		}
		const button = (label: string, iconName: string, onClick: () => void) => {
			const element = tools.createEl("button", { cls: "th-tool", attr: { "aria-label": label } });
			setIcon(element.createSpan("th-tool-icon"), iconName);
			element.addEventListener("click", onClick);
			return element;
		};
		button("All habits", "list", () => this.showAll());
		button("New habit", "plus", () => this.ui.newHabit());
		const help = tools.createEl("button", { cls: "th-tool th-tool-help", text: "?", attr: { "aria-label": "How it works" } });
		help.toggleClass("th-has-dot", !this.ui.settings().hintsSeen);
		help.addEventListener("click", () => {
			new HelpModal(this.app, helpRows(Platform.isMobile, this.ui.settings().merge)).open();
			this.ui.markHintsSeen();
		});
		return tools;
	}

	/** The buttons on a line of their own, when no section header starts the list. */
	private toolsLine(tools: HTMLElement): HTMLElement {
		const line = createDiv("th-tools-line");
		line.appendChild(tools);
		return line;
	}

	/** The sheet's header holds All habits' way back; on Today it stays empty, the habits come first. */
	private renderHead(): void {
		const head = this.sheet?.head;
		if (!head) return;
		head.empty();
		this.sheet?.days.toggleClass("is-hidden", this.screen === "all");
		if (this.screen !== "all") return;
		const line = head.createDiv("th-head-line");
		const back = line.createEl("button", { cls: "th-back" });
		setIcon(back.createSpan("th-back-icon"), "chevron-left");
		back.appendText("Today");
		back.addEventListener("click", () => this.showToday());
		line.createEl("h2", { cls: "th-sheet-title", text: "All habits" });
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

	private renderSection(column: HTMLElement, section: string): HTMLElement {
		const header = column.createDiv({ cls: "th-group", attr: { "data-slot": "header", "data-section": section } });
		header.createSpan({ cls: "th-group-name", text: section });
		return header;
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
			this.motion.refold(main, this.contentOf(main), this.leavingChoices);
			this.leavingChoices = null;
			this.closing = null;
		}
		if (this.asking === path) this.renderReasons(row, path);
		if (this.shrink === path && mark?.kind === "missed") this.renderShrink(row, path, habit);
	}

	/**
	 * The answers in the row as capsules: the circle as it will look once chosen — full, tiny, skip — with the answer's
	 * word beside it, and cancel where the circle was, under the finger. They wait ready past the row's left edge and
	 * slide in together in one move while the circle and the name fade where they are. A tap anywhere else brings the
	 * row back.
	 */
	private renderChoices(main: HTMLElement, path: string, habit: Habit, mark: DayMark | undefined): void {
		const labels = this.ui.labels();
		const offTrigger = this.offTrigger && this.canGoOffTrigger(habit);
		const chosen = (kind: "full" | "tiny") => mark?.kind === kind && isOffTrigger(mark) === offTrigger;
		const bar = main.createDiv("th-row-choices");
		const marble = (label: string, look: string[], sign: "x" | "check" | null, word?: string) => {
			// A button that shows its word needs no tooltip saying it again.
			const button = bar.createEl("button", { cls: "th-choice", attr: word ? { "aria-label": label } : { "aria-label": label, title: label } });
			const ball = button.createSpan("th-choice-ball");
			const face = ball.createSpan({ cls: ["th-mark", ...look] });
			if (sign) icon(face, sign);
			if (word) {
				button.addClass("has-word");
				ball.addClasses(["is-word", ...look]);
				ball.createSpan({ cls: "th-choice-word", text: word });
			}
			return button;
		};
		const cancel = marble("Cancel", ["th-choice-cancel"], "x");
		cancel.addEventListener("click", () => this.closeChoices());
		const option = (answer: Answer, label: string, look: string[], sign: "check" | null, selected: boolean) => {
			const button = marble(label, look, sign, CHOICE_WORDS[answer]);
			button.setAttr("aria-pressed", String(selected));
			button.addEventListener("click", (event) => {
				this.unfolding?.stop();
				this.unfolding = null;
				button.addClass("is-picked");
				this.haptics.tap();
				void this.choose(path, answer, mark, event);
			});
		};
		if (habit.hasFull) option("full", labels.title("full"), ["is-done"], "check", chosen("full"));
		if (habit.hasTiny) option("tiny", labels.title("tiny"), ["is-done", "is-tiny"], "check", chosen("tiny"));
		option("skip", "Skip", ["is-missed"], null, mark?.kind === "missed");
		if (this.canGoOffTrigger(habit)) {
			const toggle = bar.createEl("button", { cls: "th-choices-toggle", attr: { "aria-pressed": String(this.offTrigger), "aria-label": "Not at trigger", title: "Not at trigger" } });
			setIcon(toggle, "unlink");
			toggle.addEventListener("click", () => {
				this.offTrigger = !this.offTrigger;
				this.render();
			});
		}
		main.addClass("is-choosing");
		if (!this.menuOpening) return;
		this.menuOpening = false;
		this.unfolding = this.motion.slideChoices(bar, this.contentOf(main));
	}

	/** Back from the choices to the row; anything still unfolding stops at once, so cancel works mid-animation. */
	private closeChoices(): void {
		this.takeChoices();
		this.unfolding?.stop();
		this.unfolding = null;
		this.closing = this.menu;
		this.menu = null;
		this.render();
	}

	/** Keeps a copy of the open choices where they stand, even mid-slide, so they can leave the way they came. */
	private takeChoices(): void {
		const bar = this.contentEl.querySelector<HTMLElement>(".th-row-choices");
		if (!bar) return;
		const transform = getComputedStyle(bar).transform;
		const offset = transform === "none" ? 0 : new DOMMatrix(transform).m41;
		const copy = bar.cloneNode(true) as HTMLElement;
		copy.removeClass("is-arriving");
		copy.style.transform = `translateX(${offset}px)`;
		this.leavingChoices = copy;
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
		const hint = mark ? "Clear the mark" : `Choose: ${first}, ${labels.of("full")} or skipped`;
		const button = parent.createEl("button", { cls: "th-mark-button", attr: { title: hint } });
		button.createSpan({ cls: "th-sr-only", text: hint });
		const circle = button.createSpan("th-mark");
		if (isDone(mark)) {
			circle.addClass("is-done");
			circle.toggleClass("is-tiny", mark?.kind === "tiny");
			if (this.celebrating.has(path)) circle.addClass("is-popping");
			icon(circle, "check");
		} else if (mark?.kind === "missed") circle.addClass("is-missed");
		else if (this.asking === path) circle.addClass("is-asking");

		button.addEventListener("contextmenu", (event) => {
			event.preventDefault();
			this.showMenu(path);
		});
		button.addEventListener("click", () => {
			if (!mark) return this.showMenu(path);
			this.haptics.tap();
			void this.answer(path, undefined);
		});
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
		this.takeChoices();
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
		if (!this.jar) return;
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
		const resolved = this.probe(["th-habit", colorClass(color)], "var(--th-habit)");
		if (!resolved) {
			this.waitForStyles();
			return FALLBACK_COLOR;
		}
		this.colors.set(key, resolved);
		return resolved;
	}

	private resolveVar(name: string): Hsl {
		return this.probe([], `var(${name})`) ?? { h: 0, s: 0, l: 12 };
	}

	/**
	 * Reads a color off a hidden probe. Right after the plugin loads its stylesheet may not be in yet: the probe then
	 * isn't hidden and only inherits the text color, which would paint every marble black; that read gives nothing.
	 */
	private probe(classes: string[], color: string): Hsl | null {
		const probe = this.contentEl.createSpan({ cls: classes });
		probe.addClass("th-probe");
		probe.setCssProps({ color });
		const style = getComputedStyle(probe);
		const styled = style.display === "none";
		const value = style.color;
		probe.remove();
		return styled ? parseColor(value) : null;
	}

	/** Reads the colors again once the stylesheet has had a moment to arrive. */
	private waitForStyles(): void {
		if (this.stylesTimer) return;
		this.stylesTimer = window.setTimeout(() => {
			this.stylesTimer = 0;
			this.colors.clear();
			this.refresh();
		}, STYLES_RETRY_MS);
	}
}

