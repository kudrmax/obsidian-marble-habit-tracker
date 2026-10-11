import { Platform } from "obsidian";

/**
 * Tells when a phone's on-screen keyboard is up, or about to be: a text field outside `area` has focus, or Obsidian
 * reports a keyboard height. Focus comes before the keyboard shrinks the screen, so the change is known in time.
 */
export class KeyboardWatch {
	private readonly styles = new MutationObserver(() => this.check());
	private readonly onEvent = () => this.check();
	private readonly onFocusOut = () => window.requestAnimationFrame(() => this.check());
	private open = false;

	constructor(
		private readonly area: HTMLElement,
		private readonly onClose: () => void,
	) {
		if (!Platform.isMobile) return;
		this.styles.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
		document.addEventListener("focusin", this.onEvent);
		document.addEventListener("focusout", this.onFocusOut);
		window.addEventListener("resize", this.onEvent);
	}

	destroy(): void {
		this.styles.disconnect();
		document.removeEventListener("focusin", this.onEvent);
		document.removeEventListener("focusout", this.onFocusOut);
		window.removeEventListener("resize", this.onEvent);
	}

	isOpen(): boolean {
		return Platform.isMobile && (this.typing() || keyboardHeight() > 0);
	}

	private check(): void {
		const open = this.isOpen();
		if (open === this.open) return;
		this.open = open;
		if (!open) this.onClose();
	}

	private typing(): boolean {
		const active = document.activeElement;
		if (!active?.instanceOf(HTMLElement) || this.area.contains(active)) return false;
		return active.isContentEditable || active.instanceOf(HTMLTextAreaElement) || (active.instanceOf(HTMLInputElement) && !NOT_TYPED.has(active.type));
	}
}

const NOT_TYPED = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);

function keyboardHeight(): number {
	return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--keyboard-height")) || 0;
}
