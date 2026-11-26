/** How many characters of a provider's About text show before "More". */
export const ABOUT_PREVIEW_CHARS = 150;

export interface AboutPreview {
  /** True only when the text is longer than the preview, so there is
   *  something to expand — and so a "Show Less" has something to collapse. */
  isLong: boolean;
  /** What to show while collapsed: the whole text when it's short, otherwise
   *  the first ABOUT_PREVIEW_CHARS characters followed by an ellipsis. */
  collapsed: string;
}

/**
 * Before this, every About text was cut at 150 characters and given "..." and
 * a "More" link, even a two-line bio that fitted — so "More" opened nothing
 * new. Short text now shows whole, with no expander at all.
 */
export function aboutPreview(text: string, limit: number = ABOUT_PREVIEW_CHARS): AboutPreview {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return { isLong: false, collapsed: trimmed };
  return { isLong: true, collapsed: `${trimmed.substring(0, limit).trimEnd()}...` };
}
