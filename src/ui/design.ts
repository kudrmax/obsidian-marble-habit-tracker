/**
 * The measures Today lays itself out with in code. Each one is also a token in styles.css, named in
 * DESIGN_TOKENS; tests/styles.test.ts fails when the two differ, so they change together.
 */
export const DESIGN = {
	/** The strip with the grabber at the tray's top. */
	grip: 14,
	/** One week of the calendar. */
	weekRow: 54,
	/** The line with the month, its arrows and Today's buttons, and the room under it. */
	monthLine: 30,
	monthLineGap: 12,
	/** Room each side of the phone's week grid; its columns share the rest. */
	weekPad: 8,
	/** The ring around each date, with room inside for two figures and the shown day's disc. */
	ring: 40,
	dayRingStroke: 2,
	/** The rounded corners of the tray's top edge, which the marbles roll along. */
	trayCorner: 24,
	/** The room between the view's sides and the list, which a menu keeps too. */
	gutter: 20,
	/** How far the menu of reasons stands off its Skip and the view's edges. */
	reasonsOffset: 8,
} as const;

export type DesignMeasure = keyof typeof DESIGN;

export const DESIGN_TOKENS: Readonly<Record<DesignMeasure, string>> = {
	grip: "--th-grip",
	weekRow: "--th-week-row",
	monthLine: "--th-month-line",
	monthLineGap: "--th-month-line-gap",
	weekPad: "--th-week-pad",
	ring: "--th-ring",
	dayRingStroke: "--th-day-ring-stroke",
	trayCorner: "--th-radius-tray",
	gutter: "--th-gutter",
	reasonsOffset: "--th-space-8",
};

/** A date's ring drawn inside its box, its stroke kept within. */
export const DAY_RING_RADIUS = (DESIGN.ring - DESIGN.dayRingStroke) / 2;
export const DAY_RING_LENGTH = 2 * Math.PI * DAY_RING_RADIUS;
