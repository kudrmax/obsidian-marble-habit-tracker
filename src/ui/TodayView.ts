import { ItemView, Notice, Platform, ViewStateResult, WorkspaceLeaf, setIcon } from "obsidian";
import { HabitEntry } from "../application/ports";
import { DayMark, FULL, OFF_TRIGGER, SKIPPED, TINY, isWin, missed } from "../domain/DayMark";
import { Habit } from "../domain/Habit";
import { LocalDate } from "../domain/LocalDate";
import { HabitColor } from "../domain/HabitColor";
import { HabitBlock } from "./HabitBlock";
import { buildJar } from "../domain/Jar";
import { colorClass } from "./colors";
import { IconName, chip, icon, iconButton, markCircle, toolButton } from "./components";
import { recipeDays } from "./format";
import { computeStats } from "../domain/Stats";
import { MarbleFeel, marbleFeel } from "../settings";
import { DayWatcher } from "./DayWatcher";
import { EditSheet } from "./EditSheet";
import { Haptics } from "./Haptics";
import { Hsl, parseColor } from "./jar/color";
import { floorScale, scaleSizes } from "./jar/JarAssets";
import { JarCanvas, JarItem } from "./jar/JarCanvas";
import { KeyboardWatch } from "./KeyboardWatch";
import { LEAVE_MS, Motion, Side, Slide } from "./Motion";
import { CalendarTray } from "./CalendarTray";
import { TodayPanel } from "./TodayPanel";
import { Box } from "./jar/JarPhysics";
import { Point } from "./jar/JarPhysics";
import { IN_HAND, TiltSensor } from "./jar/TiltSensor";
import { Placement, arrange, groupBySection, visibleEntries } from "./order";
import { Drop, RowDrag } from "./RowDrag";
import { SectionNameModal } from "./SectionNameModal";
import { MarbleCalibration } from "./MarbleCalibration";
import { ScreenChrome } from "./ScreenChrome";
import { WeekCalendar } from "./WeekCalendar";
import { WeekGrid } from "./WeekGrid";
import { closedDayLine, dayStrip, dayTitle, winsLabel, offersShrink, todayEntries } from "./today";
import { UiContext } from "./UiContext";
import { daysTitle, daysUpTo, weekCells } from "./week";

export const HABITS_VIEW = "tiny-habits-grid";
/** The tool that turns Today into the week's grid and back. */
const WEEK_ICON = "calendar-range";
const SVG_NS = "http://www.w3.org/2000/svg";
const RING_RADIUS = 50;
const RING_GAP = 9;
/** Each habit's arc of a closed day draws in this long after the one before. */
const ARC_STAGGER_MS = 90;

/** How long the circle of a just-marked habit keeps popping, while its row is still on screen. */
const POP_MS = 450;
const CAPTION_MS = 2000;
/** The word on each answer: short and the same whatever the recipe's fields are called. */
const CHOICE_WORDS: Record<Answer, string> = { full: "Full", tiny: "Tiny", offTrigger: "Anytime", skip: "Skip" };
const ANSWER_MARKS: Record<Answer, DayMark> = { full: FULL, tiny: TINY, offTrigger: OFF_TRIGGER, skip: SKIPPED };
const DAY_CHECK_MS = 60_000;
/** Obsidian re-reads a note a moment after it is written, so the tap point has to wait for the new mark. */
const ORIGIN_TTL_MS = 4000;
const FALLBACK_COLOR: Hsl = { h: 258, s: 88, l: 66 };
/** How long to wait for the plugin's stylesheet before reading the colors again. */
const STYLES_RETRY_MS = 200;
/** The room kept for the pile grows and shrinks a marble's worth at a time, so a pile that only shifts lays nothing out again. */
const PILE_STEP = 16;

type Answer = "full" | "tiny" | "offTrigger" | "skip";
/** Today as the shown day's list, or as its week's grid of every habit. */
type Layout = "day" | "week";
const isLayout = (value: unknown): value is Layout => value === "day" || value === "week";

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
	private asking: string | null = null;
	private other: string | null = null;
	private otherText = "";
	private shrink: string | null = null;
	private showDone = false;
	/** A past day picked with the arrows, to mark what was forgotten; none means today. */
	private day: LocalDate | null = null;
	/** Today's list, or every habit including the ones not due and the archived ones. */
	private screen: "today" | "all" = "today";
	private layout: Layout = "day";
	/** On the week's grid, the day of the circle being answered, its skip's reasons and the offer to shrink; on the list it is the shown day. */
	private answering: LocalDate | null = null;
	private grid: WeekGrid | null = null;
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
	private panel: TodayPanel | null = null;
	/** The days: in a tray on a phone, over the list on a computer. */
	private tray: CalendarTray | null = null;
	private week: WeekCalendar | null = null;
	/** How much bigger than their set size the marbles are on this view's floor. */
	private marbleScale = 1;
	/** The choices' arrival while it plays, so a cancel mid-way stops it. */
	private unfolding: { stop(): void } | null = null;
	/** The row whose choices just closed, to bring its circle and name back. */
	private closing: string | null = null;
	/** The choices as they stood when closed without an answer, to slide back out past the row's left edge. */
	private leavingChoices: HTMLElement | null = null;
	private shelves: readonly Box[] = [];
	private calibration: MarbleCalibration | null = null;
	/** The feel being tried on the sliders, shown instead of the saved one until the calibration ends. */
	private trialFeel: MarbleFeel | null = null;
	private readonly tilt = new TiltSensor((tilt) => this.jar?.setTilt(tilt));
	/** How high the marbles last stood, as the list keeps room for them. */
	private pile = -1;

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

	/** The list or the grid is part of the tab's state, so a tab opens again the way it was left on this device. */
	override getState(): Record<string, unknown> {
		return { ...super.getState(), layout: this.layout };
	}

	override async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const layout: unknown = state && typeof state === "object" && "layout" in state ? state.layout : undefined;
		if (isLayout(layout)) this.layout = layout;
		await super.setState(state, result);
		this.render();
	}

	override async onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass("tiny-habits", "th-today");
		const panel = new TodayPanel(root);
		this.panel = panel;
		this.scrollEl = panel.scroll;
		this.columnEl = this.scrollEl.createDiv("th-column");
		this.registerDomEvent(this.columnEl, "focusout", () => window.setTimeout(() => this.stale && this.render()));
		this.rowDrag = new RowDrag(
			this.columnEl,
			() => this.haptics.tap(),
			(drop) => this.dropped(drop),
		);
		this.jar = new JarCanvas(root, this.jarOptions());
		this.grid = new WeekGrid({
			tap: (path, day, mark) => this.tapCell(path, day, mark),
			choose: (path, day) => this.showMenu(path, day),
		});
		// A phone keeps the days in a tray to pull up; a computer has the room to show them over the list, and a wide view
		// grows the marbles so they still make a pile on its floor.
		if (Platform.isMobile) this.tray = new CalendarTray(root, () => this.haptics.tap(), () => this.updateFloor());
		else {
			this.week = new WeekCalendar(panel.sheet, panel.head);
			const sizer = new ResizeObserver(() => this.fitMarbles());
			sizer.observe(root);
			this.register(() => sizer.disconnect());
		}
		this.updateFloor();
		this.chrome = new ScreenChrome(root, this.containerEl, (shelves, ledges) => {
			this.shelves = shelves;
			this.tray?.setInset(Math.max(0, ...shelves.map((shelf) => Math.ceil(root.clientHeight - shelf.top))));
			this.updateFloor();
			this.jar?.setLedges(ledges);
		});
		const keyboard = new KeyboardWatch(root, () => {
			this.jar?.refit();
			this.tray?.refit();
		});
		this.keyboard = keyboard;
		this.jar.holdWhile(() => keyboard.isOpen());
		this.tray?.holdWhile(() => keyboard.isOpen());
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
		this.calibration?.close();
		this.tilt.stop();
		this.chrome?.destroy();
		this.chrome = null;
		this.keyboard?.destroy();
		this.keyboard = null;
		this.rowDrag?.destroy();
		this.rowDrag = null;
		this.jar?.destroy();
		this.jar = null;
		this.tray?.destroy();
		this.tray = null;
		this.week = null;
		this.grid = null;
		this.panel = null;
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

	/** Puts the marble sliders over Today: the marbles on screen follow them until they are saved or cancelled. */
	calibrateMarbles(save: (feel: MarbleFeel) => void, end: () => void): void {
		this.calibration?.close();
		this.calibration = new MarbleCalibration(this.contentEl, marbleFeel(this.ui.settings()), {
			try: (feel) => {
				this.trialFeel = feel;
				this.jar?.setOptions(this.jarOptions());
			},
			drop: () => {
				this.jar?.sync([], new Map());
				this.render();
			},
			save,
			end: () => {
				this.calibration = null;
				this.trialFeel = null;
				this.jar?.setOptions(this.jarOptions());
				end();
			},
		});
	}

	/**
	 * Redraws the list where it stands. While the column is rebuilt it is briefly shorter, and anything that measures
	 * mid-way lets the browser pull the scroll up, so the scroll is put back once the column is whole again.
	 */
	private render(): void {
		if (!this.columnEl) return;
		if (this.rowDrag?.active || this.isEditing()) {
			this.stale = true;
			return;
		}
		this.stale = false;
		const scrolled = this.scrollEl.scrollTop;
		this.draw(this.columnEl);
		this.scrollEl.scrollTop = scrolled;
	}

	/** A value in an open card's panel is being typed: a redraw now would throw the unsaved text away. */
	private isEditing(): boolean {
		const active = document.activeElement;
		return active instanceof HTMLElement && active.isContentEditable && !!this.columnEl?.contains(active);
	}

	private draw(column: HTMLElement): void {
		column.empty();
		this.renderingRows = new Set();
		const all = visibleEntries(this.ui.repository.list());
		this.syncJar(all);
		this.contentEl.toggleClass("is-week", this.showsWeek() && all.length > 0);
		if (all.length === 0) {
			this.renderEmpty(column);
			return;
		}
		if (this.screen === "all") {
			this.renderCalendar(all);
			this.renderAll(column, all);
			this.showTools(this.renderTools(0, false));
			this.playMotion(column);
			return;
		}
		if (this.layout === "week") return this.renderWeek(column, all);
		const today = this.shownDay();
		const entries = todayEntries(all, today);
		const habits = entries.flatMap((entry) => (entry.kind === "ok" ? [entry] : []));
		const answeredHabits = habits.filter((entry) => entry.habit.markOn(today) !== undefined);
		const closed = habits.length > 0 && answeredHabits.length === habits.length && this.leaving.size === 0;
		this.renderCalendar(all);
		this.renderHead();
		this.renderDayChip(column);
		const hideDone = this.ui.settings().hideDone;
		const hidden = hideDone && !this.showDone ? answeredHabits.filter((entry) => !this.leaving.has(entry.path)).length : 0;
		this.showTools(this.renderTools(hidden, hideDone && answeredHabits.length > 0));
		if (closed) this.renderRing(column, habits.map((entry) => entry.habit), this.wasClosed === false);
		this.wasClosed = closed;
		if (habits.length === 0) column.createDiv("th-ring-block").createEl("h2", { cls: "th-title", text: "Nothing for today" });

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
		this.renderRows(column, ordered.filter((entry) => !hideDone || this.showDone || open(entry)), entries);
	}

	/**
	 * Habits in order, each section's header over its rows, the ones that can't be read under them and the zone to drop
	 * a row on for a new section: the list and the grid lay them out alike, so both are rearranged by dragging alike.
	 */
	private renderRows(column: HTMLElement, rows: readonly Extract<HabitEntry, { kind: "ok" }>[], entries: readonly HabitEntry[]): void {
		let section: string | undefined | null = null;
		for (const entry of rows) {
			if (entry.habit.section !== section) {
				section = entry.habit.section;
				if (section !== undefined) this.renderSection(column, section);
			}
			this.renderRow(column, entry.path, entry.habit);
		}
		for (const entry of entries) if (entry.kind === "broken") this.renderBroken(column, entry);
		this.renderNewSection(column);
		this.shownRows = this.renderingRows;
		this.playMotion(column);
	}

	/** The marbles fall over the list and stand on the calendar's tray, wherever it is, above Obsidian's bars. */
	private updateFloor(): void {
		this.jar?.setObstacles(this.tray ? [...this.shelves, this.tray.box()] : this.shelves);
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

	/**
	 * The days up to the shown day as a grid, as many as the settings say: Today's rows for every habit, by section,
	 * each with a circle for each day on its right, answered right there as on the list, the answers sliding over the
	 * row while the calendar picks the day they are for. A computer names the days in a chip that goes back to today; a
	 * phone's tray has a button for that.
	 */
	private renderWeek(column: HTMLElement, all: readonly HabitEntry[]): void {
		const today = this.ui.service.today();
		const shown = this.shownDay();
		this.renderCalendar(all);
		this.renderHead();
		if (!shown.equals(today) && !this.tray) column.appendChild(this.backChip(daysTitle(shown, today, this.ui.settings().gridDays), "Back to today"));
		this.showTools(this.renderTools(0, false));
		const habits = all.flatMap((entry) => (entry.kind === "ok" ? [entry] : []));
		this.renderRows(column, groupBySection(habits, (entry) => entry.habit.section).flatMap((group) => group.items), all);
	}

	private showsWeek(): boolean {
		return this.screen === "today" && this.layout === "week";
	}

	/** Shows the week's grid, from the command. */
	showWeek(): void {
		this.setLayout("week");
	}

	/** Turns Today into the week's grid or back into the list, either on today; the tab remembers which. */
	private setLayout(layout: Layout): void {
		this.tray?.snap(false);
		this.layout = layout;
		this.screen = "today";
		this.day = null;
		this.leaving.clear();
		this.menu = null;
		this.asking = null;
		this.other = null;
		this.otherText = "";
		this.shrink = null;
		this.answering = null;
		this.showDone = false;
		this.wasClosed = null;
		this.app.workspace.requestSaveLayout();
		this.render();
	}

	showAll(): void {
		this.tray?.snap(false);
		this.slide = this.screen === "all" ? null : "push";
		this.screen = "all";
		this.menu = null;
		this.asking = null;
		this.shrink = null;
		this.answering = null;
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
			sub: `${recipeDays(habit.currentSchedule)} · ${winsLabel(computeStats(habit, this.ui.service.today(), this.ui.settings().wins).total)}`,
		});
	}

	/**
	 * A habit's card, the same on Today, on the grid and in All habits: a circle, then its name, which opens its recipe.
	 * `lead` puts Today's working circle in front, or nothing for null; `trail` puts the grid's circles after the name.
	 * The card is returned for what goes under it.
	 */
	private renderCard(
		column: HTMLElement,
		path: string,
		habit: Habit,
		options: { dimmed: boolean; sub?: string; attrs?: Record<string, string>; lead?: ((main: HTMLElement) => void) | null; trail?: (main: HTMLElement) => void },
	): HTMLElement {
		const row = column.createDiv({ cls: "th-row", attr: options.attrs ?? {} });
		row.toggleClass("is-answered", options.dimmed);
		const main = row.createDiv("th-row-main");
		if (options.lead) options.lead(main);
		else if (options.lead === undefined) main.createSpan("th-mark-slot").createSpan("th-mark");
		const text = main.createDiv("th-row-text");
		text.createDiv({ cls: "th-row-title", text: habit.name });
		if (options.sub) text.createDiv({ cls: "th-row-sub", text: options.sub });
		options.trail?.(main);
		text.setAttribute("aria-expanded", String(this.expanded === path));
		row.toggleClass("is-expanded", this.expanded === path);
		text.addEventListener("click", () => void this.toggleRecipe(path));
		if (this.expanded === path) this.renderRecipe(row, path);
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
	 * The calendar in the tray, on Today and in All habits, with the shown day picked; a tap on a day shows it on Today.
	 * Over the grid the calendar's row is the grid's own days, a date over or under each column, the day being answered
	 * picked: the folded tray's on a phone, the week over the list on a computer, whose arrows step as many days. Pulled
	 * up, the phone's tray marks them on the month with a band, and moving it moves the grid's days.
	 */
	private renderCalendar(all: readonly HabitEntry[]): void {
		const today = this.ui.service.today();
		const shown = this.shownDay();
		const days = dayStrip(all, today, this.ui.settings().wins);
		const pick = (day: LocalDate) => this.showDay(day);
		const grid = this.showsWeek();
		const count = this.ui.settings().gridDays;
		const focus = grid && (this.menu ?? this.asking) ? this.answering : null;
		if (grid) this.tray?.showRange(days, today, { end: shown, count, move: (end) => this.moveDays(end) });
		else this.tray?.show(days, shown, today, pick);
		this.tray?.setStrip(grid ? { days: daysUpTo(days, shown, today, count), focus } : null);
		if (grid) this.week?.follow(days, shown, today, pick, focus, count);
		else this.week?.show(days, shown, today, pick);
	}

	/** Today's buttons, on the month's line wherever the calendar is. */
	private showTools(tools: HTMLElement): void {
		this.tray?.setTools(tools);
		this.week?.setTools(tools);
	}

	/** On a past day, a chip at the top says which one, and its cross goes back to today. */
	private renderDayChip(column: HTMLElement): HTMLElement | null {
		const today = this.ui.service.today();
		const shown = this.shownDay();
		if (shown.equals(today)) return null;
		return column.appendChild(this.backChip(dayTitle(shown, today), "Back to today"));
	}

	/** A chip over the list or the grid naming the day or week on show; it and its cross go back to today. */
	private backChip(text: string, label: string): HTMLElement {
		const line = createDiv("th-day-chip-line");
		const chip = line.createEl("button", { cls: "th-day-chip", attr: { "aria-label": label } });
		chip.createSpan({ text });
		setIcon(chip.createSpan("th-day-chip-x"), "x");
		chip.addEventListener("click", () => this.showDay(this.ui.service.today()));
		return line;
	}

	/**
	 * The tray's buttons over the calendar, small and round: on Today, how many answered habits are hidden (a tap shows
	 * them) and All habits; on both screens, a new habit.
	 */
	private renderTools(hidden: number, foldable: boolean): HTMLElement {
		const tools = createDiv("th-tools");
		if (foldable) {
			const count = this.showDone ? "" : String(hidden);
			const done = tools.createEl("button", { cls: "th-tool th-tool-done", attr: { "aria-label": this.showDone ? "Hide answered" : "Show answered", "aria-pressed": String(this.showDone), "data-tooltip-position": "top" } });
			setIcon(done.createSpan("th-tool-icon"), this.showDone ? "eye-off" : "check");
			if (count) done.createSpan({ cls: "th-tool-count", text: count });
			done.addEventListener("click", () => {
				this.showDone = !this.showDone;
				this.render();
			});
		}
		const button = (label: string, iconName: string, onClick: () => void) => toolButton(tools, label, iconName, onClick);
		if (this.screen === "today") {
			const week = this.layout === "week";
			const toggle = button("Week", WEEK_ICON, () => this.setLayout(week ? "day" : "week"));
			toggle.toggleClass("is-on", week);
			toggle.setAttr("aria-pressed", String(week));
			button("All habits", "list", () => this.showAll());
		}
		button("New habit", "plus", () => this.ui.newHabit());
		return tools;
	}

	/** The sheet's header holds All habits' way back; on Today it stays empty, the habits come first. */
	private renderHead(): void {
		const head = this.panel?.head;
		if (!head) return;
		head.empty();
		if (this.screen !== "all") return;
		const line = head.createDiv("th-head-line");
		const back = line.createEl("button", { cls: "th-back" });
		setIcon(back.createSpan("th-back-icon"), "chevron-left");
		back.appendText(this.layout === "week" ? "Week" : "Today");
		back.addEventListener("click", () => this.showToday());
		line.createEl("h2", { cls: "th-sheet-title", text: "All habits" });
	}

	/** A closed day: a ring with an arc per habit, a win in its color and anything else in grey. */
	private renderRing(column: HTMLElement, habits: readonly Habit[], justClosed: boolean): void {
		const day = this.shownDay();
		const wins = this.ui.settings().wins;
		const done = habits.filter((habit) => isWin(habit.markOn(day), wins)).length;
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
			circle.style.setProperty("animation-delay", `${index * ARC_STAGGER_MS}ms`);
		};
		arc(["th-ring-track"], circumference, 0, 0);
		habits.forEach((habit, index) => {
			const classes = isWin(habit.markOn(day), wins) ? ["th-ring-arc"] : ["th-ring-arc", "is-missed"];
			arc(classes, share - gap, index * share + gap / 2, index);
		});
		ring.createDiv({ cls: "th-ring-count", text: `${done}/${habits.length}` });
		block.createEl("h2", { cls: "th-title", text: "Day closed" });
		block.createDiv({ cls: "th-ring-sub", text: closedDayLine(habits.filter((habit) => habit.markOn(day)?.kind === "missed").length) });
		if (justClosed) this.haptics.merge();
	}

	/** Shows a day on Today, or the days up to it on the grid; a day picked in All habits takes the way back. */
	private showDay(day: LocalDate): void {
		this.slide = this.screen === "all" ? "pop" : day.isBefore(this.shownDay()) ? "earlier" : "later";
		this.screen = "today";
		this.goTo(day);
	}

	/** The grid's days up to `end`, as the band in the tray moves over them: at once, without a slide. */
	private moveDays(end: LocalDate): void {
		this.slide = null;
		this.goTo(end);
	}

	private goTo(day: LocalDate): void {
		this.leaving.clear();
		this.day = day.isBefore(this.ui.service.today()) ? day : null;
		this.menu = null;
		this.asking = null;
		this.other = null;
		this.otherText = "";
		this.shrink = null;
		this.answering = null;
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

	/**
	 * A habit's row on Today: on the list its circle for the shown day in front, answered dimmed; on the grid its
	 * circles for the days on show after the name, and the answers for the day of the one tapped.
	 */
	private renderRow(column: HTMLElement, path: string, habit: Habit): void {
		const grid = this.showsWeek();
		const day = grid ? this.answering : this.shownDay();
		const mark = day ? habit.markOn(day) : undefined;
		const side: Side = grid ? "right" : "left";
		const row = this.renderCard(column, path, habit, {
			dimmed: !grid && mark !== undefined,
			attrs: { "data-slot": "row", "data-drag": path, "data-section": habit.section ?? "" },
			lead: grid ? null : (main) => this.renderMark(main, path, habit, mark),
			trail: grid ? (main) => this.renderDays(main, path, habit) : undefined,
		});
		row.toggleClass("is-new", !this.shownRows.has(path));
		this.renderingRows.add(path);
		const main = row.querySelector<HTMLElement>(".th-row-main");
		if (main && this.menu === path) this.renderChoices(main, path, habit, mark, side);
		if (main && this.closing === path) this.refold(main, side);
		if (this.asking === path) this.renderReasons(row, path);
		if (this.shrink === path && mark?.kind === "missed") this.renderShrink(row, path, habit);
	}

	/**
	 * The answers in the row as capsules: the circle as it will look once chosen — full, tiny, not at trigger, skip — with the answer's
	 * word beside it, and cancel where the circle was, under the finger. They wait ready past the row's left edge and
	 * slide in together in one move while the circle and the name fade where they are. A tap anywhere else brings the
	 * row back.
	 *
	 * On the grid, whose circles stand at the row's right end, `side` turns all of it round: cancel lands on the row's
	 * last circle, whichever was tapped, the same answers line up to its left in the opposite order — done next to it,
	 * skip furthest — and they come in from past the view's right edge.
	 */
	private renderChoices(main: HTMLElement, path: string, habit: Habit, mark: DayMark | undefined, side: Side = "left"): void {
		const bar = main.createDiv("th-row-choices");
		const mirrored = side === "right";
		const addCancel = () => this.answerButton(bar, "Cancel", ["th-choice-cancel"], "x").addEventListener("click", () => this.closeChoices());
		const addAnswer = ({ answer, label, look, sign }: ReturnType<TodayView["answers"]>[number]) => {
			const button = this.answerButton(bar, label, look, sign, CHOICE_WORDS[answer]);
			button.setAttr("aria-pressed", String(mark?.kind === ANSWER_MARKS[answer].kind));
			button.addEventListener("click", (event) => {
				this.unfolding?.stop();
				this.unfolding = null;
				button.addClass("is-picked");
				this.haptics.tap();
				void this.choose(path, answer, mark, event);
			});
		};
		if (mirrored) {
			for (const answer of this.answers(habit).reverse()) addAnswer(answer);
			addCancel();
			bar.addClass("is-mirrored");
		} else {
			addCancel();
			for (const answer of this.answers(habit)) addAnswer(answer);
		}
		bar.toggleClass("is-crowded", bar.querySelectorAll(".has-word").length > 3);
		main.addClass("is-choosing");
		if (!this.menuOpening) return;
		this.menuOpening = false;
		this.unfolding = this.motion.slideChoices(bar, this.contentOf(main), this.contentEl, side);
	}

	/** The answers a habit offers, in order, each looking as the circle will once it is chosen. */
	private answers(habit: Habit): { answer: Answer; label: string; look: string[]; sign: IconName | null }[] {
		const labels = this.ui.labels();
		const answers: { answer: Answer; label: string; look: string[]; sign: IconName | null }[] = [];
		if (habit.hasFull) answers.push({ answer: "full", label: labels.title("full"), look: ["is-done"], sign: "check" });
		if (habit.hasTiny) answers.push({ answer: "tiny", label: labels.title("tiny"), look: ["is-done", "is-tiny"], sign: "check" });
		if (this.canGoOffTrigger(habit)) answers.push({ answer: "offTrigger", label: `Not at ${labels.of("anchor")}`, look: ["is-off-trigger"], sign: "check" });
		answers.push({ answer: "skip", label: "Skip", look: ["is-missed"], sign: null });
		return answers;
	}

	/**
	 * An answer as a capsule with its word, or a bare round sign. A worded one is named by its word: on a computer Obsidian
	 * shows an aria-label as a tooltip, and one saying the word again would cover the row below. A bare sign keeps its
	 * name, shown off to the side.
	 */
	private answerButton(bar: HTMLElement, label: string, look: string[], sign: IconName | null, word?: string): HTMLButtonElement {
		const button = bar.createEl("button", { cls: "th-choice", attr: word ? {} : { "aria-label": label, "data-tooltip-position": "left" } });
		const ball = button.createSpan("th-choice-ball");
		const face = ball.createSpan({ cls: ["th-mark", ...look] });
		if (sign) icon(face, sign);
		if (word) {
			button.addClass("has-word");
			ball.addClasses(["is-word", ...look]);
			ball.createSpan({ cls: "th-choice-word", text: word });
		}
		return button;
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

	/** The choices just closed without an answer slide back out of `surface` the way they came, and what they covered comes back. */
	private refold(surface: HTMLElement, side: Side = "left"): void {
		this.motion.refold(surface, this.contentOf(surface), this.leavingChoices, this.contentEl, side);
		this.leavingChoices = null;
		this.closing = null;
	}

	/** The row's own content — circle and name — without the choices laid over it. */
	private contentOf(main: HTMLElement): HTMLElement[] {
		return [...main.children].filter((child): child is HTMLElement => child instanceof HTMLElement && !child.hasClass("th-row-choices"));
	}

	/** An opened card: the recipe line by line, and a way to the habit's note. */
	/** A card opens onto the recipe rows of the habit's own panel, the one in its note, with the way to the note under it. */
	private renderRecipe(row: HTMLElement, path: string): void {
		const recipe = row.createDiv("th-card-recipe");
		const panel = new HabitBlock(this.app, this.ui, path, "recipe");
		panel.render();
		recipe.appendChild(panel.el);
		const open = recipe.createEl("button", { cls: "th-card-open" });
		open.appendText("Open note");
		setIcon(open.createSpan("th-card-open-icon"), "arrow-up-right");
		open.addEventListener("click", () => this.ui.openHabit(path, this.leaf));
	}

	/** The grid's circles for a habit, one for each day on show. */
	private renderDays(main: HTMLElement, path: string, habit: Habit): void {
		const today = this.ui.service.today();
		this.grid?.render(main, path, weekCells(habit, this.shownDay(), today, this.ui.settings().gridDays), {
			today,
			popping: (day) => this.celebrating.has(this.cellKey(path, day)),
		});
	}

	private renderMark(parent: HTMLElement, path: string, habit: Habit, mark: DayMark | undefined): void {
		const labels = this.ui.labels();
		const choices = [habit.hasTiny ? labels.of("tiny") : "done", labels.of("full"), ...(this.canGoOffTrigger(habit) ? [`not at ${labels.of("anchor")}`] : [])];
		const hint = mark ? "Clear the mark" : `Choose: ${choices.join(", ")} or skipped`;
		const button = parent.createEl("button", { cls: "th-mark-button", attr: { title: hint } });
		button.createSpan({ cls: "th-sr-only", text: hint });
		const circle = markCircle(button, mark);
		circle.toggleClass("is-popping", this.celebrating.has(this.cellKey(path, this.shownDay())));
		if (!mark && this.asking === path) circle.addClass("is-asking");

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

	/**
	 * Opens a row's answers, on the grid for the day of its circle. Another row's skip reasons or offer to shrink close, so
	 * they can't be answered for the wrong habit or day.
	 */
	private showMenu(path: string, day: LocalDate | null = null): void {
		if (this.menu === path && (day === null || this.answering?.equals(day))) return;
		this.menu = path;
		this.answering = day;
		this.asking = null;
		this.other = null;
		this.otherText = "";
		this.shrink = null;
		this.menuOpening = true;
		this.haptics.tap();
		this.render();
	}

	/** A circle on the grid: an empty one opens the answers for its day, a marked one is cleared. */
	private tapCell(path: string, day: LocalDate, mark: DayMark | undefined): void {
		if (!mark) return this.showMenu(path, day);
		this.haptics.tap();
		this.answering = day;
		void this.answer(path, undefined);
	}

	/** The day an answer is for: the circle's day on the grid, the shown day on the list. */
	private answerDay(): LocalDate {
		return this.answering ?? this.shownDay();
	}

	/** A habit's day, to tell which circle is popping. */
	private cellKey(path: string, day: LocalDate): string {
		return `${path}|${day.toString()}`;
	}

	/** A click elsewhere closes the answer menu, and the optional reasons of a skip. */
	private closeMenuOutside(event: MouseEvent): void {
		if (!this.menu && !this.asking) return;
		const target = event.target as HTMLElement | null;
		if (target?.closest(".th-row-choices, .th-mark-button, .th-grid-cell, .th-row-extra")) return;
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
		const mark = ANSWER_MARKS[answer];
		if (current?.kind === mark.kind) return this.answer(path, undefined);
		if (answer === "skip") {
			await this.answer(path, mark, undefined, false);
			this.asking = path;
			this.render();
			return;
		}
		return this.answer(path, mark, event);
	}

	private async answer(path: string, mark: DayMark | undefined, event?: MouseEvent, leave = true): Promise<void> {
		const day = this.answerDay();
		const cell = this.cellKey(path, day);
		const win = isWin(mark, this.ui.settings().wins);
		if (!win) this.origins.delete(path);
		const target = event?.currentTarget as HTMLElement | null | undefined;
		if (target && win) {
			const box = target.getBoundingClientRect();
			this.origins.set(path, { point: { x: box.left + box.width / 2, y: box.top + box.height / 2 }, at: Date.now() });
		}
		try {
			const habit = await this.ui.service.setMark(path, day, mark);
			this.menu = null;
			this.asking = null;
			this.other = null;
			this.otherText = "";
			this.shrink = mark && offersShrink(habit, mark, this.ui.settings().redesignThreshold, this.ui.settings().shrinkReason) ? path : null;
			if (mark && leave && this.layout === "day" && this.ui.settings().hideDone && !this.showDone) this.startLeaving(path);
			else this.leaving.delete(path);
			if (win) {
				this.haptics.tap();
				this.celebrate(cell);
				const phrase = habit.current("celebration");
				if (phrase && this.ui.settings().celebrationLine) this.caption(habit, phrase);
			}
			else this.stopCelebrating(cell);
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

	/** Keeps a habit's day popping for a moment; `cell` is from `cellKey`. */
	private celebrate(cell: string): void {
		this.stopCelebrating(cell);
		this.celebrating.set(
			cell,
			window.setTimeout(() => {
				this.celebrating.delete(cell);
			}, POP_MS),
		);
	}

	private stopCelebrating(cell: string): void {
		window.clearTimeout(this.celebrating.get(cell));
		this.celebrating.delete(cell);
	}

	private syncJar(entries: readonly HabitEntry[]): void {
		if (!this.jar) return;
		const today = this.ui.service.today();
		const names = new Map<string, Habit>();
		const items: JarItem[] = entries.flatMap((entry) => {
			if (entry.kind !== "ok") return [];
			names.set(entry.path, entry.habit);
			const color = this.resolve(entry.habit.color);
			return buildJar(entry.habit, today, this.ui.settings().merge, this.ui.settings().wins).map((piece) => ({ ...piece, key: `${entry.path}|${piece.id}`, group: entry.path, color }));
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

	/** A short line above the marbles in their habit's color; a new one replaces the one on screen. */
	private caption(habit: Habit, text: string): void {
		this.captionEl?.remove();
		window.clearTimeout(this.captionTimer);
		this.captionEl = this.contentEl.createDiv({ cls: ["th-caption", colorClass(habit.color)], text });
		this.captionTimer = window.setTimeout(() => {
			this.captionEl?.remove();
			this.captionEl = null;
		}, CAPTION_MS);
	}

	private jarOptions() {
		const settings = this.ui.settings();
		const feel = this.trialFeel ?? marbleFeel(settings);
		return {
			material: settings.material,
			reduceMotion: settings.reduceMotion,
			sizes: scaleSizes(feel.sizes, this.marbleScale),
			speed: feel.speed / 100,
			gravity: feel.gravity,
			bounce: feel.bounce / 100,
			screenCorners: this.ui.screenCorners(),
			background: this.resolveVar("--background-primary"),
			onImpact: (strength: number) => this.haptics.impact(strength),
			onSettle: (top: number | null) => this.makeRoomForPile(top),
		};
	}

	/**
	 * The list keeps room under its last row for the marbles standing on the floor, however high they pile, so scrolled
	 * down it ends above them.
	 */
	private makeRoomForPile(top: number | null): void {
		const floor = this.tray?.box().top ?? this.contentEl.clientHeight;
		const pile = top === null ? 0 : Math.ceil(Math.max(0, floor - top) / PILE_STEP) * PILE_STEP;
		if (pile === this.pile || !this.columnEl) return;
		this.pile = pile;
		this.columnEl.style.setProperty("--th-pile", `${pile}px`);
	}

	/** On a computer the marbles grow with the view's width, so a wide floor still holds a pile and not a sparse line. */
	private fitMarbles(): void {
		const scale = floorScale(this.contentEl.clientWidth);
		if (scale === this.marbleScale) return;
		this.marbleScale = scale;
		this.jar?.setOptions(this.jarOptions());
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
			this.jar?.setTilt(IN_HAND);
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
		const resolved = this.probe([colorClass(color)], "var(--th-marble-color)");
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

