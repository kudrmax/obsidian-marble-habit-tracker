export interface ChainMetrics {
	readonly cell: number;
	readonly row: number;
	readonly bead: number;
	readonly neck: number;
	readonly spark: number;
	readonly ring: number;
	readonly blur: number;
}

const TOKENS: Record<keyof ChainMetrics, string> = {
	cell: "--th-cell",
	row: "--th-row",
	bead: "--th-bead",
	neck: "--th-neck",
	spark: "--th-spark",
	ring: "--th-ring-width",
	blur: "--th-goo-blur",
};

export function parseChainMetrics(read: (token: string) => string): ChainMetrics | null {
	const entries = Object.entries(TOKENS).map(([key, token]) => [key, parseFloat(read(token))] as const);
	if (entries.some(([, value]) => !Number.isFinite(value))) return null;
	return Object.fromEntries(entries) as unknown as ChainMetrics;
}
