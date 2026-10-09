export interface ScrollBox {
	readonly scrollWidth: number;
	readonly clientWidth: number;
}

export class ScrollAnchor {
	private fromRight = 0;

	remember(box: ScrollBox & { readonly scrollLeft: number }): void {
		if (box.clientWidth === 0) return;
		this.fromRight = Math.max(0, box.scrollWidth - box.clientWidth - box.scrollLeft);
	}

	scrollLeft(box: ScrollBox): number {
		return Math.max(0, box.scrollWidth - box.clientWidth - this.fromRight);
	}
}
