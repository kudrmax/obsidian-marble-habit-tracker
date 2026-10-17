import { JarSize } from "../../domain/Jar";
import { AssetSpec, JarMaterial, MarbleSizes, assetKey, assetSvg } from "./JarAssets";
import { Hsl, hsl } from "./color";
import { FixedStep } from "./FixedStep";
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
	readonly sizes: MarbleSizes;
	/** How fast the marbles' time runs: 1 is the speed they were tuned at, 2 twice as fast. */
	readonly speed: number;
	/** The share of a hit's speed marbles keep as they bounce back, 0 to 1. */
	readonly bounce: number;
	/** The radius of the screen's rounded corners; marbles roll along them. */
	readonly screenCorners: number;
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
/** The size of the invisible ball the mouse pushes marbles with. */
const PUSHER_R = 18;

/**
 * Marble sprites drawn once from their SVG into a bitmap. Drawing a bitmap each frame is cheap; drawing an SVG image
 * can make Safari rasterize it again every frame, and the grain filter is costly to rasterize.
 */
class SpriteCache {
	private readonly sprites = new Map<string, HTMLCanvasElement | null>();
	private generation = 0;

	constructor(private readonly onReady: () => void) {}

	/** `spec` is only built the first time a key is seen. */
	get(key: string, spec: () => AssetSpec, diameter: number): HTMLCanvasElement | null {
		if (this.sprites.has(key)) return this.sprites.get(key) ?? null;
		this.sprites.set(key, null);
		const asset = spec();
		const pixels = Math.ceil(diameter * Math.max(2, window.devicePixelRatio || 1));
		const generation = this.generation;
		const image = new Image();
		image.onload = () => {
			if (generation !== this.generation) return;
			const bitmap = createEl("canvas");
			bitmap.width = pixels;
			bitmap.height = pixels;
			bitmap.getContext("2d")?.drawImage(image, 0, 0, pixels, pixels);
			this.sprites.set(key, bitmap);
			this.onReady();
		};
		image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(assetSvg(asset, pixels))}`;
		return null;
	}

	clear(): void {
		this.generation++;
		this.sprites.clear();
	}
}

export class JarCanvas {
	private readonly canvas: HTMLCanvasElement;
	private readonly context: CanvasRenderingContext2D | null;
	private readonly physics = new JarPhysics(0, 0);
	private readonly sprites = new SpriteCache(() => this.wake());
	/** Each marble's sprite key, worked out once per marble instead of every frame. */
	private spriteKeys = new WeakMap<JarItem, string>();
	private readonly drawn = new Map<string, JarItem>();
	private readonly born = new Map<string, number>();
	/** Marbles flying into a merge (the merging ones and the one launched from the button): a later sync must not delete them mid-flight. */
	private readonly inFlight = new Set<string>();
	private readonly resizer: ResizeObserver;
	private readonly timers = new Set<number>();
	private width = 0;
	private height = 0;
	/** The size the marbles live in; it lags behind the canvas while held. */
	private worldWidth = 0;
	private worldHeight = 0;
	private held: () => boolean = () => false;
	private pendingObstacles: readonly Box[] | null = null;
	private pendingLedges: readonly Box[] | null = null;
	private frame = 0;
	private readonly clock = new FixedStep();
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
		this.physics.setBounce(options.bounce);
		this.measure();
	}

	setOptions(options: JarOptions): void {
		const resized = (["small", "medium", "big"] as const).some((size) => options.sizes[size] !== this.options.sizes[size]);
		if (resized || options.material !== this.options.material || hsl(options.background) !== hsl(this.options.background)) {
			this.sprites.clear();
			this.spriteKeys = new WeakMap();
		}
		const corners = options.screenCorners !== this.options.screenCorners;
		this.options = options;
		this.physics.setBounce(options.bounce);
		if (corners) this.placeScreen();
		if (resized) for (const item of this.drawn.values()) this.physics.setRadius(item.key, this.radius(item));
		this.wake();
	}

	setObstacles(obstacles: readonly Box[]): void {
		if (this.worldWidth > 0 && this.held()) {
			this.pendingObstacles = obstacles;
			return;
		}
		this.physics.setObstacles(obstacles);
		this.wake();
	}

	setLedges(ledges: readonly Box[]): void {
		if (this.worldWidth > 0 && this.held()) {
			this.pendingLedges = ledges;
			return;
		}
		this.physics.setLedges(ledges);
		this.wake();
	}

	/**
	 * While `held` says so, the marbles keep their world as it was: a keyboard shrinking the screen for a moment must not
	 * squeeze the pile. It is asked at the moment the size changes; call `refit` once it no longer holds.
	 */
	holdWhile(held: () => boolean): void {
		this.held = held;
	}

	refit(): void {
		if (this.held()) return;
		if (this.pendingObstacles) this.setObstacles(this.pendingObstacles);
		if (this.pendingLedges) this.setLedges(this.pendingLedges);
		this.pendingObstacles = null;
		this.pendingLedges = null;
		this.measure();
	}

	/** The mouse at this screen point pushes the marbles it touches; null when it has left. */
	setPusher(at: Point | null): void {
		this.physics.setPusher(at ? { ...this.local(at), r: PUSHER_R } : null);
		if (!this.physics.isSettled()) this.wake();
	}

	setGravity(gravity: Point): void {
		this.physics.setGravity(gravity);
		if (!this.physics.isSettled()) this.wake();
	}

	/** Returns the groups whose origin was used, so the caller can forget them. */
	sync(items: readonly JarItem[], origins: ReadonlyMap<string, Point>): Set<string> {
		const next = new Map(items.map((item) => [item.key, item]));
		const removed = [...this.drawn.values()].filter((item) => !next.has(item.key) && !this.inFlight.has(item.key));
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
		ids.forEach((id) => this.inFlight.add(id));
		const finish = (at: Point) => {
			ids.forEach((id) => this.forget(id));
			if (!this.drawn.has(item.key)) return;
			this.spawn(item, at);
			this.options.onMerge?.(item);
		};
		const gather = () => {
			const bodies = ids.flatMap((id) => {
				const body = this.physics.get(id);
				return body ? [body] : [];
			});
			if (bodies.length === 0) return finish({ x: this.randomX(item), y: -this.radius(item) });
			const center = {
				x: bodies.reduce((sum, body) => sum + body.x, 0) / bodies.length,
				y: Math.min(this.worldHeight - this.radius(item), bodies.reduce((sum, body) => sum + body.y, 0) / bodies.length),
			};
			if (this.options.reduceMotion) return finish(center);
			this.physics.attract(ids, center);
			this.later(MERGE_MS / this.options.speed, () => finish(center));
		};
		if (!origin || this.options.reduceMotion) return gather();
		const ghost: JarItem = { ...item, key: `ghost:${this.ghost++}`, size: "small", full: item.full };
		this.launch(ghost, this.local(origin));
		ids.push(ghost.key);
		this.inFlight.add(ghost.key);
		this.later(DROP_MS / this.options.speed, gather);
	}

	/** Pops out of the tapped button, hangs there for a beat, then hops off and falls through the pile. */
	private launch(item: JarItem, at: Point): void {
		if (this.options.reduceMotion) return this.spawn(item, at);
		this.drawn.set(item.key, item);
		this.physics.add({ id: item.key, x: at.x, y: at.y, r: this.radius(item), passing: true });
		this.physics.attract([item.key], at);
		this.born.set(item.key, performance.now());
		this.later(HOLD_MS / this.options.speed, () => this.physics.release([item.key], KICK));
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
		this.inFlight.delete(key);
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
		return this.options.sizes[item.size] / 2;
	}

	private randomX(item: JarItem): number {
		const r = this.radius(item);
		return r + Math.random() * Math.max(0, this.worldWidth - 2 * r);
	}

	private measure(): void {
		const box = this.canvas.getBoundingClientRect();
		const width = Math.round(box.width);
		const height = Math.round(box.height);
		if (width !== this.width || height !== this.height) {
			this.width = width;
			this.height = height;
			const ratio = window.devicePixelRatio || 1;
			this.canvas.width = Math.max(1, Math.round(width * ratio));
			this.canvas.height = Math.max(1, Math.round(height * ratio));
			this.wake();
		}
		if (this.worldWidth === width && this.worldHeight === height) return;
		if (this.worldWidth > 0 && this.held()) return;
		this.worldWidth = width;
		this.worldHeight = height;
		this.physics.resize(width, height);
		this.placeScreen();
		this.wake();
	}

	/** Where the screen's corners are as seen from the canvas, which may not start at the screen's edge. */
	private placeScreen(): void {
		const radius = this.options.screenCorners;
		if (radius <= 0) return this.physics.setScreen(null);
		const box = this.canvas.getBoundingClientRect();
		this.physics.setScreen({ left: -box.left, top: -box.top, right: window.innerWidth - box.left, bottom: window.innerHeight - box.top, radius });
	}

	private wake(): void {
		if (this.frame) return;
		this.frame = window.requestAnimationFrame((time) => this.tick(time));
	}

	private tick(time: number): void {
		this.frame = 0;
		if (this.width === 0 || this.height === 0) return;
		const steps = this.clock.next(time, this.options.speed);
		let impact = 0;
		for (let step = 0; step < steps; step++) impact = Math.max(impact, this.physics.step());
		if (impact > 0) this.options.onImpact?.(impact);
		if (steps > 0 || this.born.size > 0) this.draw();
		const now = performance.now();
		for (const [key, start] of this.born) if (now - start > BORN_MS) this.born.delete(key);
		if (!this.physics.isSettled() || this.born.size > 0) this.wake();
		else this.clock.reset();
	}

	private assetOf(item: JarItem): AssetSpec {
		return { material: this.options.material, color: item.color, background: this.options.background, size: item.size, full: item.full };
	}

	private spriteKey(item: JarItem): string {
		let key = this.spriteKeys.get(item);
		if (key === undefined) {
			key = assetKey(this.assetOf(item));
			this.spriteKeys.set(item, key);
		}
		return key;
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
			const sprite = this.sprites.get(this.spriteKey(item), () => this.assetOf(item), this.options.sizes[item.size]);
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
