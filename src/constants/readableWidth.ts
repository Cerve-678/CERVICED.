/**
 * The widest a phone-shaped screen is allowed to get, in points.
 *
 * Every screen in the app was designed at phone width. On an iPad (or any
 * wide window: landscape, Stage Manager, half of Split View) they used to
 * stretch edge to edge, so rows ran 1,000pt wide and a toggle sat a whole
 * screen away from its label. Past this width a screen sits in a centred
 * column (`ReadableWidth`), and the floating tab bar is capped to match.
 * At phone widths nothing changes.
 */
export const READABLE_MAX_WIDTH = 720;
