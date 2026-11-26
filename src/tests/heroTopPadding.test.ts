import { PAGE_STYLES } from '../constants/pageStyles';
import {
  HERO_GAP_UNDER_BUTTONS,
  HERO_TOP_PADDING,
  heroTopPadding,
} from '../features/providers/page/heroTopPadding';

const heroOf = (key: string) => {
  const style = PAGE_STYLES.find(s => s.key === key);
  if (!style) throw new Error(`no page style ${key}`);
  return style.hero;
};

// An iPhone with the Dynamic Island: 59pt status bar + 44pt bar.
const ISLAND_HEADER = 59 + 44;

describe('heroTopPadding', () => {
  it('starts a top that reaches the buttons a gap under them', () => {
    for (const key of ['snapshot', 'posy', 'riviera', 'storefront', 'stripes', 'portfolio', 'hibiscus', 'moodboard', 'hush', 'capsule', 'poster']) {
      expect(heroTopPadding(heroOf(key), false, ISLAND_HEADER)).toBe(ISLAND_HEADER + HERO_GAP_UNDER_BUTTONS);
    }
  });

  it('leaves a centred top where it was', () => {
    for (const key of ['classic', 'glossy', 'bonbon', 'ledger', 'neon', 'latte']) {
      expect(heroTopPadding(heroOf(key), true, ISLAND_HEADER)).toBe(HERO_TOP_PADDING);
    }
  });

  it('moves Pinboard only when it opens on its pins', () => {
    expect(heroTopPadding('pinboardHeader', true, ISLAND_HEADER)).toBe(ISLAND_HEADER + HERO_GAP_UNDER_BUTTONS);
    expect(heroTopPadding('pinboardHeader', false, ISLAND_HEADER)).toBe(HERO_TOP_PADDING);
  });

  it('never starts higher than usual on a phone with a short header', () => {
    expect(heroTopPadding('colourBlock', false, 20 + 44)).toBe(HERO_TOP_PADDING);
  });

  it('keeps the usual start where nothing sits over the page', () => {
    expect(heroTopPadding('colourBlock', true, undefined)).toBe(HERO_TOP_PADDING);
  });
});
