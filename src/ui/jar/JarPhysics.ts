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
/** Bodies closer than this to straight above one another get pushed a hair apart sideways, as nothing in the world is perfectly aligned. */
const ALIGNED = 0.01;
const NUDGE = 0.2;
/**
 * The fastest a body may be lifted in a step, in px per step, beyond how fast it was already going up. A box that rises
 * under the bodies carries them, and when it stops they hop off it; a fast box would otherwise throw them across the screen.
 */
const MAX_LIFT = 6;
/** Hits slower than this, in px per step, don't bounce, so a resting pile stays at rest instead of trembling. */
const BOUNCE_MIN = 1.2;
/** A hit counts as from above when it comes within 60° of the pull of gravity. */
const SUPPORTED = 0.5;

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
	private incoming = new Float64Array(128);
	private readonly contacts = new Contacts();
	/** The share of a hit's speed a body keeps as it bounces back: 0 lands dead, 1 bounces as high as it fell. */
	private bounce = 0;
	private quietFrames = 0;
	/** A solid ball the mouse moves around; bodies it touches are pushed away. */
	private pusher: { x: number; y: number; r: number } | null = null;
	/** Drives the sideways nudges; fixed so that a run can be replayed. */
	private seed = 1;

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

	/** Moves the mouse's ball, or takes it away with null; the bodies wake only when it reaches one of them. */
	setPusher(pusher: { x: number; y: number; r: number } | null): void {
		this.pusher = pusher;
		if (!pusher) return;
		for (const body of this.items.values()) {
			if (!this.pushes(body)) continue;
			this.quietFrames = 0;
			return;
		}
	}

	setBounce(bounce: number): void {
		this.bounce = Math.max(0, Math.min(1, bounce));
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

	setRadius(id: string, r: number): void {
		const body = this.items.get(id);
		if (!body || body.r === r) return;
		body.r = r;
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
		if (this.before.length < free.length) {
			this.before = new Float64Array(free.length * 2);
			this.incoming = new Float64Array(free.length * 4);
		}
		const before = this.before;
		const incoming = this.incoming;
		for (let i = 0; i < free.length; i++) {
			incoming[2 * i] = free[i].x - free[i].px;
			incoming[2 * i + 1] = free[i].y - free[i].py;
			before[i] = Math.hypot(incoming[2 * i], incoming[2 * i + 1]);
		}
		if (this.pusher) for (const body of free) this.pushAway(body);
		for (let pass = 0; pass < PASSES; pass++) {
			for (let i = 0; i < free.length; i++) {
				for (let j = i + 1; j < free.length; j++) this.separate(free[i], free[j]);
				this.contain(free[i]);
			}
		}
		for (let i = 0; i < free.length; i++) {
			const lift = Math.min(-MAX_LIFT, incoming[2 * i + 1]);
			if (free[i].y - free[i].py < lift) free[i].py = free[i].y - lift;
		}
		let hardest = 0;
		for (let i = 0; i < free.length; i++) hardest = Math.max(hardest, before[i] - Math.hypot(free[i].x - free[i].px, free[i].y - free[i].py));
		if (this.bounce > 0) this.rebound(free);
		for (const body of free) {
			if (body.passing) body.passing = free.some((other) => other !== body && overlaps(body, other)) || this.shapesFor(body).obstacles.some((box) => touches(body, box));
		}
		for (const body of free) if (!body.landed && !body.passing) body.landed = this.lands(body, free);
		let fastest = 0;
		for (const body of free) fastest = Math.max(fastest, Math.hypot(body.x - body.px, body.y - body.py));
		this.quietFrames = fastest < REST_SPEED ? this.quietFrames + 1 : 0;
		return hardest;
	}

	/**
	 * The collisions above only stop a body at what it hits. Here each hit gives some of its speed back: along every
	 * contact's normal, bodies part at least as fast as `bounce` of the speed they met with before the step began, and
	 * contacts that met slower just don't close in further. Solved over all contacts at once, several passes, so a pile
	 * stands on the floor: a marble landing on top bounces off the whole pile, not off one loose marble.
	 */
	private rebound(free: readonly Body[]): void {
		const contacts = this.contacts;
		contacts.clear();
		const incoming = this.incoming;
		for (let i = 0; i < free.length; i++) {
			const body = free[i];
			if (body.passing) continue;
			this.touchWalls(i, body);
			for (let j = i + 1; j < free.length; j++) {
				const other = free[j];
				if (other.passing) continue;
				const dx = other.x - body.x;
				const dy = other.y - body.y;
				const distance = Math.hypot(dx, dy);
				if (distance === 0 || distance > body.r + other.r + CONTACT) continue;
				const nx = dx / distance;
				const ny = dy / distance;
				const closing = (incoming[2 * j] - incoming[2 * i]) * nx + (incoming[2 * j + 1] - incoming[2 * i + 1]) * ny;
				contacts.add(i, j, nx, ny, this.parting(closing), this.shareOf(body, other, i, j, nx, ny));
			}
		}
		for (let pass = 0; pass < PASSES; pass++) {
			for (let c = 0; c < contacts.length; c++) {
				const a = free[contacts.a[c]];
				const nx = contacts.nx[c];
				const ny = contacts.ny[c];
				const j = contacts.b[c];
				if (j < 0) {
					const gain = contacts.target[c] - ((a.x - a.px) * nx + (a.y - a.py) * ny);
					if (gain <= 0) continue;
					a.px -= nx * gain;
					a.py -= ny * gain;
					continue;
				}
				const b = free[j];
				const gain = contacts.target[c] - ((b.x - b.px - (a.x - a.px)) * nx + (b.y - b.py - (a.y - a.py)) * ny);
				if (gain <= 0) continue;
				const shareA = contacts.share[c];
				a.px += nx * gain * shareA;
				a.py += ny * gain * shareA;
				b.px -= nx * gain * (1 - shareA);
				b.py -= ny * gain * (1 - shareA);
			}
		}
	}

	/**
	 * How much of a contact's push body `a` takes. A body that lay still on the pile when `b` hit it from above is held up
	 * by everything under it down to the floor, so it doesn't give way: the one that hit it takes the whole bounce.
	 */
	private shareOf(a: Body, b: Body, i: number, j: number, nx: number, ny: number): number {
		const pull = Math.hypot(this.gravity.x, this.gravity.y);
		const below = pull > 0 ? (nx * this.gravity.x + ny * this.gravity.y) / pull : 0;
		if (below > SUPPORTED && this.resting(b, j)) return 1;
		if (below < -SUPPORTED && this.resting(a, i)) return 0;
		const massA = a.r * a.r;
		const massB = b.r * b.r;
		return massB / (massA + massB);
	}

	private resting(body: Body, index: number): boolean {
		return body.landed && Math.hypot(this.incoming[2 * index], this.incoming[2 * index + 1]) < BOUNCE_MIN;
	}

	/** How fast a contact must part, given how fast it met: a hard hit bounces, a soft touch only stops. */
	private parting(meeting: number): number {
		return meeting < -BOUNCE_MIN ? -this.bounce * meeting : 0;
	}

	/** The body's contacts with everything still solid: the walls, the floor, the boxes, the screen's corners. */
	private touchWalls(index: number, body: Body): void {
		const inX = this.incoming[2 * index];
		const inY = this.incoming[2 * index + 1];
		const wall = (nx: number, ny: number) => this.contacts.add(index, -1, nx, ny, this.parting(inX * nx + inY * ny), 1);
		if (body.y >= this.height - body.r - CONTACT) wall(0, -1);
		if (body.x <= body.r + CONTACT) wall(1, 0);
		if (body.x >= this.width - body.r - CONTACT) wall(-1, 0);
		if (body.inside && body.y <= body.r + CONTACT) wall(0, 1);
		for (const box of this.solidFor(body)) {
			const core = inner(box);
			const dx = body.x - Math.max(core.left, Math.min(core.right, body.x));
			const dy = body.y - Math.max(core.top, Math.min(core.bottom, body.y));
			const distance = Math.hypot(dx, dy);
			if (distance > 0 && distance <= core.radius + body.r + CONTACT) wall(dx / distance, dy / distance);
		}
		const screen = this.screen;
		if (!screen) return;
		const reach = Math.max(screen.radius, body.r);
		const x = Math.max(screen.left + reach, Math.min(screen.right - reach, body.x));
		const y = Math.max(screen.top + reach, Math.min(screen.bottom - reach, body.y));
		if (x === body.x || y === body.y) return;
		const dx = body.x - x;
		const dy = body.y - y;
		const distance = Math.hypot(dx, dy);
		if (distance > 0 && distance >= reach - body.r - CONTACT) wall(-dx / distance, -dy / distance);
	}

	private pushes(body: Body): boolean {
		const pusher = this.pusher;
		return pusher !== null && !body.passing && Math.hypot(body.x - pusher.x, body.y - pusher.y) < body.r + pusher.r;
	}

	/** Moves a body out of the mouse's ball; as with every move here, Verlet turns the shift into speed. */
	private pushAway(body: Body): void {
		const pusher = this.pusher;
		if (!pusher || !this.pushes(body)) return;
		const dx = body.x - pusher.x;
		const dy = body.y - pusher.y;
		const distance = Math.hypot(dx, dy);
		const min = body.r + pusher.r;
		body.x = pusher.x + (distance ? dx / distance : 0) * min;
		body.y = pusher.y + (distance ? dy / distance : -1) * min;
	}

	/** A tiny sideways offset to either side, so a stack balanced dead centre topples the way a real one would. */
	private nudge(): number {
		this.seed = (this.seed * 16807) % 2147483647;
		return (this.seed / 2147483647 - 0.5) * 2 * NUDGE;
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
		let dx = b.x - a.x;
		if (Math.abs(dx) < ALIGNED && Math.abs(b.y - a.y) < a.r + b.r) dx = this.nudge();
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

/**
 * The step's touching pairs and wall touches, in flat arrays reused from step to step. `b` is -1 for a wall;
 * `share` is how much of a push body `a` takes; `target` is how fast the contact must part along its normal.
 */
class Contacts {
	length = 0;
	a = new Int32Array(256);
	b = new Int32Array(256);
	nx = new Float64Array(256);
	ny = new Float64Array(256);
	target = new Float64Array(256);
	share = new Float64Array(256);

	clear(): void {
		this.length = 0;
	}

	add(a: number, b: number, nx: number, ny: number, target: number, share: number): void {
		if (this.length === this.a.length) this.grow();
		const index = this.length++;
		this.a[index] = a;
		this.b[index] = b;
		this.nx[index] = nx;
		this.ny[index] = ny;
		this.target[index] = target;
		this.share[index] = share;
	}

	private grow(): void {
		const size = this.a.length * 2;
		const grown = <T extends Int32Array | Float64Array>(array: T): T => {
			const next = new (array.constructor as new (size: number) => T)(size);
			next.set(array);
			return next;
		};
		this.a = grown(this.a);
		this.b = grown(this.b);
		this.nx = grown(this.nx);
		this.ny = grown(this.ny);
		this.target = grown(this.target);
		this.share = grown(this.share);
	}
}

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
