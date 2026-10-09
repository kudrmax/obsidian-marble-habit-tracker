import { CellLook } from "./chain";

export type DayState = "full" | "tiny" | "missed" | "empty" | "off" | "before";

export interface ChainBead {
	readonly index: number;
	readonly spark: boolean;
}

export interface ChainRun {
	readonly first: number;
	readonly last: number;
	readonly beads: readonly ChainBead[];
}

export interface ChainRing {
	readonly index: number;
	readonly kind: "empty" | "missed";
}

export interface ChainLayout {
	readonly runs: readonly ChainRun[];
	readonly rings: readonly ChainRing[];
}

export function dayState(look: CellLook): DayState {
	if (look.mark) return look.mark.kind;
	if (!look.existed) return "before";
	return look.scheduled ? "empty" : "off";
}

const isDone = (state: DayState) => state === "tiny" || state === "full";

export function chainLayout(states: readonly DayState[]): ChainLayout {
	const runs: ChainRun[] = [];
	const rings: ChainRing[] = [];
	let beads: ChainBead[] = [];
	const closeRun = () => {
		if (beads.length) runs.push({ first: beads[0].index, last: beads[beads.length - 1].index, beads });
		beads = [];
	};
	states.forEach((state, index) => {
		if (isDone(state)) {
			beads.push({ index, spark: state === "full" });
			return;
		}
		closeRun();
		if (state === "empty" || state === "missed") rings.push({ index, kind: state });
	});
	closeRun();
	return { runs, rings };
}
