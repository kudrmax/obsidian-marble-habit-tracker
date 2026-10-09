export interface Point {
	readonly x: number;
	readonly y: number;
}

export interface BodyInput {
	readonly id: string;
	readonly x: number;
	readonly y: number;
	readonly r: number;
}

export interface Body {
	readonly id: string;
	x: number;
	y: number;
	r: number;
	px: number;
	py: number;
	inside: boolean;
}

export const EARTH: Point = { x: 0, y: 0.45 };

const DAMPING = 0.985;
const PASSES = 6;
const ATTRACTION = 0.22;
const REST_SPEED = 0.05;
const REST_FRAMES = 30;
const GRAVITY_EPSILON = 0.01;

export class JarPhysics {
	private readonly items = new Map<string, Body>();
	private readonly targets = new Map<string, Point>();
	private gravity: Point = EARTH;
	private quietFrames = 0;

	constructor(
		private width: number,
		private height: number,
	) {}

	resize(width: number, height: number): void {
		this.width = width;
		this.height = height;
		this.quietFrames = 0;
	}

	setGravity(gravity: Point): void {
		const changed = Math.abs(gravity.x - this.gravity.x) + Math.abs(gravity.y - this.gravity.y) > GRAVITY_EPSILON;
		this.gravity = gravity;
		if (changed) this.quietFrames = 0;
	}

	add(input: BodyInput): void {
		this.items.set(input.id, { ...input, px: input.x, py: input.y, inside: input.y >= input.r });
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
		const free = [...this.items.values()].filter((body) => !this.targets.has(body.id));
		const before = free.map((body) => Math.hypot(body.x - body.px, body.y - body.py));
		for (let pass = 0; pass < PASSES; pass++) {
			for (let i = 0; i < free.length; i++) {
				for (let j = i + 1; j < free.length; j++) this.separate(free[i], free[j]);
				this.contain(free[i]);
			}
		}
		let fastest = 0;
		let hardest = 0;
		free.forEach((body, index) => {
			const speed = Math.hypot(body.x - body.px, body.y - body.py);
			fastest = Math.max(fastest, speed);
			hardest = Math.max(hardest, before[index] - speed);
		});
		this.quietFrames = fastest < REST_SPEED ? this.quietFrames + 1 : 0;
		return hardest;
	}

	private separate(a: Body, b: Body): void {
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
		if (body.x < body.r) body.x = body.r;
		if (body.x > this.width - body.r) body.x = this.width - body.r;
		if (body.y > this.height - body.r) body.y = this.height - body.r;
		if (!body.inside) {
			body.inside = body.y >= body.r;
			return;
		}
		if (body.y < body.r) body.y = body.r;
	}
}
