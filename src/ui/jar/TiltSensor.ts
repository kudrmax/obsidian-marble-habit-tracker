import { EARTH, Point } from "./JarPhysics";

const SMOOTHING = 0.25;
const RADIANS = Math.PI / 180;

type PermissionRequest = () => Promise<"granted" | "denied">;

/**
 * The pull of the ground along the screen, from the phone's orientation. The device frame is turned by beta about its
 * x axis and then by gamma about its own y axis, so the ground's pull lands on the screen's x as cos β · sin γ and on
 * its y as sin β. Face down cos β is negative: the screen's left and right have swapped sides over the ground.
 */
export function tiltGravity(beta: number, gamma: number, screenAngle: number, strength = EARTH.y): Point {
	const deviceX = Math.cos(beta * RADIANS) * Math.sin(gamma * RADIANS) * strength;
	const deviceY = Math.sin(beta * RADIANS) * strength;
	const angle = screenAngle * RADIANS;
	return {
		x: deviceX * Math.cos(angle) + deviceY * Math.sin(angle),
		y: -deviceX * Math.sin(angle) + deviceY * Math.cos(angle),
	};
}

/** How a phone is usually held to read it, tilted back from upright. */
const READING_ANGLE = 40;

/**
 * Gravity where there's no tilt to follow — a computer, or tilt turned off: as on a phone held at a reading angle, so
 * marbles fall at the speed they do in the hand rather than as if the phone stood upright.
 */
export const IN_HAND: Point = tiltGravity(READING_ANGLE, 0, 0);

export class TiltSensor {
	private listening = false;
	private asked = false;
	private askedSilently = false;
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

	/**
	 * iOS answers at once when motion was allowed before; otherwise the first prompt needs a tap, see askOnTap.
	 * Asked once per sensor, not on every refresh of the screen.
	 */
	async askSilently(): Promise<void> {
		const request = this.permissionRequest();
		if (!request || this.askedSilently || this.asked) return;
		this.askedSilently = true;
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
