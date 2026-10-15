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
 * iOS's context menu: the screen blurs and dims, the held row lifts out of it, and a menu opens under the row — or
 * above it when there is no room below. A tap anywhere outside closes it.
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

	/** Opens over `row`, which stays where it is underneath; `fresh` plays the opening, a redraw of an open menu doesn't. */
	open(row: HTMLElement, items: readonly ContextMenuItem[], fresh: boolean, className: string[]): void {
		this.close();
		const area = this.host.getBoundingClientRect();
		const box = row.getBoundingClientRect();
		const layer = this.host.createDiv("th-context");
		this.layer = layer;
		layer.addEventListener("click", (event) => {
			if (event.target === layer) this.onDismiss();
		});
		const lifted = layer.createDiv({ cls: ["th-context-row", ...className] });
		lifted.append(row.cloneNode(true));
		lifted.setCssProps({ top: `${box.top - area.top}px`, left: `${box.left - area.left}px`, width: `${box.width}px` });
		lifted.addEventListener("click", () => this.onDismiss());

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
		const fitsBelow = below + height <= area.height - this.bottomInset() - EDGE;
		const top = fitsBelow || above < EDGE ? below : above;
		menu.setCssProps({ top: `${top}px`, left: `${Math.max(EDGE, box.left - area.left + 8)}px` });
		menu.style.transformOrigin = fitsBelow ? "24px 0" : "24px 100%";
		if (!fresh || this.reduced()) {
			layer.addClass("is-open");
			return;
		}
		layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: OPEN_MS, easing: "ease-out" });
		layer.addClass("is-open");
		lifted.animate([{ transform: "scale(1)" }, { transform: "scale(1.03)", offset: 0.5 }, { transform: "scale(1.015)" }], { duration: OPEN_MS * 1.4, easing: SPRING, fill: "forwards" });
		menu.animate(
			[
				{ transform: "scale(0.82)", opacity: 0 },
				{ transform: "none", opacity: 1 },
			],
			{ duration: 300, easing: SPRING },
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
