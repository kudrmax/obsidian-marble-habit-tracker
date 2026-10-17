/**
 * Today's habits on a panel under Obsidian's header: a header line that All habits uses for its way back, then the
 * list, which scrolls and fades out under the panel's top edge once scrolled.
 */
export class TodayPanel {
	readonly sheet: HTMLElement;
	readonly head: HTMLElement;
	readonly scroll: HTMLElement;

	constructor(root: HTMLElement) {
		this.sheet = root.createDiv("th-sheet");
		this.head = this.sheet.createDiv("th-sheet-head");
		this.scroll = this.sheet.createDiv("th-today-scroll");
		this.scroll.addEventListener("scroll", () => this.sheet.toggleClass("is-scrolled", this.scroll.scrollTop > 0), { passive: true });
	}
}
