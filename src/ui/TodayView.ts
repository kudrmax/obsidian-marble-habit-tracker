import { ItemView, Notice, Platform, WorkspaceLeaf, setIcon } from "obsidian";
import { HabitEntry } from "../application/ports";
import { DayMark, FULL, SKIPPED, TINY, done, isDone, isOffTrigger, missed } from "../domain/DayMark";
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
import { Point } from "./jar/JarPhysics";
import { IN_HAND, TiltSensor } from "./jar/TiltSensor";
import { Placement, arrange, groupBySection, visibleEntries } from "./order";
import { Drop, RowDrag } from "./RowDrag";
import { SectionNameModal } from "./SectionNameModal";
import { ScreenChrome } from "./ScreenChrome";
import { dayTitle, totalWins, winsLabel, offersShrink, todayEntries } from "./today";
import { UiContext } from "./UiContext";

export const HABITS_VIEW = "tiny-habits-grid";

const HOLD_MS = 450;
/** How long the circle of a just-marked habit keeps popping, while its row is still on screen. */
const POP_MS = 450;
const CAPTION_MS = 2000;
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
	/** The "?" in the view's header; it carries a dot until the help was opened once. */
	private helpAction: HTMLElement | null = null;
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
	private shownRows = new Set<string>();
	private renderingRows = new Set<string>();
	private wasClosed: boolean | null = null;
	private held = false;
	private holdTimer = 0;
	private captionTimer = 0;
	private readonly celebrating = new Map<string, number>();
	private readonly origins = new Map<string, { point: Point; at: number }>();
	private readonly colors = new Map<string, Hsl>();
	private readonly haptics = new Haptics(() => this.ui.settings().haptics);
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
		this.scrollEl = root.createDiv("th-today-scroll");
		this.columnEl = this.scrollEl.createDiv("th-column");
		this.rowDrag = new RowDrag(
			this.columnEl,
			() => this.haptics.tap(),
			(drop) => this.dropped(drop),
		);
		this.jar = new JarCanvas(root, this.jarOptions());
		this.chrome = new ScreenChrome(root, this.containerEl, (shelves, ledges) => {
			this.jar?.setObstacles(shelves);
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
		// Obsidian puts each new action before the earlier ones: added last, shown first.
		this.addAction("plus", "New habit", () => this.ui.newHabit());
		this.helpAction = this.addAction("circle-help", "How it works", () => {
			new HelpModal(this.app, helpRows(Platform.isMobile, this.ui.settings().merge)).open();
			this.ui.markHintsSeen();
		});
		this.addAction("list", "All habits", () => this.showAll());
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
		window.clearTimeout(this.holdTimer);
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
		this.helpAction?.toggleClass("th-has-dot", !this.ui.settings().hintsSeen);
		this.renderingRows = new Set();
		const all = visibleEntries(this.ui.repository.list());
		this.syncJar(all);
		if (all.length === 0) {
			this.renderEmpty(column);
			return;
		}
		if (this.screen === "all") {
			this.renderAll(column, all);
			return;
		}
		const today = this.shownDay();
		const entries = todayEntries(all, today);
		const habits = entries.flatMap((entry) => (entry.kind === "ok" ? [entry] : []));
		const answered = habits.filter((entry) => entry.habit.markOn(today) !== undefined).length;
		const answeredHabits = habits.filter((entry) => entry.habit.markOn(today) !== undefined);
		const closed = habits.length > 0 && answered === habits.length;
		this.renderHead(column, all, habits.length ? answered / habits.length : null);
		if (closed && this.wasClosed === false) this.haptics.merge();
		this.wasClosed = closed;
		if (habits.length === 0) column.createDiv({ cls: "th-nothing", text: "Nothing for today" });

		const hideDone = this.ui.settings().hideDone;
		const folded = (entry: Extract<HabitEntry, { kind: "ok" }>) =>
			entry.habit.markOn(today) !== undefined && this.menu !== entry.path && this.asking !== entry.path && this.shrink !== entry.path;
		const shown = habits.filter((entry) => !hideDone || this.showDone || !folded(entry));
		const sections = groupBySection(
			all.flatMap((entry) => (entry.kind === "ok" ? [entry] : [])),
			(entry) => entry.habit.section,
		);
		for (const group of sections) {
			const rows = shown.filter((entry) => entry.habit.section === group.section);
			if (rows.length === 0) continue;
			if (group.section !== undefined) this.renderSection(column, group.section);
			for (const entry of rows) this.renderRow(column, entry.path, entry.habit);
		}
		for (const entry of entries) if (entry.kind === "broken") this.renderBroken(column, entry);
		this.renderNewSection(column);
		this.renderFoot(column, answeredHabits);
		this.shownRows = this.renderingRows;
	}

	showAll(): void {
		this.screen = "all";
		this.menu = null;
		this.asking = null;
		this.shrink = null;
		this.render();
	}

	private showToday(): void {
		this.screen = "today";
		this.wasClosed = null;
		this.render();
	}

	/** Every habit by section, with its days and wins; archived ones fold away at the bottom. */
	private renderAll(column: HTMLElement, visible: readonly HabitEntry[]): void {
		const nav = column.createDiv("th-back-nav");
		const back = nav.createEl("button", { cls: "th-back" });
		setIcon(back.createSpan("th-back-icon"), "chevron-left");
		back.appendText("Today");
		back.addEventListener("click", () => this.showToday());
		column.createDiv("th-head").createEl("h1", { cls: "th-title", text: "All habits" });
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
		const row = column.createDiv({ cls: ["th-row", "th-habit", colorClass(habit.color)] });
		row.toggleClass("is-answered", archived);
		const text = row.createDiv("th-row-main").createDiv("th-row-text");
		text.createDiv({ cls: "th-row-title", text: habit.headline });
		text.createDiv({ cls: "th-row-sub", text: `${recipeDays(habit.currentSchedule)} · ${winsLabel(computeStats(habit, this.ui.service.today()).total)}` });
		text.addEventListener("click", () => this.ui.openHabit(path, this.leaf));
	}

	/** The day Today shows: today, or a past day picked with the arrows. */
	private shownDay(): LocalDate {
		const today = this.ui.service.today();
		return this.day && this.day.isBefore(today) ? this.day : today;
	}

	/** The day as the title, with arrows to step through past days; the wins and the day's progress under it. */
	private renderHead(column: HTMLElement, all: readonly HabitEntry[], progress: number | null): void {
		const today = this.ui.service.today();
		const shown = this.shownDay();
		const isToday = shown.equals(today);
		const head = column.createDiv("th-head");
		const line = head.createDiv("th-head-line");
		line.createEl("h1", { cls: "th-title", text: dayTitle(shown, today) });
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
		if (this.ui.settings().showWins) head.createDiv({ cls: "th-head-sub", text: winsLabel(totalWins(all)) });
		if (progress !== null) head.createDiv("th-progress").createDiv("th-progress-fill").setCssProps({ width: `${progress * 100}%` });
	}

	/** Under the list, the answered habits folded into one line: "3 done · 1 skipped". */
	private renderFoot(column: HTMLElement, answered: readonly Extract<HabitEntry, { kind: "ok" }>[]): void {
		if (answered.length === 0 || !this.ui.settings().hideDone) return;
		const day = this.shownDay();
		const done = answered.filter((entry) => isDone(entry.habit.markOn(day)));
		const skipped = answered.length - done.length;
		const toggle = column.createDiv("th-foot").createEl("button", { cls: "th-foot-row th-foot-done", attr: { "aria-expanded": String(this.showDone) } });
		const dots = toggle.createSpan("th-done-dots");
		for (const entry of answered) {
			const color = isDone(entry.habit.markOn(day)) ? ["th-habit", colorClass(entry.habit.color)] : ["is-skipped"];
			dots.createSpan({ cls: ["th-done-dot", ...color] });
		}
		toggle.createSpan({ text: [done.length ? `${done.length} done` : "", skipped ? `${skipped} skipped` : ""].filter(Boolean).join(" · ") });
		setIcon(toggle.createSpan("th-meta-chevron"), "chevron-right");
		toggle.addEventListener("click", () => {
			this.showDone = !this.showDone;
			this.render();
		});
	}

	private showDay(day: LocalDate): void {
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
		const row = column.createDiv({
			cls: ["th-row", "th-habit", colorClass(habit.color)],
			attr: { "data-slot": "row", "data-drag": path, "data-section": habit.section ?? "" },
		});
		row.toggleClass("is-answered", mark !== undefined);
		row.toggleClass("is-new", !this.shownRows.has(path));
		this.renderingRows.add(path);
		const main = row.createDiv("th-row-main");

		const text = main.createDiv("th-row-text");
		text.createDiv({ cls: "th-row-title", text: habit.headline });
		const subtitle = this.ui.labels().anchorLine(habit);
		if (subtitle) text.createDiv({ cls: "th-row-sub", text: subtitle });
		text.addEventListener("click", () => this.ui.openHabit(path, this.leaf));

		if (this.menu === path && this.canGoOffTrigger(habit)) {
			const stack = main.createDiv("th-answer-stack");
			this.renderAnswers(stack, path, habit, mark);
			this.renderOffTrigger(stack);
		} else if (this.menu === path) this.renderAnswers(main, path, habit, mark);
		else {
			this.renderMark(main, path, habit, mark);
		}
		if (this.asking === path) this.renderReasons(row, path);
		if (this.shrink === path && mark?.kind === "missed") this.renderShrink(row, path, habit);
	}




	private renderMark(parent: HTMLElement, path: string, habit: Habit, mark: DayMark | undefined): void {
		const labels = this.ui.labels();
		const first = habit.hasTiny ? labels.of("tiny") : "done";
		const hint = mark ? "Click to undo · hold or right-click to change" : `Click for ${first} · hold or right-click for more`;
		const button = parent.createEl("button", { cls: "th-mark-button", attr: { title: hint } });
		button.createSpan({ cls: "th-sr-only", text: mark ? "Undo — hold to change" : `${labels.title(habit.hasTiny ? "tiny" : "full")} — hold for more` });
		const circle = button.createSpan("th-mark");
		if (isDone(mark)) {
			circle.addClass("is-done");
			if (this.celebrating.has(path)) circle.addClass("is-popping");
			icon(circle, mark?.kind === "full" ? "spark" : "check");
		} else if (mark?.kind === "missed") circle.addClass("is-missed");
		else if (this.asking === path) circle.addClass("is-asking");

		const cancel = () => window.clearTimeout(this.holdTimer);
		button.addEventListener("pointerdown", (event) => {
			this.held = false;
			cancel();
			if (event.button !== 0) return;
			this.holdTimer = window.setTimeout(() => {
				this.held = true;
				this.showMenu(path);
			}, HOLD_MS);
		});
		for (const type of ["pointerup", "pointerleave", "pointercancel"]) button.addEventListener(type, cancel);
		button.addEventListener("contextmenu", (event) => {
			event.preventDefault();
			cancel();
			this.showMenu(path);
		});
		button.addEventListener("click", (event) => {
			if (this.held) {
				this.held = false;
				return;
			}
			void this.answer(path, mark ? undefined : habit.hasTiny ? TINY : FULL, event);
		});
	}

	/** Skipped, full and — when the habit has a tiny version — tiny. */
	private renderAnswers(parent: HTMLElement, path: string, habit: Habit, mark: DayMark | undefined): void {
		const answers = parent.createDiv("th-answers");
		const option = (answer: Answer, label: string, iconName: "x" | "spark" | "check", selected: boolean) => {
			const button = answers.createEl("button", { cls: ["th-answer", `th-answer-${answer}`], attr: { title: label } });
			button.createSpan({ cls: "th-sr-only", text: label });
			button.toggleClass("is-selected", selected);
			icon(button.createSpan("th-answer-circle"), iconName);
			button.addEventListener("click", (event) => void this.choose(path, answer, mark, event));
		};
		const offTrigger = this.offTrigger && this.canGoOffTrigger(habit);
		answers.toggleClass("is-off-trigger", offTrigger);
		const chosen = (kind: "full" | "tiny") => mark?.kind === kind && isOffTrigger(mark) === offTrigger;
		option("skip", "Skipped", "x", mark?.kind === "missed");
		const labels = this.ui.labels();
		option("full", labels.title("full"), "spark", chosen("full"));
		if (habit.hasTiny) option("tiny", labels.title("tiny"), "check", chosen("tiny"));
	}

	/** A switch under the answer circles: the tiny or full answer picked next counts as done without the anchor. */
	private renderOffTrigger(parent: HTMLElement): void {
		const chip = parent.createEl("button", { cls: "th-chip th-off-trigger", attr: { "aria-pressed": String(this.offTrigger) } });
		chip.toggleClass("is-on", this.offTrigger);
		icon(chip.createSpan("th-off-trigger-icon"), "unlink");
		chip.createSpan({ text: "Not at trigger" });
		chip.addEventListener("click", () => {
			this.offTrigger = !this.offTrigger;
			this.render();
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
		const entry = this.ui.repository.get(path);
		this.offTrigger = entry?.kind === "ok" && isOffTrigger(entry.habit.markOn(this.shownDay()));
		this.render();
	}

	/** A click elsewhere closes the answer menu, and the optional reasons of a skip. */
	private closeMenuOutside(event: MouseEvent): void {
		if (!this.menu && !this.asking) return;
		const target = event.target as HTMLElement | null;
		if (target?.closest(".th-answers, .th-mark-button, .th-off-trigger, .th-row-extra")) return;
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
			await this.answer(path, SKIPPED);
			this.asking = path;
			this.render();
			return;
		}
		return this.answer(path, done(answer, offTrigger), event);
	}

	private async answer(path: string, mark: DayMark | undefined, event?: MouseEvent): Promise<void> {
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

