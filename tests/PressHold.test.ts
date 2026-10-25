import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOLD_MS, HOLD_SLOP, PressHold, PressHoldHost } from "../src/ui/PressHold";

type Pointer = { button?: number; x?: number; y?: number };

/** A view's root with one element in it. The hold listens on the root only while capturing, so an event reaches the root first. */
class Page {
	readonly host: PressHoldHost & EventTarget = Object.assign(new EventTarget(), {
		setTimeout: (run: () => void, ms: number) => setTimeout(run, ms) as unknown as number,
		clearTimeout: (id: number) => clearTimeout(id),
	}) as unknown as PressHoldHost & EventTarget;
	readonly root = new EventTarget();
	readonly element = new EventTarget();
	readonly hold = new PressHold(this.root as HTMLElement, this.host);

	fire(type: string, pointer: Pointer = {}): Event {
		const event = Object.assign(new Event(type, { cancelable: true }), {
			button: pointer.button ?? 0,
			clientX: pointer.x ?? 0,
			clientY: pointer.y ?? 0,
		});
		let stopped = false;
		event.stopImmediatePropagation = () => (stopped = true);
		this.root.dispatchEvent(event);
		if (!stopped) this.element.dispatchEvent(event);
		return event;
	}

	release(): void {
		this.host.dispatchEvent(new Event("pointerup"));
	}
}

describe("PressHold", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("does nothing on a tap", () => {
		const page = new Page();
		const action = vi.fn();
		page.hold.attach(page.element as HTMLElement, action);
		page.fire("pointerdown");
		vi.advanceTimersByTime(HOLD_MS - 1);
		page.release();
		vi.advanceTimersByTime(HOLD_MS);
		expect(action).not.toHaveBeenCalled();
	});

	it("runs the action once the press is held, before the finger lifts", () => {
		const page = new Page();
		const action = vi.fn();
		page.hold.attach(page.element as HTMLElement, action);
		page.fire("pointerdown");
		vi.advanceTimersByTime(HOLD_MS);
		expect(action).toHaveBeenCalledTimes(1);
		page.release();
		expect(action).toHaveBeenCalledTimes(1);
	});

	it("lets a press that wanders off scroll instead", () => {
		const page = new Page();
		const action = vi.fn();
		page.hold.attach(page.element as HTMLElement, action);
		page.fire("pointerdown", { x: 10, y: 10 });
		page.host.dispatchEvent(Object.assign(new Event("pointermove"), { clientX: 10, clientY: 10 + HOLD_SLOP + 1 }));
		vi.advanceTimersByTime(HOLD_MS);
		expect(action).not.toHaveBeenCalled();
	});

	it("lets the browser take a press over for a scroll", () => {
		const page = new Page();
		const action = vi.fn();
		page.hold.attach(page.element as HTMLElement, action);
		page.fire("pointerdown");
		page.host.dispatchEvent(new Event("pointercancel"));
		vi.advanceTimersByTime(HOLD_MS);
		expect(action).not.toHaveBeenCalled();
	});

	it("holds only with the main button, so a right click still opens its menu", () => {
		const page = new Page();
		const action = vi.fn();
		page.hold.attach(page.element as HTMLElement, action);
		page.fire("pointerdown", { button: 2 });
		vi.advanceTimersByTime(HOLD_MS);
		expect(action).not.toHaveBeenCalled();
		expect(page.fire("contextmenu").defaultPrevented).toBe(false);
	});

	it("swallows the click and the context menu that end a hold, and nothing after the next press", () => {
		const page = new Page();
		page.hold.attach(page.element as HTMLElement, () => {});
		page.fire("pointerdown");
		vi.advanceTimersByTime(HOLD_MS);
		expect(page.fire("contextmenu").defaultPrevented).toBe(true);
		page.release();
		expect(page.fire("click").defaultPrevented).toBe(true);
		page.fire("pointerdown");
		page.release();
		expect(page.fire("click").defaultPrevented).toBe(false);
	});

	it("swallows a touch's context menu while the hold is still counting", () => {
		const page = new Page();
		const action = vi.fn();
		page.hold.attach(page.element as HTMLElement, action);
		page.fire("pointerdown");
		expect(page.fire("contextmenu").defaultPrevented).toBe(true);
		vi.advanceTimersByTime(HOLD_MS);
		expect(action).toHaveBeenCalledTimes(1);
	});

	it("swallows the context menu Obsidian's phone app sends to the held element itself, once the hold has redrawn it away", () => {
		const page = new Page();
		const menu = vi.fn();
		page.hold.attach(page.element as HTMLElement, () => {});
		page.element.addEventListener("contextmenu", menu);
		page.fire("pointerdown");
		vi.advanceTimersByTime(HOLD_MS);
		const late = new Event("contextmenu", { cancelable: true });
		page.element.dispatchEvent(late);
		expect(late.defaultPrevented).toBe(true);
		expect(menu).not.toHaveBeenCalled();
	});

	it("starts over on every press, so an earlier element's hold never fires late", () => {
		const page = new Page();
		const first = vi.fn();
		page.hold.attach(page.element as HTMLElement, first);
		page.fire("pointerdown");
		vi.advanceTimersByTime(HOLD_MS - 1);
		page.root.dispatchEvent(Object.assign(new Event("pointerdown"), { button: 0, clientX: 0, clientY: 0 }));
		vi.advanceTimersByTime(HOLD_MS);
		expect(first).not.toHaveBeenCalled();
	});

	it("stops listening once destroyed", () => {
		const page = new Page();
		const action = vi.fn();
		page.hold.attach(page.element as HTMLElement, action);
		page.fire("pointerdown");
		page.hold.destroy();
		vi.advanceTimersByTime(HOLD_MS);
		expect(action).not.toHaveBeenCalled();
	});
});
