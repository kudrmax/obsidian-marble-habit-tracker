import { setIcon } from "obsidian";
import { HABIT_COLORS, HabitColor } from "../domain/HabitColor";
import { WEEKDAYS, Weekday } from "../domain/LocalDate";
import { colorClass } from "./colors";

const SVG_NS = "http://www.w3.org/2000/svg";
const SPARK_PATH = "M0 -10 C1.2 -2.6 2.6 -1.2 10 0 C2.6 1.2 1.2 2.6 0 10 C-1.2 2.6 -2.6 1.2 -10 0 C-2.6 -1.2 -1.2 -2.6 0 -10 Z";
const WEEKDAY_LETTERS: Record<Weekday, string> = { mon: "M", tue: "T", wed: "W", thu: "T", fri: "F", sat: "S", sun: "S" };

export type IconName = "check" | "x" | "plus" | "spark" | "shrink" | "back" | "unlink";

const LUCIDE: Partial<Record<IconName, string>> = { shrink: "minimize-2", back: "chevron-left" };

export function icon(parent: HTMLElement, name: IconName): void {
	if (name !== "spark") {
		setIcon(parent, LUCIDE[name] ?? name);
		return;
	}
	const svg = document.createElementNS(SVG_NS, "svg");
	svg.setAttribute("viewBox", "-10 -10 20 20");
	svg.setAttribute("aria-hidden", "true");
	const path = document.createElementNS(SVG_NS, "path");
	path.setAttribute("d", SPARK_PATH);
	path.setAttribute("fill", "currentColor");
	svg.append(path);
	parent.append(svg);
}

export interface ButtonOptions {
	readonly icon: IconName;
	readonly label: string;
	readonly primary?: boolean;
	readonly large?: boolean;
	onClick(event: MouseEvent): void;
}

export function iconButton(parent: HTMLElement, options: ButtonOptions): HTMLButtonElement {
	const cls = ["th-button"];
	if (options.primary) cls.push("th-button-primary");
	if (options.large) cls.push("th-button-large");
	const button = parent.createEl("button", { cls, attr: { "aria-label": options.label, title: options.label } });
	icon(button, options.icon);
	button.addEventListener("click", (event) => options.onClick(event));
	return button;
}

export function chip(parent: HTMLElement, text: string, onClick: () => void, variant?: "ghost" | "strong"): HTMLButtonElement {
	const button = parent.createEl("button", { cls: variant ? ["th-chip", `th-chip-${variant}`] : "th-chip", text });
	button.addEventListener("click", onClick);
	return button;
}

export function textField(
	parent: HTMLElement,
	options: { label: string; value?: string; placeholder?: string; large?: boolean; hero?: boolean; onInput(value: string): void },
): HTMLTextAreaElement {
	const cls = ["th-field"];
	if (options.large) cls.push("th-field-large");
	if (options.hero) cls.push("th-field-hero");
	const field = parent.createEl("label", { cls });
	field.createDiv({ cls: "th-label", text: options.label });
	const input = field.createEl("textarea", { attr: { rows: options.hero ? "3" : "1", placeholder: options.placeholder ?? "" } });
	input.value = options.value ?? "";
	const grow = () => {
		if (!input.isShown()) return;
		input.setCssProps({ height: "auto" });
		input.setCssProps({ height: `${input.scrollHeight}px` });
	};
	input.addEventListener("input", () => {
		grow();
		options.onInput(input.value);
	});
	input.addEventListener("keydown", (event) => {
		if (event.key === "Enter") event.preventDefault();
	});
	window.requestAnimationFrame(grow);
	return input;
}

export function weekdayCircles(parent: HTMLElement, initial: readonly Weekday[], onChange: (days: Weekday[]) => void): void {
	const selected = new Set(initial);
	const row = parent.createDiv("th-circles");
	for (const day of WEEKDAYS) {
		const button = row.createEl("button", { cls: "th-day", text: WEEKDAY_LETTERS[day], attr: { "aria-label": day } });
		button.toggleClass("is-on", selected.has(day));
		button.addEventListener("click", (event) => {
			event.preventDefault();
			if (selected.has(day)) selected.delete(day);
			else selected.add(day);
			button.toggleClass("is-on", selected.has(day));
			onChange(WEEKDAYS.filter((weekday) => selected.has(weekday)));
		});
	}
}

export function colorCircles(parent: HTMLElement, initial: HabitColor | undefined, onChange: (color: HabitColor | undefined) => void): void {
	const options: ReadonlyArray<HabitColor | undefined> = [undefined, ...HABIT_COLORS];
	const row = parent.createDiv("th-circles");
	const buttons = options.map((color) => {
		const button = row.createEl("button", { cls: ["th-swatch", "th-habit", colorClass(color)], attr: { "aria-label": color ?? "accent" } });
		button.toggleClass("is-on", color === initial);
		button.addEventListener("click", (event) => {
			event.preventDefault();
			buttons.forEach((other, index) => other.toggleClass("is-on", options[index] === color));
			onChange(color);
		});
		return button;
	});
}
