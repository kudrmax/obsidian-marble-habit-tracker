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
	/** How fast it turns, in radians per step, clockwise on screen. Friction turns it; turning, it rolls. */
	spin: number;
	/** Which way, -1 or 1, the body tips when balanced dead on top of another: no marble is perfectly round. */
	lean: number;
}

/** A solid rounded rectangle the bodies bounce off. */
export interface Box {
	readonly left: number;
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
	readonly radius: number;
}

/** Physics advances in steps of 1/120 s; speeds are in px per step, accelerations in px per step². */
export const STEPS_PER_SECOND = 120;

/** Converts an acceleration in px/s² into px per step². */
export function perStep(pxPerSecondSquared: number): number {
	return pxPerSecondSquared / (STEPS_PER_SECOND * STEPS_PER_SECOND);
}

/** The pull marbles fall with by default: 1000 px/s², as iOS's UIKit Dynamics, straight down. */
export const EARTH: Point = { x: 0, y: perStep(1000) };

/** Friction between marbles, and between a marble and the floor or walls: low, as for polished glass, so they roll off one another. */
const FRICTION = 0.1;
/** A solid ball's moment of inertia is 2/5 m r²: per unit of mass and radius², how hard it is to set turning. */
const INERTIA = 2 / 5;
const PASSES = 6;
const ATTRACTION = 0.22;
const REST_SPEED = 0.05;
/**
 * How long everything must stay still before the jar sleeps, in units of the time a marble balanced on another takes to
 * start toppling, √(r/g). Under weak gravity a balanced marble topples slowly, so the jar must wait longer for it.
 */
const REST_TOPPLES = 12;
/** The radius that topple time is reckoned for: a medium marble. */
const REST_RADIUS = 22;
/** Never sleep sooner than this many steps. */
const REST_STEPS = 30;
/** A change of gravity smaller than this share of it doesn't wake resting bodies. */
const GRAVITY_EPSILON = 0.02;
const CONTACT = 1;
/** A body within this many px of straight above another counts as balanced on it; see `tip`. */
const ALIGNED = 0.5;
/**
 * How high, in px, a body may hop off a box that rose under it and stopped, as a flicked tray does. A fast box would
 * otherwise throw the marbles across the screen; so a lift in a step is capped at the speed that hops this high.
 */
const MAX_HOP = 40;
/** Hits slower than this, in px per step, don't bounce, so a resting pile stays at rest instead of trembling. */
const BOUNCE_MIN = 1.2;
/** A hit counts as from above when it comes within 60° of the pull of gravity. */
const SUPPORTED = 0.5;

export class JarPhysics {
	private readonly items = new Map<string, Body>();
	private readonly targets = new Map<string, Point>();
	private gravity: Point = EARTH;
	/** The gravity the bodies last moved under. */
	private movedUnder: Point = EARTH;
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
	/** Each body's speed after the collisions, before the bounce. */
	private stopped = new Float64Array(128);
	private readonly contacts = new Contacts();
	/** The share of a hit's speed a body keeps as it bounces back: 0 lands dead, 1 bounces as high as it fell. */
	private bounce = 0;
	private quietFrames = 0;
	/** A solid ball the mouse moves around; bodies it touches are pushed away. */
	private pusher: { x: number; y: number; r: number } | null = null;
	/** Drives each body's lean. */
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

	/** Wakes the bodies once gravity has turned away from the one they last moved under, however slowly it turned. */
	setGravity(gravity: Point): void {
		this.gravity = gravity;
		const before = this.movedUnder;
		const size = Math.max(Math.hypot(gravity.x, gravity.y), Math.hypot(before.x, before.y), Number.EPSILON);
		if (Math.hypot(gravity.x - before.x, gravity.y - before.y) <= GRAVITY_EPSILON * size) return;
		this.quietFrames = 0;
		this.movedUnder = gravity;
	}

	add(input: BodyInput): void {
		this.items.set(input.id, { ...input, px: input.x, py: input.y, inside: input.y >= input.r, passing: input.passing ?? false, landed: false, spin: 0, lean: this.random() < 0.5 ? -1 : 1 });
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

	/** Lets attracted bodies go, thrown against gravity at `kick` px per step. */
	release(ids: readonly string[], kick = 0): void {
		const pull = Math.hypot(this.gravity.x, this.gravity.y);
		const upX = pull > 0 ? -this.gravity.x / pull : 0;
		const upY = pull > 0 ? -this.gravity.y / pull : -1;
		for (const id of ids) {
			const body = this.items.get(id);
			if (!body || !this.targets.delete(id)) continue;
			body.px = body.x - upX * kick;
			body.py = body.y - upY * kick;
		}
		this.quietFrames = 0;
	}

	isSettled(): boolean {
		const pull = Math.hypot(this.gravity.x, this.gravity.y);
		const topple = pull > 0 ? Math.sqrt(REST_RADIUS / pull) : 0;
		return this.targets.size === 0 && this.quietFrames >= Math.max(REST_STEPS, REST_TOPPLES * topple);
	}

	/** Advances one frame and returns the hardest hit: the most speed any body lost to a wall or a neighbour. */
	step(): number {
		for (const body of this.items.values()) {
			const target = this.targets.get(body.id);
			const vx = body.x - body.px + this.gravity.x;
			const vy = body.y - body.py + this.gravity.y;
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
			this.stopped = new Float64Array(free.length * 4);
		}
		const before = this.before;
		const incoming = this.incoming;
		for (let i = 0; i < free.length; i++) {
			incoming[2 * i] = free[i].x - free[i].px;
			incoming[2 * i + 1] = free[i].y - free[i].py;
			before[i] = Math.hypot(incoming[2 * i], incoming[2 * i + 1]);
		}
		if (this.pusher) for (const body of free) this.pushAway(body);
		this.tipBalanced(free);
		for (let pass = 0; pass < PASSES; pass++) {
			for (let i = 0; i < free.length; i++) {
				for (let j = i + 1; j < free.length; j++) this.separate(free[i], free[j]);
				this.contain(free[i]);
			}
		}
		const maxLift = Math.sqrt(2 * Math.hypot(this.gravity.x, this.gravity.y) * MAX_HOP);
		for (let i = 0; i < free.length; i++) {
			const lift = Math.min(-maxLift, incoming[2 * i + 1]);
			if (free[i].y - free[i].py < lift) free[i].py = free[i].y - lift;
		}
		this.resolveSpeeds(free);
		let hardest = 0;
		for (let i = 0; i < free.length; i++) hardest = Math.max(hardest, before[i] - Math.hypot(free[i].x - free[i].px, free[i].y - free[i].py));
		for (const body of free) {
			if (body.passing) body.passing = free.some((other) => other !== body && overlaps(body, other)) || this.shapesFor(body).obstacles.some((box) => touches(body, box));
		}
		for (const body of free) if (!body.landed && !body.passing) body.landed = this.lands(body, free);
		let fastest = 0;
		for (const body of free) fastest = Math.max(fastest, Math.hypot(body.x - body.px, body.y - body.py));
		this.quietFrames = fastest < REST_SPEED ? this.quietFrames + 1 : 0;
		if (this.quietFrames === 0) this.movedUnder = this.gravity;
		return hardest;
	}

	/**
	 * The collisions above move bodies apart, and Verlet turns every such move into speed: two marbles pressed together
	 * fly apart a little, though nothing in the world pushed them. Here, as in XPBD, each contact's speed along its normal
	 * is set to what the hit calls for instead: `bounce` of the speed they met with before the step began for a hard hit,
	 * and nothing at all for a soft touch, so a resting pile neither trembles nor gains energy. Only contacts that were
	 * closing count: two marbles drifting apart are let go, never held together.
	 */
	private resolveSpeeds(free: readonly Body[]): void {
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
				if (closing < 0) contacts.add(i, j, nx, ny, closing, this.parting(closing), this.shareOf(body, other, i, j, nx, ny), true);
			}
		}
		const stopped = this.stopped;
		for (let i = 0; i < free.length; i++) {
			stopped[2 * i] = free[i].x - free[i].px;
			stopped[2 * i + 1] = free[i].y - free[i].py;
		}
		for (let pass = 0; pass < PASSES; pass++) {
			for (let c = 0; c < contacts.length; c++) {
				const a = free[contacts.a[c]];
				const nx = contacts.nx[c];
				const ny = contacts.ny[c];
				const j = contacts.b[c];
				if (j < 0) {
					const gain = contacts.target[c] - ((a.x - a.px) * nx + (a.y - a.py) * ny);
					if (gain <= 0 && !contacts.exact[c]) continue;
					a.px -= nx * gain;
					a.py -= ny * gain;
					continue;
				}
				const b = free[j];
				const gain = contacts.target[c] - ((b.x - b.px - (a.x - a.px)) * nx + (b.y - b.py - (a.y - a.py)) * ny);
				const shareA = contacts.share[c];
				a.px += nx * gain * shareA;
				a.py += ny * gain * shareA;
				b.px -= nx * gain * (1 - shareA);
				b.py -= ny * gain * (1 - shareA);
			}
		}
		this.rub(free);
		this.conserve(free);
	}

	/**
	 * Friction at each contact, by Coulomb's law, on balls that turn. Where the two surfaces slide past each other at the
	 * contact point, friction pushes them along it and sets both turning, until they roll on each other instead of
	 * sliding, or until it reaches its limit: the friction coefficient times how hard they pressed together. So a marble
	 * landing at a slant starts to spin and rolls on, one balanced on top of another rolls off, and a resting pile grips.
	 */
	private rub(free: readonly Body[]): void {
		const contacts = this.contacts;
		for (let c = 0; c < contacts.length; c++) {
			const a = free[contacts.a[c]];
			const j = contacts.b[c];
			const b = j < 0 ? null : free[j];
			const press = Math.max(0, -contacts.meeting[c]) + contacts.target[c];
			if (press <= 0) continue;
			const tx = -contacts.ny[c];
			const ty = contacts.nx[c];
			// A wall's normal points into the body, a pair's from a to b: a touches a wall on its far side.
			const side = b ? 1 : -1;
			const surfaceA = (a.x - a.px) * tx + (a.y - a.py) * ty + side * a.spin * a.r;
			const surfaceB = b ? (b.x - b.px) * tx + (b.y - b.py) * ty - b.spin * b.r : 0;
			const slip = surfaceB - surfaceA;
			if (slip === 0) continue;
			const inverseA = 1 / (a.r * a.r);
			const inverseB = b ? 1 / (b.r * b.r) : 0;
			const turning = 1 + 1 / INERTIA;
			const stop = slip / (turning * (inverseA + inverseB));
			const limit = (FRICTION * press) / (inverseA + inverseB);
			const push = Math.max(-limit, Math.min(limit, stop));
			a.px -= tx * push * inverseA;
			a.py -= ty * push * inverseA;
			a.spin += (side * push * inverseA) / (INERTIA * a.r);
			if (!b) continue;
			b.px += tx * push * inverseB;
			b.py += ty * push * inverseB;
			b.spin += (push * inverseB) / (INERTIA * b.r);
		}
	}

	/**
	 * A bounce gives back speed, it never adds any: the bodies leave the step with no more energy than they came in with.
	 * A body wedged between two others, or against a wall, can't meet every contact's demand to part; pushed back and
	 * forth between them it would gain speed with every pass, and a jammed pile would start to shake by itself.
	 * Then all the bounce's changes are scaled down just enough.
	 */
	private conserve(free: readonly Body[]): void {
		const incoming = this.incoming;
		const stopped = this.stopped;
		let before = 0;
		let start = 0;
		let a = 0;
		let b = 0;
		for (let i = 0; i < free.length; i++) {
			const mass = free[i].r * free[i].r;
			const sx = stopped[2 * i];
			const sy = stopped[2 * i + 1];
			const dx = free[i].x - free[i].px - sx;
			const dy = free[i].y - free[i].py - sy;
			before += mass * (incoming[2 * i] ** 2 + incoming[2 * i + 1] ** 2);
			start += mass * (sx * sx + sy * sy);
			a += mass * (dx * dx + dy * dy);
			b += 2 * mass * (sx * dx + sy * dy);
		}
		const limit = Math.max(before, start);
		if (a === 0 || start + a + b <= limit) return;
		const scale = Math.max(0, (-b + Math.sqrt(Math.max(0, b * b - 4 * a * (start - limit)))) / (2 * a));
		for (let i = 0; i < free.length; i++) {
			const body = free[i];
			body.px = body.x - stopped[2 * i] - (body.x - body.px - stopped[2 * i]) * scale;
			body.py = body.y - stopped[2 * i + 1] - (body.y - body.py - stopped[2 * i + 1]) * scale;
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

	/** How fast a contact parts, given how fast it met: 0 for a soft touch, which doesn't bounce. */
	private parting(meeting: number): number {
		return meeting < -BOUNCE_MIN ? -this.bounce * meeting : 0;
	}

	/** The body's touches with everything still solid: the walls, the floor, the boxes, the screen's corners. */
	private touchWalls(index: number, body: Body): void {
		const inX = this.incoming[2 * index];
		const inY = this.incoming[2 * index + 1];
		const wall = (nx: number, ny: number, exact = true) => {
			const meeting = inX * nx + inY * ny;
			if (meeting < 0) this.contacts.add(index, -1, nx, ny, meeting, this.parting(meeting), 1, exact);
		};
		if (body.y >= this.height - body.r - CONTACT) wall(0, -1);
		if (body.x <= body.r + CONTACT) wall(1, 0);
		if (body.x >= this.width - body.r - CONTACT) wall(-1, 0);
		if (body.inside && body.y <= body.r + CONTACT) wall(0, 1);
		for (const box of this.solidFor(body)) {
			const core = inner(box);
			const dx = body.x - Math.max(core.left, Math.min(core.right, body.x));
			const dy = body.y - Math.max(core.top, Math.min(core.bottom, body.y));
			const distance = Math.hypot(dx, dy);
			if (distance > 0 && distance <= core.radius + body.r + CONTACT) wall(dx / distance, dy / distance, false);
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

	/**
	 * A body balanced dead on top of exactly one other rests `ALIGNED` px off centre, as an imperfect marble would: from
	 * there gravity tips it over, as it would tip a real one. It leans its own way, or the other way when a neighbour or a
	 * wall stands on that side; held on both sides, it stays. It is moved together with its previous place, so it gains
	 * no speed.
	 */
	private tipBalanced(free: readonly Body[]): void {
		for (const upper of free) {
			if (upper.passing) continue;
			let lower: Body | null = null;
			let supports = 0;
			let left = upper.x <= upper.r + CONTACT;
			let right = upper.x >= this.width - upper.r - CONTACT;
			for (const other of free) {
				if (other === upper || other.passing) continue;
				const dx = other.x - upper.x;
				const dy = other.y - upper.y;
				const reach = upper.r + other.r + CONTACT;
				if (dx * dx + dy * dy > reach * reach) continue;
				if (dy > reach / 2) {
					supports++;
					if (Math.abs(dx) < ALIGNED) lower = other;
				} else if (dx < 0) left = true;
				else right = true;
			}
			if (!lower || supports !== 1 || (left && right)) continue;
			const lean = left ? 1 : right ? -1 : upper.lean;
			const x = lower.x + lean * ALIGNED;
			upper.px += x - upper.x;
			upper.x = x;
		}
	}

	/** 0 to 1; fixed so that a run can be replayed. */
	private random(): number {
		this.seed = (this.seed * 16807) % 2147483647;
		return this.seed / 2147483647;
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

/**
 * The step's touching pairs and wall touches, in flat arrays reused from step to step. `b` is -1 for a wall;
 * `meeting` is how fast the two came together along the normal before the step (negative when closing), `target` how
 * fast they part after it, `share` how much of a push body `a` takes. An `exact`
 * contact parts at exactly that speed; the rest — boxes, which move with the screen and may carry bodies — at least.
 */
class Contacts {
	length = 0;
	a = new Int32Array(256);
	b = new Int32Array(256);
	nx = new Float64Array(256);
	ny = new Float64Array(256);
	meeting = new Float64Array(256);
	target = new Float64Array(256);
	share = new Float64Array(256);
	exact = new Uint8Array(256);

	clear(): void {
		this.length = 0;
	}

	add(a: number, b: number, nx: number, ny: number, meeting: number, target: number, share: number, exact: boolean): void {
		if (this.length === this.a.length) this.grow();
		const index = this.length++;
		this.a[index] = a;
		this.b[index] = b;
		this.nx[index] = nx;
		this.ny[index] = ny;
		this.meeting[index] = meeting;
		this.target[index] = target;
		this.share[index] = share;
		this.exact[index] = exact ? 1 : 0;
	}

	private grow(): void {
		const size = this.a.length * 2;
		const grown = <T extends Int32Array | Float64Array | Uint8Array>(array: T): T => {
			const next = new (array.constructor as new (size: number) => T)(size);
			next.set(array);
			return next;
		};
		this.a = grown(this.a);
		this.b = grown(this.b);
		this.nx = grown(this.nx);
		this.ny = grown(this.ny);
		this.meeting = grown(this.meeting);
		this.target = grown(this.target);
		this.share = grown(this.share);
		this.exact = grown(this.exact);
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
