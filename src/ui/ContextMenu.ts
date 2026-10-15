import { setIcon } from "obsidian";
import { SPRING } from "./Motion";

export interface ContextMenuItem {
	readonly text: string;
	/** A second, smaller line: what the answer means for this habit. */
	readonly detail?: string;
	/** A Lucide icon on the right, for actions. */
	readonly icon?: string;
	/** A circle on the right drawn exactly as the habit's circle looks with this answer: "done", "more" or "skipped". */
	readonly glyph?: Glyph;
	readonly selected?: boolean;
	/** Starts a new group under a gap, as iOS separates kinds of actions. */
	readonly group?: boolean;
	onClick(event: MouseEvent): void;
}

export type Glyph = "done" | "more" | "skipped";

/** The circle's own state classes, so a menu item shows the circle exactly as the answer will leave it. */
const GLYPHS: Record<Glyph, string[]> = { done: ["is-done"], more: ["is-done", "is-more"], skipped: ["is-missed"] };

const GAP = 8;
const EDGE = 12;
const OPEN_MS = 220;

/**
 * iOS's pull-down menu: it springs out of the control that was tapped, over a barely dimmed screen, and a tap
 * anywhere outside closes it.
 */
export class ContextMenu {
	private layer: HTMLElement | null = null;

	constructor(
		private readonly host: HTMLElement,
		private readonly onDismiss: () => void,
		private readonly reduced: () => boolean,
	) {}

	get isOpen(): boolean {
		return this.layer !== null;
	}

	/**
	 * Drops the menu out of `anchor`, the control that was tapped, as iOS's pull-down menu does: under it, or above it
	 * turned over when there is no room below. `fresh` plays the opening; a redraw of an open menu doesn't.
	 */
	open(anchor: HTMLElement, items: readonly ContextMenuItem[], fresh: boolean, className: string[]): void {
		this.close();
		const area = this.host.getBoundingClientRect();
		const box = anchor.getBoundingClientRect();
		const layer = this.host.createDiv("th-context");
		this.layer = layer;
		layer.addEventListener("click", (event) => {
			if (event.target === layer) this.onDismiss();
		});
		const menu = layer.createDiv({ cls: ["th-context-menu", ...className], attr: { role: "menu" } });
		for (const item of items) {
			if (item.group) menu.createDiv("th-context-gap");
			const button = menu.createEl("button", { cls: "th-context-item", attr: { role: "menuitem" } });
			button.toggleClass("is-selected", item.selected === true);
			setIcon(button.createSpan("th-context-check"), "check");
			const text = button.createSpan("th-context-text");
			text.createSpan({ cls: "th-context-title", text: item.text });
			if (item.detail) text.createSpan({ cls: "th-context-detail", text: item.detail });
			if (item.glyph) {
				const glyph = button.createSpan({ cls: ["th-context-glyph", "th-mark", ...GLYPHS[item.glyph]] });
				if (item.glyph !== "skipped") setIcon(glyph, "check");
			} else if (item.icon) setIcon(button.createSpan("th-context-icon"), item.icon);
			button.addEventListener("click", (event) => item.onClick(event));
		}
		const height = menu.offsetHeight;
		const below = box.bottom - area.top + GAP;
		const above = box.top - area.top - GAP - height;
		const opensBelow = below + height <= area.height - this.bottomInset() - EDGE || above < EDGE;
		// Opening upwards, iOS turns the menu over so its first item stays nearest the finger.
		if (!opensBelow) menu.replaceChildren(...[...menu.children].reverse());
		const left = Math.max(EDGE, Math.min(box.left - area.left, area.width - menu.offsetWidth - EDGE));
		menu.setCssProps({ top: `${opensBelow ? below : above}px`, left: `${left}px` });
		menu.style.transformOrigin = `${box.left - area.left + box.width / 2 - left}px ${opensBelow ? "0" : "100%"}`;
		layer.addClass("is-open");
		if (!fresh || this.reduced()) return;
		layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: OPEN_MS, easing: "ease-out" });
		menu.animate(
			[
				{ transform: "scale(0.35)", opacity: 0 },
				{ transform: "none", opacity: 1 },
			],
			{ duration: 340, easing: SPRING },
		);
	}

	/**
	 * Springs a capsule of big choices out of `anchor`, as iMessage's reactions do: each choice drawn as its result, the
	 * first one over the anchor itself so the finger is already on it, a short label under each.
	 */
	openBar(anchor: HTMLElement, items: readonly ContextMenuItem[], fresh: boolean, className: string[]): void {
		this.close();
		const area = this.host.getBoundingClientRect();
		const box = anchor.getBoundingClientRect();
		const layer = this.host.createDiv("th-context is-bar");
		this.layer = layer;
		layer.addEventListener("click", (event) => {
			if (event.target === layer) this.onDismiss();
		});
		const bar = layer.createDiv({ cls: ["th-choice-bar", ...className], attr: { role: "menu" } });
		items.forEach((item) => {
			const button = bar.createEl("button", { cls: "th-choice-bar-item", attr: { role: "menuitem", "aria-label": item.text } });
			button.toggleClass("is-selected", item.selected === true);
			if (item.glyph) {
				const glyph = button.createSpan({ cls: ["th-choice-bar-glyph", "th-mark", ...GLYPHS[item.glyph]] });
				if (item.glyph !== "skipped") setIcon(glyph, "check");
			} else if (item.icon) setIcon(button.createSpan("th-choice-bar-icon"), item.icon);
			button.createSpan({ cls: "th-choice-bar-label", text: item.text });
			button.addEventListener("click", (event) => item.onClick(event));
		});
		const first = bar.firstElementChild as HTMLElement | null;
		const firstGlyph = first?.firstElementChild as HTMLElement | null;
		const glyphOffsetX = firstGlyph ? firstGlyph.offsetLeft + firstGlyph.offsetWidth / 2 : 0;
		const glyphOffsetY = firstGlyph ? firstGlyph.offsetTop + firstGlyph.offsetHeight / 2 : 0;
		const centerX = box.left - area.left + box.width / 2;
		const centerY = box.top - area.top + box.height / 2;
		const left = Math.max(EDGE, Math.min(centerX - glyphOffsetX, area.width - bar.offsetWidth - EDGE));
		const top = Math.max(EDGE, Math.min(centerY - glyphOffsetY, area.height - this.bottomInset() - bar.offsetHeight - EDGE));
		bar.setCssProps({ left: `${left}px`, top: `${top}px` });
		bar.style.transformOrigin = `${centerX - left}px ${centerY - top}px`;
		layer.addClass("is-open");
		if (!fresh || this.reduced()) return;
		layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: OPEN_MS, easing: "ease-out" });
		bar.animate(
			[
				{ transform: "scale(0.4)", opacity: 0 },
				{ transform: "none", opacity: 1 },
			],
			{ duration: 360, easing: SPRING },
		);
		[...bar.children].forEach((child, index) =>
			(child as HTMLElement).animate(
				[
					{ transform: "translateX(-14px) scale(0.6)", opacity: 0 },
					{ transform: "none", opacity: 1 },
				],
				{ duration: 320, delay: 40 * index, easing: SPRING, fill: "backwards" },
			),
		);
	}

	close(): void {
		this.layer?.remove();
		this.layer = null;
	}

	private bottomInset(): number {
		return parseFloat(this.host.style.getPropertyValue("--th-bottom-inset")) || 0;
	}
}
