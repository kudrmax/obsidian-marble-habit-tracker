export interface Point {
	readonly x: number;
	readonly y: number;
}

export interface BodyInput {
	readonly id: string;
	readonly x: number;
	readonly y: number;
	readonly r: number;
	/** Passes through other bodies and boxes until it no longer overlaps any of them. */
	readonly passing?: boolean;
}

export interface Body {
	readonly id: string;
	x: number;
	y: number;
	r: number;
	px: number;
	py: number;
	inside: boolean;
	passing: boolean;
	/** Has touched the floor, a shelf or a landed body; only landed bodies bump into ledges. */
	landed: boolean;
}

/** A solid rounded rectangle the bodies bounce off. */
export interface Box {
	readonly left: number;
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
	readonly radius: number;
}

export const EARTH: Point = { x: 0, y: 0.45 };

const DAMPING = 0.985;
const PASSES = 6;
const ATTRACTION = 0.22;
const REST_SPEED = 0.05;
const REST_FRAMES = 30;
const GRAVITY_EPSILON = 0.01;
const CONTACT = 1;

export class JarPhysics {
	private readonly items = new Map<string, Body>();
	private readonly targets = new Map<string, Point>();
	private gravity: Point = EARTH;
	private obstacles: readonly Box[] = [];
	private ledges: readonly Box[] = [];
	/** The screen with its rounded corners, in the same coordinates as the bodies; the bodies stay inside its corners. */
	private screen: Box | null = null;
	/** The boxes as a body of each radius meets them; rebuilt when the boxes or the size change, not per body per frame. */
	private readonly shapes = new Map<number, Shapes>();
	/** Reused every step so the hot loop allocates nothing. */
	private readonly free: Body[] = [];
	private before = new Float64Array(64);
	private quietFrames = 0;

	constructor(
		private width: number,
		private height: number,
	) {}

	resize(width: number, height: number): void {
		this.width = width;
		this.height = height;
		this.shapes.clear();
		this.quietFrames = 0;
	}

	setObstacles(obstacles: readonly Box[]): void {
		this.obstacles = obstacles;
		this.shapes.clear();
		this.quietFrames = 0;
	}

	setScreen(screen: Box | null): void {
		this.screen = screen;
		this.quietFrames = 0;
	}

	/** Boxes that falling bodies pass through and landed bodies bounce off. */
	setLedges(ledges: readonly Box[]): void {
		this.ledges = ledges;
		this.shapes.clear();
		this.quietFrames = 0;
	}

	setGravity(gravity: Point): void {
		const changed = Math.abs(gravity.x - this.gravity.x) + Math.abs(gravity.y - this.gravity.y) > GRAVITY_EPSILON;
		this.gravity = gravity;
		if (changed) this.quietFrames = 0;
	}

	add(input: BodyInput): void {
		this.items.set(input.id, { ...input, px: input.x, py: input.y, inside: input.y >= input.r, passing: input.passing ?? false, landed: false });
		this.quietFrames = 0;
	}

	remove(id: string): void {
		this.items.delete(id);
		this.targets.delete(id);
	}

	get(id: string): Body | undefined {
		return this.items.get(id);
	}

	bodies(): Body[] {
		return [...this.items.values()];
	}

	attract(ids: readonly string[], target: Point): void {
		for (const id of ids) if (this.items.has(id)) this.targets.set(id, target);
		this.quietFrames = 0;
	}

	/** Lets attracted bodies go, pushed against gravity by `kick` frames' worth of it. */
	release(ids: readonly string[], kick = 0): void {
		for (const id of ids) {
			const body = this.items.get(id);
			if (!body || !this.targets.delete(id)) continue;
			body.px = body.x + this.gravity.x * kick;
			body.py = body.y + this.gravity.y * kick;
		}
		this.quietFrames = 0;
	}

	isSettled(): boolean {
		return this.targets.size === 0 && this.quietFrames >= REST_FRAMES;
	}

	/** Advances one frame and returns the hardest hit: the most speed any body lost to a wall or a neighbour. */
	step(): number {
		for (const body of this.items.values()) {
			const target = this.targets.get(body.id);
			const vx = (body.x - body.px) * DAMPING + this.gravity.x;
			const vy = (body.y - body.py) * DAMPING + this.gravity.y;
			body.px = body.x;
			body.py = body.y;
			if (target) {
				body.x += (target.x - body.x) * ATTRACTION;
				body.y += (target.y - body.y) * ATTRACTION;
				continue;
			}
			body.x += vx;
			body.y += vy;
		}
		const free = this.free;
		free.length = 0;
		for (const body of this.items.values()) if (!this.targets.has(body.id)) free.push(body);
		if (this.before.length < free.length) this.before = new Float64Array(free.length * 2);
		const before = this.before;
		for (let i = 0; i < free.length; i++) before[i] = Math.hypot(free[i].x - free[i].px, free[i].y - free[i].py);
		for (let pass = 0; pass < PASSES; pass++) {
			for (let i = 0; i < free.length; i++) {
				for (let j = i + 1; j < free.length; j++) this.separate(free[i], free[j]);
				this.contain(free[i]);
			}
		}
		for (const body of free) {
			if (body.passing) body.passing = free.some((other) => other !== body && overlaps(body, other)) || this.shapesFor(body).obstacles.some((box) => touches(body, box));
		}
		for (const body of free) if (!body.landed && !body.passing) body.landed = this.lands(body, free);
		let fastest = 0;
		let hardest = 0;
		for (let i = 0; i < free.length; i++) {
			const body = free[i];
			const speed = Math.hypot(body.x - body.px, body.y - body.py);
			fastest = Math.max(fastest, speed);
			hardest = Math.max(hardest, before[i] - speed);
		}
		this.quietFrames = fastest < REST_SPEED ? this.quietFrames + 1 : 0;
		return hardest;
	}

	private solidFor(body: Body): readonly Box[] {
		if (body.passing) return NONE;
		const shapes = this.shapesFor(body);
		return body.landed ? shapes.solids : shapes.obstacles;
	}

	private shapesFor(body: Body): Shapes {
		let shapes = this.shapes.get(body.r);
		if (!shapes) {
			const obstacles = this.obstacles.map((box) => this.walled(box, body.r));
			shapes = { obstacles, solids: [...obstacles, ...this.ledges] };
			this.shapes.set(body.r, shapes);
		}
		return shapes;
	}

	/** A body too big to pass under a box meets it as reaching the floor, so it can't wedge itself half under the box's end. */
	private walled(box: Box, r: number): Box {
		if (2 * r <= this.height - box.bottom) return box;
		return { ...box, bottom: 2 * this.height + box.radius };
	}

	private lands(body: Body, free: readonly Body[]): boolean {
		if (this.ledges.some((box) => touches(body, box))) return false;
		if (body.y >= this.height - body.r - CONTACT) return true;
		const near = { ...body, r: body.r + CONTACT };
		return this.shapesFor(body).obstacles.some((box) => touches(near, box)) || free.some((other) => other !== body && other.landed && overlaps(near, other));
	}

	private separate(a: Body, b: Body): void {
		if (a.passing || b.passing) return;
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const min = a.r + b.r;
		const distanceSquared = dx * dx + dy * dy;
		if (distanceSquared >= min * min || distanceSquared === 0) return;
		const distance = Math.sqrt(distanceSquared);
		const push = (min - distance) / distance;
		const massA = a.r * a.r;
		const massB = b.r * b.r;
		const shareA = massB / (massA + massB);
		const shareB = massA / (massA + massB);
		a.x -= dx * push * shareA;
		a.y -= dy * push * shareA;
		b.x += dx * push * shareB;
		b.y += dy * push * shareB;
	}

	private contain(body: Body): void {
		const solid = this.solidFor(body);
		for (const box of solid) pushOut(body, box);
		if (body.x < body.r) body.x = body.r;
		if (body.x > this.width - body.r) body.x = this.width - body.r;
		if (body.y > this.height - body.r) body.y = this.height - body.r;
		if (!body.inside) {
			body.inside = body.y >= body.r;
			return;
		}
		if (body.y < body.r) body.y = body.r;
		if (this.screen) keepInCorners(body, this.screen);
	}
}

const NONE: readonly Box[] = [];

interface Shapes {
	readonly obstacles: readonly Box[];
	readonly solids: readonly Box[];
}

function overlaps(a: Body, b: Body): boolean {
	return Math.hypot(b.x - a.x, b.y - a.y) < a.r + b.r;
}

function inner(box: Box): Box {
	const radius = Math.min(box.radius, (box.right - box.left) / 2, (box.bottom - box.top) / 2);
	return { left: box.left + radius, top: box.top + radius, right: box.right - radius, bottom: box.bottom - radius, radius };
}

function touches(body: Body, box: Box): boolean {
	const core = inner(box);
	const dx = body.x - Math.max(core.left, Math.min(core.right, body.x));
	const dy = body.y - Math.max(core.top, Math.min(core.bottom, body.y));
	return Math.hypot(dx, dy) < core.radius + body.r;
}

/** Pulls a body in a corner of `screen` back inside the corner's curve. */
function keepInCorners(body: Body, screen: Box): void {
	const reach = Math.max(screen.radius, body.r);
	const x = Math.max(screen.left + reach, Math.min(screen.right - reach, body.x));
	const y = Math.max(screen.top + reach, Math.min(screen.bottom - reach, body.y));
	if (x === body.x || y === body.y) return;
	const dx = body.x - x;
	const dy = body.y - y;
	const distance = Math.hypot(dx, dy);
	const limit = reach - body.r;
	if (distance <= limit) return;
	body.x = x + (dx / distance) * limit;
	body.y = y + (dy / distance) * limit;
}

function pushOut(body: Body, box: Box): void {
	const core = inner(box);
	const min = core.radius + body.r;
	const x = Math.max(core.left, Math.min(core.right, body.x));
	const y = Math.max(core.top, Math.min(core.bottom, body.y));
	const dx = body.x - x;
	const dy = body.y - y;
	const distanceSquared = dx * dx + dy * dy;
	if (distanceSquared >= min * min) return;
	if (distanceSquared > 0) {
		const distance = Math.sqrt(distanceSquared);
		body.x = x + (dx / distance) * min;
		body.y = y + (dy / distance) * min;
		return;
	}
	const exits = [
		{ depth: body.x - core.left, apply: () => (body.x = core.left - min) },
		{ depth: core.right - body.x, apply: () => (body.x = core.right + min) },
		{ depth: body.y - core.top, apply: () => (body.y = core.top - min) },
		{ depth: core.bottom - body.y, apply: () => (body.y = core.bottom + min) },
	];
	exits.reduce((best, exit) => (exit.depth < best.depth ? exit : best)).apply();
}
