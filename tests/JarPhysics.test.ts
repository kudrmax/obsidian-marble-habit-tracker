import { describe, expect, it } from "vitest";
import { JarPhysics, STEPS_PER_SECOND, perStep } from "../src/ui/jar/JarPhysics";

function settle(physics: JarPhysics, limit = 2000): number {
	for (let frame = 1; frame <= limit; frame++) {
		physics.step();
		if (physics.isSettled()) return frame;
	}
	return limit;
}

describe("JarPhysics", () => {
	it("drops a body onto the floor and comes to rest", () => {
		const physics = new JarPhysics(200, 300);
		physics.add({ id: "a", x: 100, y: -20, r: 12 });
		const frames = settle(physics);
		expect(frames).toBeLessThan(2000);
		expect(physics.get("a")?.y).toBeCloseTo(288, 0);
	});

	it("falls freely at 1000 px/s², nothing in the air slowing it", () => {
		const physics = new JarPhysics(200, 2000);
		physics.add({ id: "a", x: 100, y: 0, r: 12 });
		for (let step = 0; step < STEPS_PER_SECOND; step++) physics.step();
		expect(physics.get("a")?.y).toBeCloseTo(500, -1);
	});

	it("keeps bodies inside the walls", () => {
		const physics = new JarPhysics(100, 200);
		physics.add({ id: "a", x: -50, y: 0, r: 10 });
		physics.add({ id: "b", x: 500, y: 0, r: 10 });
		settle(physics);
		for (const body of physics.bodies()) {
			expect(body.x).toBeGreaterThanOrEqual(body.r - 0.01);
			expect(body.x).toBeLessThanOrEqual(100 - body.r + 0.01);
		}
	});

	it("stacks bodies without overlapping", () => {
		const physics = new JarPhysics(60, 300);
		for (let index = 0; index < 6; index++) physics.add({ id: `b${index}`, x: 30, y: -30 - index * 30, r: 12 });
		settle(physics);
		const bodies = physics.bodies();
		for (let i = 0; i < bodies.length; i++) {
			for (let j = i + 1; j < bodies.length; j++) {
				const distance = Math.hypot(bodies[i].x - bodies[j].x, bodies[i].y - bodies[j].y);
				expect(distance).toBeGreaterThan(bodies[i].r + bodies[j].r - 1);
			}
		}
	});

	it("pulls attracted bodies to a point and ignores them in collisions", () => {
		const physics = new JarPhysics(300, 300);
		physics.add({ id: "a", x: 50, y: 288, r: 12 });
		physics.add({ id: "b", x: 250, y: 288, r: 12 });
		physics.attract(["a", "b"], { x: 150, y: 250 });
		for (let frame = 0; frame < 40; frame++) physics.step();
		expect(physics.get("a")?.x).toBeCloseTo(150, 0);
		expect(physics.get("b")?.y).toBeCloseTo(250, 0);
	});

	it("resting bodies follow a new floor", () => {
		const physics = new JarPhysics(200, 300);
		physics.add({ id: "a", x: 100, y: 288, r: 12 });
		physics.resize(200, 200);
		settle(physics);
		expect(physics.get("a")?.y).toBeCloseTo(188, 0);
	});

	it("rolls bodies towards a sideways gravity", () => {
		const physics = new JarPhysics(300, 200);
		physics.add({ id: "a", x: 50, y: 188, r: 12 });
		physics.setGravity({ x: 0.45, y: 0 });
		settle(physics);
		expect(physics.get("a")?.x).toBeCloseTo(288, 0);
	});

	it("keeps bodies under the lid once they are inside", () => {
		const physics = new JarPhysics(200, 300);
		physics.add({ id: "a", x: 100, y: 200, r: 12 });
		physics.setGravity({ x: 0, y: -0.45 });
		settle(physics);
		expect(physics.get("a")?.y).toBeCloseTo(12, 0);
	});

	it("lets bodies fall in from above the lid", () => {
		const physics = new JarPhysics(200, 300);
		physics.add({ id: "a", x: 100, y: -100, r: 12 });
		physics.step();
		expect(physics.get("a")?.y).toBeLessThan(0);
	});

	it("wakes up when gravity changes", () => {
		const physics = new JarPhysics(200, 300);
		physics.add({ id: "a", x: 100, y: 288, r: 12 });
		settle(physics);
		expect(physics.isSettled()).toBe(true);
		physics.setGravity({ x: 0.3, y: 0.3 });
		expect(physics.isSettled()).toBe(false);
	});

	it("reports how hard a body hit something", () => {
		const physics = new JarPhysics(200, 300);
		physics.add({ id: "a", x: 100, y: 0, r: 12 });
		let hardest = 0;
		for (let frame = 0; frame < 120; frame++) hardest = Math.max(hardest, physics.step());
		expect(hardest).toBeGreaterThan(5);
		settle(physics);
		expect(physics.step()).toBeLessThan(0.5);
	});

	it("removes bodies", () => {
		const physics = new JarPhysics(200, 300);
		physics.add({ id: "a", x: 100, y: 0, r: 12 });
		physics.remove("a");
		expect(physics.bodies()).toHaveLength(0);
	});

	it("lets a passing body through others until it is clear", () => {
		const physics = new JarPhysics(200, 300);
		physics.add({ id: "pile", x: 100, y: 288, r: 12 });
		physics.add({ id: "new", x: 100, y: 280, r: 12, passing: true });
		physics.step();
		expect(physics.get("pile")?.x).toBeCloseTo(100, 3);
		expect(physics.get("new")?.passing).toBe(true);
		physics.remove("pile");
		physics.step();
		expect(physics.get("new")?.passing).toBe(false);
	});

	it("releases a held body with a kick against gravity", () => {
		const physics = new JarPhysics(200, 300);
		physics.add({ id: "a", x: 100, y: 150, r: 12 });
		physics.attract(["a"], { x: 100, y: 150 });
		for (let frame = 0; frame < 10; frame++) physics.step();
		expect(physics.get("a")?.y).toBeCloseTo(150, 3);
		physics.release(["a"], 6);
		physics.step();
		expect(physics.get("a")?.y).toBeLessThan(150);
	});

	it("rests on a box and rolls off its ends", () => {
		const physics = new JarPhysics(400, 300);
		physics.setObstacles([{ left: 80, top: 230, right: 320, bottom: 270, radius: 20 }]);
		physics.add({ id: "on", x: 200, y: 0, r: 12 });
		physics.add({ id: "beside", x: 30, y: 0, r: 12 });
		settle(physics);
		expect(physics.get("on")?.y).toBeCloseTo(218, 0);
		expect(physics.get("beside")?.y).toBeCloseTo(288, 0);
	});

	it("pushes a body out of a box it ended up inside", () => {
		const physics = new JarPhysics(400, 300);
		physics.add({ id: "a", x: 200, y: 105, r: 12 });
		physics.setObstacles([{ left: 100, top: 100, right: 300, bottom: 140, radius: 4 }]);
		physics.step();
		expect(physics.get("a")?.y).toBeLessThanOrEqual(88.5);
	});

	it("lets a passing body through boxes until it is clear", () => {
		const physics = new JarPhysics(400, 300);
		physics.setObstacles([{ left: 100, top: 100, right: 300, bottom: 140, radius: 4 }]);
		physics.add({ id: "a", x: 200, y: 120, r: 12, passing: true });
		physics.step();
		expect(physics.get("a")?.passing).toBe(true);
		for (let frame = 0; frame < 60; frame++) physics.step();
		expect(physics.get("a")?.passing).toBe(false);
		expect(physics.get("a")?.y).toBeGreaterThan(140);
	});

	it("moves a body that does not fit under a shelf out from beneath it", () => {
		const physics = new JarPhysics(400, 300);
		physics.setObstacles([{ left: 60, top: 230, right: 340, bottom: 270, radius: 20 }]);
		physics.add({ id: "big", x: 120, y: 280, r: 22 });
		settle(physics);
		const big = physics.get("big");
		expect(big!.x <= 60 - 22 || big!.x >= 340 + 22 || big!.y <= 230 - 22).toBe(true);
	});

	it("lets a body too big to pass under a shelf lie on the floor beside it, not under its end", () => {
		const physics = new JarPhysics(400, 300);
		physics.setObstacles([{ left: 50, top: 230, right: 350, bottom: 270, radius: 20 }]);
		physics.add({ id: "medium", x: 30, y: 0, r: 22 });
		settle(physics);
		const medium = physics.get("medium");
		expect(medium?.y).toBeCloseTo(278, 0);
		expect(medium?.x).toBeLessThanOrEqual(28);
	});

	it("settles a pile around a floating shelf instead of jittering at its ends", () => {
		for (let run = 0; run < 10; run++) {
			let seed = run * 9301 + 49297;
			const random = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
			const physics = new JarPhysics(402, 874);
			physics.setObstacles([{ left: 44, top: 795, right: 358, bottom: 837, radius: 21 }]);
			for (let index = 0; index < 30; index++) {
				const r = [12, 22, 34][Math.floor(random() * 3)];
				physics.add({ id: String(index), x: r + random() * (402 - 2 * r), y: -r - index * 18, r });
			}
			let frames = 0;
			while (!physics.isSettled() && frames < 8000) {
				physics.step();
				frames++;
			}
			expect(physics.isSettled()).toBe(true);
		}
	});

	it("lets a small body rest under a shelf", () => {
		const physics = new JarPhysics(400, 300);
		physics.setObstacles([{ left: 60, top: 230, right: 340, bottom: 270, radius: 20 }]);
		physics.add({ id: "small", x: 200, y: 288, r: 12 });
		settle(physics);
		expect(physics.get("small")?.x).toBeCloseTo(200, 0);
	});

	it("doesn't balance marbles dropped one by one on the same spot into a tower", () => {
		const physics = new JarPhysics(400, 300);
		for (const id of ["a", "b", "c"]) {
			physics.add({ id, x: 200, y: 100, r: 12 });
			settle(physics);
		}
		const floor = physics.bodies().filter((body) => body.y > 287);
		expect(floor.length).toBe(3);
	});

	it("lets the mouse's ball push a resting body away and wakes the bodies only when it touches one", () => {
		const physics = new JarPhysics(400, 300);
		physics.add({ id: "a", x: 200, y: 288, r: 12 });
		settle(physics);
		physics.setPusher({ x: 100, y: 288, r: 18 });
		expect(physics.isSettled()).toBe(true);
		physics.setPusher({ x: 190, y: 288, r: 18 });
		expect(physics.isSettled()).toBe(false);
		settle(physics);
		expect(Math.hypot(physics.get("a")!.x - 190, physics.get("a")!.y - 288)).toBeGreaterThanOrEqual(30 - 0.5);
		physics.setPusher(null);
		settle(physics);
		expect(physics.get("a")?.y).toBeCloseTo(288, 0);
	});

	it("keeps bodies inside the screen's rounded corners", () => {
		const physics = new JarPhysics(400, 300);
		physics.setScreen({ left: 0, top: -100, right: 400, bottom: 300, radius: 60 });
		physics.setGravity({ x: -0.3, y: 0.3 });
		physics.add({ id: "corner", x: 100, y: 12, r: 12 });
		settle(physics);
		const corner = physics.get("corner")!;
		expect(Math.hypot(corner.x - 60, corner.y - 240)).toBeCloseTo(48, 0);
		expect(corner.x).toBeCloseTo(60 - 48 / Math.SQRT2, 0);
	});

	it("leaves the corners alone for a body as round as them", () => {
		const physics = new JarPhysics(400, 300);
		physics.setScreen({ left: 0, top: 0, right: 400, bottom: 300, radius: 10 });
		physics.setGravity({ x: -0.3, y: 0.3 });
		physics.add({ id: "a", x: 100, y: 22, r: 22 });
		settle(physics);
		expect(physics.get("a")?.x).toBeCloseTo(22, 0);
		expect(physics.get("a")?.y).toBeCloseTo(278, 0);
	});

	it("lets falling bodies pass through ledges and landed ones bounce off them", () => {
		const physics = new JarPhysics(200, 300);
		physics.setLedges([{ left: 0, top: 100, right: 200, bottom: 120, radius: 4 }]);
		physics.add({ id: "a", x: 100, y: 0, r: 12 });
		settle(physics);
		const a = physics.get("a");
		expect(a?.y).toBeCloseTo(288, 0);
		expect(a?.landed).toBe(true);
		physics.setGravity({ x: 0, y: -0.45 });
		settle(physics);
		expect(physics.get("a")?.y).toBeCloseTo(132, 0);
	});

	it("does not land a body while it is inside a ledge", () => {
		const physics = new JarPhysics(200, 300);
		physics.setLedges([{ left: 0, top: 270, right: 200, bottom: 300, radius: 0 }]);
		physics.add({ id: "a", x: 100, y: 288, r: 12 });
		physics.step();
		expect(physics.get("a")?.landed).toBe(false);
	});


	it("carries a body up on a rising box, and lets it hop only a little when the box stops", () => {
		const physics = new JarPhysics(400, 800);
		let top = 700;
		const floor = () => physics.setObstacles([{ left: 0, top, right: 400, bottom: 800, radius: 0 }]);
		floor();
		physics.add({ id: "a", x: 200, y: 600, r: 12 });
		settle(physics);
		expect(physics.get("a")?.y).toBeCloseTo(top - 12, 0);
		// The box jumps up fast, as a flicked tray does, then stops.
		for (let frame = 0; frame < 15; frame++) {
			top -= 10;
			floor();
			physics.step();
			expect(physics.get("a")?.y ?? 0).toBeLessThanOrEqual(top - 12 + 0.01);
		}
		let highest = Infinity;
		for (let frame = 0; frame < 400; frame++) {
			physics.step();
			highest = Math.min(highest, physics.get("a")?.y ?? 0);
		}
		expect(top - 12 - highest).toBeGreaterThan(5);
		expect(top - 12 - highest).toBeLessThan(60);
		expect(physics.get("a")?.y).toBeCloseTo(top - 12, 0);
	});

	it("steps a full jar quickly", () => {
		const fullJar = () => {
			const physics = new JarPhysics(390, 760);
			for (let index = 0; index < 250; index++) physics.add({ id: `b${index}`, x: 12 + (index * 37) % 366, y: 748 - Math.floor(index / 15) * 24, r: 12 });
			return physics;
		};
		const perFrame = () => {
			const physics = fullJar();
			const started = performance.now();
			for (let frame = 0; frame < 120; frame++) physics.step();
			return (performance.now() - started) / 120;
		};
		// The first run pays for compiling the code, and any run can be held up by whatever else the machine is doing;
		// the best of a few runs from the same jar is the speed of the stepping itself.
		perFrame();
		const best = Math.min(...Array.from({ length: 5 }, perFrame));
		expect(best).toBeLessThan(4);
	});

	it("wakes a resting pile when the phone tilts slowly, a hair at a time", () => {
		const physics = new JarPhysics(400, 300);
		for (let index = 0; index < 10; index++) physics.add({ id: `b${index}`, x: 30 + index * 34, y: 280, r: 16 });
		settle(physics, 5000);
		expect(physics.isSettled()).toBe(true);
		const pull = perStep(1000);
		for (let degree = 0; degree <= 30; degree += 0.5) {
			const angle = (degree * Math.PI) / 180;
			physics.setGravity({ x: Math.sin(angle) * pull, y: Math.cos(angle) * pull });
			if (physics.isSettled()) continue;
			physics.step();
		}
		expect(physics.isSettled()).toBe(false);
	});

	describe("friction and rolling", () => {
		it("lets touching marbles fly apart instead of sticking together", () => {
			const physics = new JarPhysics(800, 800);
			physics.setGravity({ x: 0, y: 0 });
			physics.add({ id: "a", x: 380, y: 400, r: 20 });
			physics.add({ id: "b", x: 420, y: 400, r: 20 });
			physics.get("a")!.px = 380.1;
			physics.get("b")!.px = 419.9;
			for (let step = 0; step < 100; step++) physics.step();
			const a = physics.get("a")!;
			const b = physics.get("b")!;
			expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(40 + 15);
		});

		it("lets a cluster thrown sideways fall apart, not fly as one piece", () => {
			const physics = new JarPhysics(2000, 2000);
			for (let index = 0; index < 4; index++) physics.add({ id: `m${index}`, x: 100 + index * 30, y: 1000, r: 15 });
			for (const body of physics.bodies()) body.px = body.x - 2;
			physics.get("m3")!.px = 190 - 2.3;
			for (let step = 0; step < 120; step++) physics.step();
			const xs = physics.bodies().map((body) => body.x).sort((a, b) => a - b);
			expect(xs[3] - xs[2]).toBeGreaterThan(30 + 20);
		});

		it("a marble sliding along the floor starts to roll and rolls on at 5/7 of its speed", () => {
			const physics = new JarPhysics(4000, 300);
			physics.add({ id: "a", x: 100, y: 288, r: 12 });
			physics.get("a")!.px = 100 - 3;
			for (let step = 0; step < 240; step++) physics.step();
			const a = physics.get("a")!;
			expect(a.x - a.px).toBeCloseTo((3 * 5) / 7, 1);
			expect(a.spin * a.r).toBeCloseTo(a.x - a.px, 1);
		});

		it("a marble balanced on another rolls off it instead of standing in a column", () => {
			const physics = new JarPhysics(400, 300);
			physics.add({ id: "low", x: 200, y: 288, r: 12 });
			physics.add({ id: "high", x: 200.5, y: 264, r: 12 });
			for (let step = 0; step < 600; step++) physics.step();
			expect(physics.get("high")!.y).toBeCloseTo(288, 0);
		});

		it("never stacks a pile into columns: no marble balances on the one right under it with nothing beside it", () => {
			const physics = new JarPhysics(402, 700);
			for (let index = 0; index < 120; index++) physics.add({ id: `b${index}`, x: 15 + ((index * 53) % 372), y: -20 - index * 18, r: 6 + (index % 3) * 8 });
			settle(physics, 20000);
			const bodies = physics.bodies();
			for (const body of bodies) {
				if (body.y > 700 - body.r - 1 || body.x < body.r + 1 || body.x > 402 - body.r - 1) continue;
				const touching = bodies.filter((other) => other !== body && Math.hypot(other.x - body.x, other.y - body.y) < body.r + other.r + 0.5);
				const beside = touching.filter((other) => Math.abs(other.x - body.x) >= 1);
				const under = touching.find((other) => other.y > body.y && Math.abs(other.x - body.x) < 1);
				expect(under !== undefined && beside.length === 0, `${body.id} balances on ${under?.id}`).toBe(false);
			}
		});

		it("doesn't fall asleep while a column against the wall is still toppling", () => {
			const physics = new JarPhysics(402, 874);
			for (let level = 0; level < 5; level++) {
				physics.add({ id: `wall${level}`, x: 387, y: 859 - level * 30, r: 15 });
				physics.add({ id: `next${level}`, x: 357, y: 859 - level * 30, r: 15 });
			}
			settle(physics, 20000);
			expect(Math.min(...physics.bodies().map((body) => body.y))).toBeGreaterThan(859 - 2 * 30);
		});
	});

	describe("bounce", () => {
		/** Drops a body from high up and returns how high it rises again after its first hit, in px above the floor. */
		function rebound(bounce: number): number {
			const physics = new JarPhysics(200, 600);
			physics.setBounce(bounce);
			physics.add({ id: "a", x: 100, y: 12, r: 12 });
			let falling = true;
			let lowest = 0;
			let highest = Infinity;
			for (let frame = 0; frame < 400; frame++) {
				const before = physics.get("a")!.y;
				physics.step();
				const y = physics.get("a")!.y;
				if (falling && y < before) falling = false;
				if (falling) lowest = y;
				else if (y > before) break;
				else highest = Math.min(highest, y);
			}
			return highest === Infinity ? 0 : lowest - highest;
		}

		/** Drops a body from 300 px above the top of whatever it lands on and returns how high it rises again, in px. */
		function riseAfterHit(bounce: number, onto: "floor" | "marble" | "pile"): number {
			const physics = new JarPhysics(200, 600);
			physics.setBounce(bounce);
			if (onto === "marble") physics.add({ id: "rest", x: 100, y: 588, r: 12 });
			if (onto === "pile") {
				for (let index = 0; index < 24; index++) physics.add({ id: `rest${index}`, x: 12 + ((index * 53) % 176), y: -30 * index, r: 12 });
				physics.setBounce(0);
				settle(physics, 5000);
				physics.setBounce(bounce);
			}
			const summit = physics.bodies().reduce((top, body) => (body.y < top.y ? body : top), { x: 100, y: 612 });
			physics.add({ id: "a", x: summit.x, y: summit.y - 24 - 300, r: 12 });
			let lowest = 0;
			let rising = false;
			let highest = Infinity;
			for (let frame = 0; frame < 400; frame++) {
				const before = physics.get("a")!.y;
				physics.step();
				const y = physics.get("a")!.y;
				if (!rising && y < before) rising = true;
				if (!rising) lowest = y;
				else if (y > before) break;
				else highest = Math.min(highest, y);
			}
			return highest === Infinity ? 0 : lowest - highest;
		}

		it("bounces off a marble lying on the floor about as high as off the floor itself", () => {
			const floor = riseAfterHit(0.5, "floor");
			expect(riseAfterHit(0.5, "marble")).toBeGreaterThan(floor * 0.7);
		});

		it("bounces off the top of a pile about as high as off the floor itself", () => {
			const floor = riseAfterHit(0.5, "floor");
			expect(riseAfterHit(0.5, "pile")).toBeGreaterThan(floor * 0.7);
		});

		it("lands dead with no bounce", () => {
			expect(rebound(0)).toBe(0);
		});

		it("comes back up off the floor, higher the bouncier it is", () => {
			const soft = rebound(0.3);
			const hard = rebound(0.7);
			expect(soft).toBeGreaterThan(10);
			expect(hard).toBeGreaterThan(soft * 2);
			expect(hard).toBeLessThan(588);
		});

		it("still comes to rest on the floor, even at the bounciest, within the time its bounces take", () => {
			const physics = new JarPhysics(200, 600);
			physics.setBounce(0.95);
			physics.add({ id: "a", x: 100, y: 12, r: 12 });
			const hit = Math.sqrt(2 * perStep(1000) * 576);
			const bouncing = (2 * hit) / perStep(1000) / (1 - 0.95);
			expect(settle(physics, 2 * bouncing)).toBeLessThan(2 * bouncing);
			expect(physics.get("a")?.y).toBeCloseTo(588, 0);
		});

		it("lets a pile settle instead of trembling, even at the bounciest", () => {
			const physics = new JarPhysics(120, 400);
			physics.setBounce(0.95);
			for (let index = 0; index < 30; index++) physics.add({ id: `b${index}`, x: 15 + ((index * 37) % 90), y: -20 - index * 25, r: 6 + (index % 3) * 6 });
			expect(settle(physics, 5000)).toBeLessThan(5000);
		});

		it("never gains energy in a crowded jar, so every pile comes to rest", () => {
			for (const [width, count, spread] of [[400, 120, 53], [400, 60, 71], [200, 80, 29], [402, 200, 61]]) {
				const physics = new JarPhysics(width, 700);
				physics.setBounce(0.95);
				for (let index = 0; index < count; index++) physics.add({ id: `b${index}`, x: 15 + ((index * spread) % (width - 30)), y: -20 - index * 18, r: 6 + (index % 3) * 8 });
				expect(settle(physics, 3000)).toBeLessThan(3000);
			}
		});

		it("knocks a resting body away when another one hits it", () => {
			const still = new JarPhysics(400, 300);
			const bouncy = new JarPhysics(400, 300);
			bouncy.setBounce(0.8);
			for (const physics of [still, bouncy]) {
				physics.setGravity({ x: 0, y: 0 });
				physics.add({ id: "a", x: 100, y: 150, r: 12 });
				physics.add({ id: "b", x: 200, y: 150, r: 12 });
				physics.get("a")!.px = 95;
				for (let frame = 0; frame < 40; frame++) physics.step();
			}
			expect(bouncy.get("a")!.x).toBeLessThan(still.get("a")!.x);
		});
	});
});
