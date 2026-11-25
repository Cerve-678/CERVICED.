import { Platform, type ViewStyle } from 'react-native';

/**
 * The widest a phone-shaped screen is allowed to get, in points.
 *
 * Every screen in the app was designed at phone width. On an iPad (or any
 * wide window: landscape, Stage Manager, half of Split View) they used to
 * stretch edge to edge, so rows ran 1,000pt wide and a toggle sat a whole
 * screen away from its label. On an iPad held upright, past this width a
 * screen sits in a centred column (`ReadableWidth`); in landscape it fills the
 * display. The floating tab bar and pop-ups are capped either way. At phone
 * widths nothing changes.
 */
export const READABLE_MAX_WIDTH = 720;

/** The widest a centred dialog (a confirm, a short form) gets on an iPad. */
export const DIALOG_MAX_WIDTH = 480;

const IS_IPAD = Platform.OS === 'ios' && Platform.isPad;

/*
 * Pop-ups (`<Modal transparent>`) draw over the whole window, outside the
 * screen's centred column, so on an iPad a sheet built for a phone ran the
 * width of the display. Spread one of these into the sheet's own style.
 *
 * They are iPad-only on purpose: some of these sheets sit in a parent that
 * centres them at their content's width, and forcing `width: '100%'` on a
 * phone would change how they look there. On an iPhone or Android they are
 * empty.
 */

/** A sheet that slides up from the bottom: full width, up to the column. */
export const readableSheet: ViewStyle = IS_IPAD
  ? { width: '100%', maxWidth: READABLE_MAX_WIDTH, alignSelf: 'center' }
  : {};

/** A dialog centred on screen: full width, up to a dialog's width. */
export const readableDialog: ViewStyle = IS_IPAD
  ? { width: '100%', maxWidth: DIALOG_MAX_WIDTH, alignSelf: 'center' }
  : {};

/**
 * A sheet pinned to the bottom with `position: 'absolute'`. On a phone it
 * keeps its `inset` from both sides; on an iPad it drops the side pins (which
 * would stretch it across the display) and centres at the column's width.
 */
export function readableAbsoluteSheet(inset: number): ViewStyle {
  return IS_IPAD ? readableSheet : { left: inset, right: inset };
}
