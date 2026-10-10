import { JarSize } from "../../domain/Jar";
import { AssetSpec, JAR_DIAMETER, JarMaterial, assetKey, assetSvg } from "./JarAssets";
import { Hsl, hsl } from "./color";
import { Box, JarPhysics, Point } from "./JarPhysics";

export interface JarItem {
	readonly key: string;
	readonly group: string;
	readonly color: Hsl;
	readonly size: JarSize;
	readonly full: boolean;
	readonly today: boolean;
}

export interface JarOptions {
	readonly material: JarMaterial;
	readonly background: Hsl;
	readonly reduceMotion: boolean;
	onMerge?(item: JarItem): void;
	onImpact?(strength: number): void;
}

const RANK: Record<JarSize, number> = { small: 0, medium: 1, big: 2 };
const BORN_MS = 520;
const DROP_MS = 650;
const MERGE_MS = 420;
const HOLD_MS = 260;
const KICK = 8;
const RAIN_GAP = 18;
const QUIET_STEPS = 1500;

class SpriteCache {
	private readonly images = new Map<string, HTMLImageElement>();

	constructor(private readonly onReady: () => void) {}

	get(spec: AssetSpec): HTMLImageElement | null {
		const key = assetKey(spec);
		const cached = this.images.get(key);
		if (cached) return cached.complete && cached.naturalWidth > 0 ? cached : null;
		const image = new Image();
		const pixels = Math.ceil(JAR_DIAMETER[spec.size] * Math.max(2, window.devicePixelRatio || 1));
		image.onload = () => this.onReady();
		image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(assetSvg(spec, pixels))}`;
		this.images.set(key, image);
		return null;
	}

	clear(): void {
		this.images.clear();
	}
}

export class JarCanvas {
	private readonly canvas: HTMLCanvasElement;
	private readonly context: CanvasRenderingContext2D | null;
	private readonly physics = new JarPhysics(0, 0);
	private readonly sprites = new SpriteCache(() => this.wake());
	private readonly drawn = new Map<string, JarItem>();
	private readonly born = new Map<string, number>();
	private readonly resizer: ResizeObserver;
	private readonly timers = new Set<number>();
	private width = 0;
	private height = 0;
	private frame = 0;
	private filled = false;
	private ghost = 0;

	constructor(
		parent: HTMLElement,
		private options: JarOptions,
	) {
		this.canvas = parent.createEl("canvas", { cls: "th-jar", attr: { "aria-hidden": "true" } });
		this.context = this.canvas.getContext("2d");
		this.resizer = new ResizeObserver(() => this.measure());
		this.resizer.observe(this.canvas);
		this.measure();
	}

	setOptions(options: JarOptions): void {
		if (options.material !== this.options.material || hsl(options.background) !== hsl(this.options.background)) this.sprites.clear();
		this.options = options;
		this.wake();
	}

	setObstacles(obstacles: readonly Box[]): void {
		this.physics.setObstacles(obstacles);
		this.wake();
	}

	setLedges(ledges: readonly Box[]): void {
		this.physics.setLedges(ledges);
		this.wake();
	}

	setGravity(gravity: Point): void {
		this.physics.setGravity(gravity);
		if (!this.physics.isSettled()) this.wake();
	}

	replay(): void {
		for (const body of this.physics.bodies()) this.physics.remove(body.id);
		const items = [...this.drawn.values()];
		this.drawn.clear();
		this.filled = false;
		this.sync(items, new Map());
	}

	/** Returns the groups whose origin was used, so the caller can forget them. */
	sync(items: readonly JarItem[], origins: ReadonlyMap<string, Point>): Set<string> {
		const next = new Map(items.map((item) => [item.key, item]));
		const removed = [...this.drawn.values()].filter((item) => !next.has(item.key));
		const added = items.filter((item) => !this.drawn.has(item.key));
		for (const item of items) this.drawn.set(item.key, item);
		const used = new Set<string>();
		if (!this.filled) {
			this.filled = true;
			this.rain(added);
			this.wake();
			return used;
		}
		const leftovers = new Set(removed);
		for (const item of added) {
			const origin = item.today ? origins.get(item.group) : undefined;
			if (origin) used.add(item.group);
			const sources = item.today && item.size !== "small" ? removed.filter((old) => old.group === item.group && RANK[old.size] < RANK[item.size] && leftovers.has(old)) : [];
			if (sources.length) {
				sources.forEach((source) => leftovers.delete(source));
				this.merge(item, sources, origin);
			} else if (item.today && origin) {
				this.launch(item, this.local(origin));
			} else {
				this.spawn(item, { x: this.randomX(item), y: -this.radius(item) });
			}
		}
		for (const item of leftovers) this.forget(item.key);
		this.wake();
		return used;
	}

	destroy(): void {
		window.cancelAnimationFrame(this.frame);
		for (const timer of this.timers) window.clearTimeout(timer);
		this.resizer.disconnect();
		this.canvas.remove();
	}

	private rain(items: readonly JarItem[]): void {
		const order = [...items].sort((a, b) => Number(a.today) - Number(b.today));
		order.forEach((item, index) => this.place(item, { x: this.randomX(item), y: -this.radius(item) - index * RAIN_GAP }));
		if (this.options.reduceMotion) this.quiet();
	}

	private merge(item: JarItem, sources: readonly JarItem[], origin: Point | undefined): void {
		const ids = sources.map((source) => source.key);
		const gather = () => {
			const bodies = ids.flatMap((id) => {
				const body = this.physics.get(id);
				return body ? [body] : [];
			});
			if (bodies.length === 0) return this.spawn(item, { x: this.randomX(item), y: -this.radius(item) });
			const center = {
				x: bodies.reduce((sum, body) => sum + body.x, 0) / bodies.length,
				y: Math.min(this.height - this.radius(item), bodies.reduce((sum, body) => sum + body.y, 0) / bodies.length),
			};
			if (this.options.reduceMotion) {
				ids.forEach((id) => this.forget(id));
				return this.spawn(item, center);
			}
			this.physics.attract(ids, center);
			this.later(MERGE_MS, () => {
				ids.forEach((id) => this.forget(id));
				this.spawn(item, center);
				this.options.onMerge?.(item);
			});
		};
		if (!origin || this.options.reduceMotion) return gather();
		const ghost: JarItem = { ...item, key: `ghost:${this.ghost++}`, size: "small", full: item.full };
		this.launch(ghost, this.local(origin));
		ids.push(ghost.key);
		this.later(DROP_MS, gather);
	}

	/** Pops out of the tapped button, hangs there for a beat, then hops off and falls through the pile. */
	private launch(item: JarItem, at: Point): void {
		if (this.options.reduceMotion) return this.spawn(item, at);
		this.drawn.set(item.key, item);
		this.physics.add({ id: item.key, x: at.x, y: at.y, r: this.radius(item), passing: true });
		this.physics.attract([item.key], at);
		this.born.set(item.key, performance.now());
		this.later(HOLD_MS, () => this.physics.release([item.key], KICK));
		this.wake();
	}

	private spawn(item: JarItem, at: Point): void {
		this.place(item, at);
		if (this.options.reduceMotion) this.quiet();
		else this.born.set(item.key, performance.now());
		this.wake();
	}

	private place(item: JarItem, at: Point): void {
		this.drawn.set(item.key, item);
		this.physics.add({ id: item.key, x: at.x, y: at.y, r: this.radius(item) });
	}

	private forget(key: string): void {
		this.physics.remove(key);
		this.drawn.delete(key);
		this.born.delete(key);
	}

	private quiet(): void {
		for (let step = 0; step < QUIET_STEPS && !this.physics.isSettled(); step++) this.physics.step();
	}

	private later(ms: number, action: () => void): void {
		const timer = window.setTimeout(() => {
			this.timers.delete(timer);
			action();
		}, ms);
		this.timers.add(timer);
	}

	private local(point: Point): Point {
		const box = this.canvas.getBoundingClientRect();
		return { x: point.x - box.left, y: point.y - box.top };
	}

	private radius(item: JarItem): number {
		return JAR_DIAMETER[item.size] / 2;
	}

	private randomX(item: JarItem): number {
		const r = this.radius(item);
		return r + Math.random() * Math.max(0, this.width - 2 * r);
	}

	private measure(): void {
		const box = this.canvas.getBoundingClientRect();
		const width = Math.round(box.width);
		const height = Math.round(box.height);
		if (width === this.width && height === this.height) return;
		this.width = width;
		this.height = height;
		const ratio = window.devicePixelRatio || 1;
		this.canvas.width = Math.max(1, Math.round(width * ratio));
		this.canvas.height = Math.max(1, Math.round(height * ratio));
		this.physics.resize(width, height);
		this.wake();
	}

	private wake(): void {
		if (this.frame) return;
		this.frame = window.requestAnimationFrame(() => this.tick());
	}

	private tick(): void {
		this.frame = 0;
		if (this.width === 0 || this.height === 0) return;
		const impact = this.physics.step();
		if (impact > 0) this.options.onImpact?.(impact);
		this.draw();
		const now = performance.now();
		for (const [key, start] of this.born) if (now - start > BORN_MS) this.born.delete(key);
		if (!this.physics.isSettled() || this.born.size > 0) this.wake();
	}

	private draw(): void {
		const context = this.context;
		if (!context) return;
		const ratio = window.devicePixelRatio || 1;
		context.setTransform(ratio, 0, 0, ratio, 0, 0);
		context.clearRect(0, 0, this.width, this.height);
		const now = performance.now();
		for (const body of this.physics.bodies()) {
			const item = this.drawn.get(body.id);
			if (!item) continue;
			const start = this.born.get(body.id);
			const scale = start === undefined ? 1 : popScale((now - start) / BORN_MS);
			const r = body.r * scale;
			const sprite = this.sprites.get({ material: this.options.material, color: item.color, background: this.options.background, size: item.size, full: item.full });
			if (sprite) {
				context.drawImage(sprite, body.x - r, body.y - r, r * 2, r * 2);
				continue;
			}
			context.beginPath();
			context.arc(body.x, body.y, r, 0, Math.PI * 2);
			context.fillStyle = hsl(item.color);
			context.fill();
		}
	}
}

function popScale(t: number): number {
	if (t >= 1) return 1;
	if (t < 0.6) return 0.2 + (1.18 - 0.2) * (t / 0.6);
	return 1.18 - 0.18 * ((t - 0.6) / 0.4);
}
