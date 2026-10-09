import { EARTH, Point } from "./JarPhysics";

const SMOOTHING = 0.25;
const RADIANS = Math.PI / 180;

type PermissionRequest = () => Promise<"granted" | "denied">;

export function tiltGravity(beta: number, gamma: number, screenAngle: number, strength = EARTH.y): Point {
	const deviceX = Math.sin(gamma * RADIANS) * strength;
	const deviceY = Math.sin(beta * RADIANS) * strength;
	const angle = screenAngle * RADIANS;
	return {
		x: deviceX * Math.cos(angle) + deviceY * Math.sin(angle),
		y: -deviceX * Math.sin(angle) + deviceY * Math.cos(angle),
	};
}

export class TiltSensor {
	private listening = false;
	private asked = false;
	private smoothed: Point | null = null;
	private readonly listener = (event: DeviceOrientationEvent) => this.read(event);

	constructor(private readonly onGravity: (gravity: Point) => void) {}

	start(): void {
		if (this.listening || typeof window.DeviceOrientationEvent === "undefined") return;
		window.addEventListener("deviceorientation", this.listener);
		this.listening = true;
	}

	stop(): void {
		if (!this.listening) return;
		window.removeEventListener("deviceorientation", this.listener);
		this.listening = false;
		this.smoothed = null;
	}

	/** iOS answers at once when motion was allowed before; otherwise the first prompt needs a tap, see askOnTap. */
	async askSilently(): Promise<void> {
		const request = this.permissionRequest();
		if (!request) return;
		try {
			if ((await request.call(window.DeviceOrientationEvent)) === "granted") {
				this.asked = true;
				this.start();
			}
		} catch {
			// No tap yet: askOnTap will show the prompt.
		}
	}

	async askOnTap(): Promise<void> {
		const request = this.permissionRequest();
		if (this.asked || !request) return;
		this.asked = true;
		try {
			if ((await request.call(window.DeviceOrientationEvent)) === "granted") this.start();
		} catch {
			this.asked = false;
		}
	}

	private permissionRequest(): PermissionRequest | null {
		const request = (window.DeviceOrientationEvent as unknown as { requestPermission?: PermissionRequest } | undefined)?.requestPermission;
		return typeof request === "function" ? request : null;
	}

	private read(event: DeviceOrientationEvent): void {
		if (event.beta === null || event.gamma === null) return;
		const angle = window.screen.orientation?.angle ?? 0;
		const raw = tiltGravity(event.beta, event.gamma, angle);
		const previous = this.smoothed ?? raw;
		this.smoothed = { x: previous.x + (raw.x - previous.x) * SMOOTHING, y: previous.y + (raw.y - previous.y) * SMOOTHING };
		this.onGravity(this.smoothed);
	}
}
