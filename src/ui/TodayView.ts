import { ItemView, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import { HabitEntry } from "../application/ports";
import { DayMark, FULL, TINY, isDone, missed } from "../domain/DayMark";
import { Habit } from "../domain/Habit";
import { HabitColor } from "../domain/HabitColor";
import { buildJar } from "../domain/Jar";
import { colorClass } from "./colors";
import { chip, icon, iconButton } from "./components";
import { DayWatcher } from "./DayWatcher";
import { EditSheet } from "./EditSheet";
import { Haptics } from "./Haptics";
import { anchorLine } from "./format";
import { Hsl, parseColor } from "./jar/color";
import { JarCanvas, JarItem } from "./jar/JarCanvas";
import { KeyboardWatch } from "./KeyboardWatch";
import { EARTH, Point } from "./jar/JarPhysics";
import { TiltSensor } from "./jar/TiltSensor";
import { visibleEntries } from "./order";
import { ScreenChrome } from "./ScreenChrome";
import { closeDayTitle, closedDayLine, totalWins, winsLabel, offersShrink, todayEntries } from "./today";
import { UiContext } from "./UiContext";

export const HABITS_VIEW = "tiny-habits-grid";

const HOLD_MS = 450;
/** How long the circle of a just-marked habit keeps popping, while its row is still on screen. */
const POP_MS = 450;
const CAPTION_MS = 2000;
const DAY_CHECK_MS = 60_000;
/** Obsidian re-reads a note a moment after it is written, so the tap point has to wait for the new mark. */
const ORIGIN_TTL_MS = 4000;
const SVG_NS = "http://www.w3.org/2000/svg";
const RING_RADIUS = 50;
const RING_GAP = 9;
const FALLBACK_COLOR: Hsl = { h: 258, s: 88, l: 66 };

type Answer = "skip" | "full" | "tiny";

export class TodayView extends ItemView {
	private scrollEl!: HTMLElement;
	private columnEl!: HTMLElement;
	private captionEl: HTMLElement | null = null;
	private jar: JarCanvas | null = null;
	private chrome: ScreenChrome | null = null;
	private keyboard: KeyboardWatch | null = null;
	private menu: string | null = null;
	private asking: string | null = null;
	private other: string | null = null;
	private otherText = "";
	private shrink: string | null = null;
	private showDone = false;
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
		this.jar?.destroy();
		this.jar = null;
		window.clearTimeout(this.holdTimer);
		window.clearTimeout(this.captionTimer);
		for (const timer of this.celebrating.values()) window.clearTimeout(timer);
	}

	refresh(): void {
		this.jar?.setOptions(this.jarOptions());
		this.applyTilt();
		this.render();
	}

	private render(): void {
		if (!this.columnEl) return;
		const column = this.columnEl;
		column.empty();
		this.renderingRows = new Set();
		const all = visibleEntries(this.ui.repository.list());
		this.syncJar(all);
		if (all.length === 0) {
			this.renderEmpty(column);
			return;
		}
		const today = this.ui.service.today();
		const entries = todayEntries(all, today);
		const habits = entries.flatMap((entry) => (entry.kind === "ok" ? [entry] : []));
		const answered = habits.filter((entry) => entry.habit.markOn(today) !== undefined).length;

		const doneHabits = habits.filter((entry) => isDone(entry.habit.markOn(today)));
		const closed = habits.length > 0 && answered === habits.length;
		const header = closed
			? this.renderRing(column, habits.map((entry) => entry.habit), this.wasClosed === false)
			: this.renderProgress(column, habits.length - answered, habits.length ? answered / habits.length : 1);
		this.renderMeta(header, doneHabits, all);
		this.wasClosed = closed;

		const hideDone = this.ui.settings().hideDone;
		for (const entry of entries) {
			if (entry.kind === "broken") {
				this.renderBroken(column, entry);
				continue;
			}
			const done = isDone(entry.habit.markOn(today));
			if (!done || !hideDone || this.showDone || this.menu === entry.path) this.renderRow(column, entry.path, entry.habit);
		}
		this.shownRows = this.renderingRows;
	}

	private renderProgress(column: HTMLElement, left: number, share: number): HTMLElement {
		const header = column.createDiv("th-today-header");
		header.createEl("h1", { cls: "th-title", text: closeDayTitle(left) });
		header.createDiv("th-progress").createDiv("th-progress-fill").style.width = `${share * 100}%`;
		return header;
	}

	/** "3 done" (tap to show or hide them) and the total wins, under today's progress. */
	private renderMeta(header: HTMLElement, done: readonly HabitEntry[], all: readonly HabitEntry[]): void {
		const settings = this.ui.settings();
		const meta = header.createDiv("th-meta");
		if (done.length) {
			const toggle = meta.createEl("button", { cls: "th-meta-done", attr: { "aria-expanded": String(this.showDone || !settings.hideDone) } });
			const dots = toggle.createSpan("th-done-dots");
			for (const entry of done) dots.createSpan({ cls: ["th-done-dot", "th-habit", colorClass(entry.kind === "ok" ? entry.habit.color : undefined)] });
			toggle.createSpan({ text: `${done.length} done` });
			if (settings.hideDone) {
				setIcon(toggle.createSpan("th-meta-chevron"), "chevron-right");
				toggle.addEventListener("click", () => {
					this.showDone = !this.showDone;
					this.render();
				});
			} else toggle.disabled = true;
		}
		if (settings.showWins) meta.createSpan({ cls: "th-wins", text: winsLabel(totalWins(all)) });
	}

	private renderRing(column: HTMLElement, habits: readonly Habit[], justClosed: boolean): HTMLElement {
		const today = this.ui.service.today();
		const done = habits.filter((habit) => isDone(habit.markOn(today))).length;
		const header = column.createDiv("th-ring-header");
		header.toggleClass("is-fresh", justClosed);
		const ring = header.createDiv("th-ring");
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
			circle.style.strokeDashoffset = `${-offset}`;
			circle.style.animationDelay = `${index * 90}ms`;
		};
		arc(["th-ring-track"], circumference, 0, 0);
		habits.forEach((habit, index) => {
			const classes = isDone(habit.markOn(today)) ? ["th-ring-arc", "th-habit", colorClass(habit.color)] : ["th-ring-arc", "is-missed"];
			arc(classes, share - gap, index * share + gap / 2, index);
		});
		ring.createDiv({ cls: "th-ring-count", text: `${done}/${habits.length}` });
		header.createEl("h1", { cls: "th-title", text: closeDayTitle(0) });
		header.createDiv({ cls: "th-ring-sub", text: closedDayLine(habits.length - done) });
		if (justClosed) this.haptics.merge();
		return header;
	}

	private renderEmpty(column: HTMLElement): void {
		const empty = column.createDiv("th-empty");
		empty.createEl("h1", { cls: "th-title", text: "Start with one tiny habit" });
		iconButton(empty, { icon: "plus", label: "Create a tiny habit", primary: true, large: true, onClick: () => this.ui.newHabit() });
	}

	private renderBroken(column: HTMLElement, entry: Extract<HabitEntry, { kind: "broken" }>): void {
		const row = column.createDiv("th-row is-answered");
		const text = row.createDiv("th-row-main").createDiv("th-row-text");
		text.createDiv({ cls: "th-row-title", text: `Can't read ${entry.name}` });
		text.createDiv({ cls: "th-row-sub", text: entry.problem });
		text.addEventListener("click", () => void this.app.workspace.openLinkText(entry.path, "", "tab"));
	}

	private renderRow(column: HTMLElement, path: string, habit: Habit): void {
		const today = this.ui.service.today();
		const mark = habit.markOn(today);
		const row = column.createDiv({ cls: ["th-row", "th-habit", colorClass(habit.color)] });
		row.toggleClass("is-answered", mark !== undefined);
		row.toggleClass("is-new", !this.shownRows.has(path));
		this.renderingRows.add(path);
		const main = row.createDiv("th-row-main");

		const text = main.createDiv("th-row-text");
		text.createDiv({ cls: "th-row-title", text: habit.text("tiny").current() ?? habit.name });
		text.createDiv({ cls: "th-row-sub", text: this.subtitle(path, habit, mark) });
		text.addEventListener("click", () => this.ui.openHabit(path, this.leaf));

		if (this.menu === path) this.renderAnswers(main, path, mark);
		else {
			this.renderMark(main, path, mark);
		}
		if (this.asking === path) this.renderReasons(row, path);
		if (this.shrink === path && mark?.kind === "missed") this.renderShrink(row, path, habit);
	}

	private subtitle(path: string, habit: Habit, mark: DayMark | undefined): string {
		if (this.asking === path) return "skipped — why?";
		if (!mark) return anchorLine(habit);
		if (mark.kind === "missed") return `skipped · ${mark.reason.toLowerCase()}`;
		return mark.kind === "full" ? `full · ${habit.text("full").current() ?? ""}`.replace(/ · $/, "") : "tiny";
	}

	private renderMark(parent: HTMLElement, path: string, mark: DayMark | undefined): void {
		const hint = mark ? "Click to undo · hold or right-click to change" : "Click for tiny · hold or right-click for full or skipped";
		const button = parent.createEl("button", { cls: "th-mark-button", attr: { title: hint } });
		button.createSpan({ cls: "th-sr-only", text: mark ? "Undo — hold to change" : "Tiny — hold for full or skipped" });
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
			void this.answer(path, mark ? undefined : TINY, event);
		});
	}

	private renderAnswers(parent: HTMLElement, path: string, mark: DayMark | undefined): void {
		const answers = parent.createDiv("th-answers");
		const option = (answer: Answer, label: string, iconName: "x" | "spark" | "check", selected: boolean) => {
			const button = answers.createEl("button", { cls: ["th-answer", `th-answer-${answer}`], attr: { title: label } });
			button.createSpan({ cls: "th-sr-only", text: label });
			button.toggleClass("is-selected", selected);
			icon(button.createSpan("th-answer-circle"), iconName);
			button.addEventListener("click", (event) => void this.choose(path, answer, mark, event));
		};
		option("skip", "Skipped", "x", mark?.kind === "missed");
		option("full", "Full", "spark", mark?.kind === "full");
		option("tiny", "Tiny", "check", mark?.kind === "tiny");
	}

	private renderReasons(row: HTMLElement, path: string): void {
		const extra = row.createDiv("th-row-extra");
		extra.createDiv({ cls: "th-label", text: "What got in the way?" });
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
		link.addEventListener("click", () => new EditSheet(this.app, this.ui.service, path, habit, "tiny").open());
	}

	private showMenu(path: string): void {
		if (this.menu === path) return;
		this.menu = path;
		this.render();
	}

	private closeMenuOutside(event: MouseEvent): void {
		if (!this.menu) return;
		const target = event.target as HTMLElement | null;
		if (target?.closest(".th-answers, .th-mark-button")) return;
		this.menu = null;
		this.render();
	}

	private async choose(path: string, answer: Answer, current: DayMark | undefined, event: MouseEvent): Promise<void> {
		const same = (answer === "skip" && current?.kind === "missed") || (answer === "full" && current?.kind === "full") || (answer === "tiny" && current?.kind === "tiny");
		if (same) return this.answer(path, undefined);
		if (answer === "skip") {
			this.menu = null;
			this.asking = path;
			this.other = null;
			this.otherText = "";
			this.render();
			return;
		}
		return this.answer(path, answer === "full" ? FULL : TINY, event);
	}

	private async answer(path: string, mark: DayMark | undefined, event?: MouseEvent): Promise<void> {
		if (!isDone(mark)) this.origins.delete(path);
		const target = event?.currentTarget as HTMLElement | null | undefined;
		if (target && isDone(mark)) {
			const box = target.getBoundingClientRect();
			this.origins.set(path, { point: { x: box.left + box.width / 2, y: box.top + box.height / 2 }, at: Date.now() });
		}
		try {
			const habit = await this.ui.service.setMark(path, this.ui.service.today(), mark);
			this.menu = null;
			this.asking = null;
			this.other = null;
			this.otherText = "";
			this.shrink = mark && offersShrink(habit, mark, this.ui.settings().redesignThreshold, this.ui.settings().shrinkReason) ? path : null;
			if (mark && isDone(mark)) {
				this.haptics.tap();
				this.celebrate(path);
				const phrase = habit.text("celebration").current();
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
			screenCorners: this.ui.screenCorners(),
			background: this.resolveVar("--background-primary"),
			onImpact: (strength: number) => this.haptics.impact(strength),
		};
	}

	private tiltEnabled(): boolean {
		const settings = this.ui.settings();
		return settings.tilt && !settings.reduceMotion;
	}

	/** The motion sensor runs only while Today is actually on screen: not in a background tab, not with the app hidden. */
	private applyTilt(): void {
		if (!this.tiltEnabled()) {
			this.tilt.stop();
			this.jar?.setGravity(EARTH);
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
		probe.style.color = color;
		probe.style.display = "none";
		const value = getComputedStyle(probe).color;
		probe.remove();
		return parseColor(value);
	}
}
