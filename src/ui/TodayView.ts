import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
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
import { EARTH, Point } from "./jar/JarPhysics";
import { TiltSensor } from "./jar/TiltSensor";
import { visibleEntries } from "./order";
import { REASONS, celebrationLine, closeDayTitle, offersShrink, todayEntries } from "./today";
import { UiContext } from "./UiContext";

export const HABITS_VIEW = "tiny-habits-grid";

const HOLD_MS = 450;
const CELEBRATE_MS = 2200;
const CAPTION_MS = 2600;
const DAY_CHECK_MS = 60_000;
const FALLBACK_COLOR: Hsl = { h: 258, s: 88, l: 66 };

type Answer = "miss" | "more" | "done";

export class TodayView extends ItemView {
	private scrollEl!: HTMLElement;
	private columnEl!: HTMLElement;
	private captionEl: HTMLElement | null = null;
	private jar: JarCanvas | null = null;
	private menu: string | null = null;
	private asking: string | null = null;
	private other: string | null = null;
	private otherText = "";
	private shrink: string | null = null;
	private showDone = false;
	private held = false;
	private holdTimer = 0;
	private captionTimer = 0;
	private readonly celebrating = new Map<string, number>();
	private readonly origins = new Map<string, Point>();
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
		this.addAction("plus", "New habit", () => this.ui.newHabit());
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
		this.applyTilt();
		this.render();
	}

	override async onClose(): Promise<void> {
		this.tilt.stop();
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

	replayJar(): void {
		this.jar?.replay();
	}

	private render(): void {
		if (!this.columnEl) return;
		const column = this.columnEl;
		column.empty();
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

		const header = column.createDiv("th-today-header");
		header.createEl("h1", { cls: "th-title", text: closeDayTitle(habits.length - answered) });
		const progress = header.createDiv("th-progress");
		progress.createDiv("th-progress-fill").style.width = `${habits.length ? (answered / habits.length) * 100 : 100}%`;

		const hidden: HabitEntry[] = [];
		for (const entry of entries) {
			if (entry.kind === "broken") {
				this.renderBroken(column, entry);
				continue;
			}
			const done = isDone(entry.habit.markOn(today));
			const visible = !done || this.showDone || this.celebrating.has(entry.path) || this.menu === entry.path;
			if (done && !this.celebrating.has(entry.path) && this.menu !== entry.path) hidden.push(entry);
			if (visible) this.renderRow(column, entry.path, entry.habit);
		}
		if (hidden.length) this.renderDoneRow(column, hidden);
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
		const done = isDone(mark);
		const row = column.createDiv({ cls: ["th-row", "th-habit", colorClass(habit.color)] });
		row.toggleClass("is-answered", mark !== undefined);
		const main = row.createDiv("th-row-main");

		const text = main.createDiv("th-row-text");
		text.createDiv({ cls: "th-row-title", text: habit.text("tiny").current() ?? habit.name });
		const sub = text.createDiv({ cls: "th-row-sub", text: this.subtitle(path, habit, mark) });
		sub.toggleClass("is-celebrating", done && this.celebrating.has(path) && this.ui.settings().celebrationLine);
		text.addEventListener("click", () => this.ui.openHabit(path));

		if (this.menu === path) this.renderAnswers(main, path, mark);
		else {
			main.createSpan({ cls: "th-hint", text: done ? "right-click to change" : "click · right-click for more" });
			this.renderMark(main, path, mark);
		}
		if (this.asking === path) this.renderReasons(row, path);
		if (this.shrink === path && mark?.kind === "missed") this.renderShrink(row, path, habit);
	}

	private subtitle(path: string, habit: Habit, mark: DayMark | undefined): string {
		if (this.asking === path) return "not today — why?";
		if (!mark) return anchorLine(habit);
		if (mark.kind === "missed") return `not today · ${mark.reason.toLowerCase()}`;
		if (this.celebrating.has(path) && this.ui.settings().celebrationLine) return celebrationLine(habit, mark);
		return mark.kind === "full" ? `did more · ${habit.text("full").current() ?? ""}`.replace(/ · $/, "") : "done";
	}

	private renderMark(parent: HTMLElement, path: string, mark: DayMark | undefined): void {
		const button = parent.createEl("button", { cls: "th-mark-button", attr: { "aria-label": mark ? "Change answer" : "Done — hold for more" } });
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
			if (mark) this.showMenu(path);
			else void this.answer(path, TINY, event);
		});
	}

	private renderAnswers(parent: HTMLElement, path: string, mark: DayMark | undefined): void {
		const answers = parent.createDiv("th-answers");
		const option = (answer: Answer, label: string, iconName: "x" | "spark" | "check", selected: boolean) => {
			const button = answers.createEl("button", { cls: ["th-answer", `th-answer-${answer}`], attr: { "aria-label": label, title: label } });
			button.toggleClass("is-selected", selected);
			icon(button, iconName);
			button.addEventListener("click", (event) => void this.choose(path, answer, mark, event));
		};
		option("miss", "Not today", "x", mark?.kind === "missed");
		option("more", "Did more", "spark", mark?.kind === "full");
		option("done", "Done", "check", mark?.kind === "tiny");
	}

	private renderReasons(row: HTMLElement, path: string): void {
		const extra = row.createDiv("th-row-extra");
		extra.createDiv({ cls: "th-label", text: "What got in the way?" });
		const chips = extra.createDiv("th-chips");
		for (const reason of REASONS) chip(chips, reason, () => void this.answer(path, missed(reason)));
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

	private renderDoneRow(column: HTMLElement, hidden: readonly HabitEntry[]): void {
		const button = column.createEl("button", { cls: "th-done-row" });
		const dots = button.createSpan("th-done-dots");
		for (const entry of hidden) {
			const color = entry.kind === "ok" ? entry.habit.color : undefined;
			dots.createSpan({ cls: ["th-done-dot", "th-habit", colorClass(color)] });
		}
		button.createSpan({ cls: "th-done-text", text: `${hidden.length} done` });
		button.createSpan({ cls: "th-done-toggle", text: this.showDone ? "Hide" : "Show" });
		button.addEventListener("click", () => {
			this.showDone = !this.showDone;
			this.render();
		});
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
		const same = (answer === "miss" && current?.kind === "missed") || (answer === "more" && current?.kind === "full") || (answer === "done" && current?.kind === "tiny");
		if (same) return this.answer(path, undefined);
		if (answer === "miss") {
			this.menu = null;
			this.asking = path;
			this.other = null;
			this.otherText = "";
			this.render();
			return;
		}
		return this.answer(path, answer === "more" ? FULL : TINY, event);
	}

	private async answer(path: string, mark: DayMark | undefined, event?: MouseEvent): Promise<void> {
		const target = event?.currentTarget as HTMLElement | null | undefined;
		if (target && isDone(mark)) {
			const box = target.getBoundingClientRect();
			this.origins.set(path, { x: box.left + box.width / 2, y: box.top + box.height / 2 });
		}
		try {
			const habit = await this.ui.service.setMark(path, this.ui.service.today(), mark);
			this.menu = null;
			this.asking = null;
			this.other = null;
			this.otherText = "";
			this.shrink = mark && offersShrink(habit, mark, this.ui.settings().redesignThreshold) ? path : null;
			if (isDone(mark)) {
				this.haptics.tap();
				this.celebrate(path);
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
				this.render();
			}, CELEBRATE_MS),
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
			return buildJar(entry.habit, today).map((piece) => ({ ...piece, key: `${entry.path}|${piece.id}`, group: entry.path, color }));
		});
		this.jar.setOptions({
			...this.jarOptions(),
			onMerge: (item) => {
				this.haptics.merge();
				this.caption(names.get(item.group), item);
			},
		});
		this.jar.sync(items, this.origins);
		this.origins.clear();
	}

	private caption(habit: Habit | undefined, item: JarItem): void {
		if (!habit) return;
		this.captionEl?.remove();
		window.clearTimeout(this.captionTimer);
		const text = `${habit.name} · ${item.size === "big" ? "28" : "7"} in a row`;
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
			background: this.resolveVar("--background-primary"),
			onImpact: (strength: number) => this.haptics.impact(strength),
		};
	}

	private tiltEnabled(): boolean {
		const settings = this.ui.settings();
		return settings.tilt && !settings.reduceMotion;
	}

	private applyTilt(): void {
		if (this.tiltEnabled()) {
			this.tilt.start();
			void this.tilt.askSilently();
			return;
		}
		this.tilt.stop();
		this.jar?.setGravity(EARTH);
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
