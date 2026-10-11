import { describe, expect, it } from "vitest";
import { JarPhysics } from "../src/ui/jar/JarPhysics";

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

	it("accelerates while falling", () => {
		const physics = new JarPhysics(200, 1000);
		physics.add({ id: "a", x: 100, y: 0, r: 12 });
		for (let frame = 0; frame < 60; frame++) physics.step();
		expect(physics.get("a")?.y).toBeGreaterThan(500);
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


	it("steps a full jar quickly", () => {
		const physics = new JarPhysics(390, 760);
		for (let index = 0; index < 250; index++) physics.add({ id: `b${index}`, x: 12 + (index * 37) % 366, y: 748 - Math.floor(index / 15) * 24, r: 12 });
		const started = performance.now();
		for (let frame = 0; frame < 120; frame++) physics.step();
		expect((performance.now() - started) / 120).toBeLessThan(4);
	});
});
