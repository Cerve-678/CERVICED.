import { useMemo } from "react";

import type { RecommendBadgeTheme } from "../../social/ProviderRecommend";
import {
  DETAILS_ON_CARD_INK,
  detailsSitOnCard,
  heroIsDarkForStyle,
} from "../ProfileHero";
import { cardInk } from "../heroes/BoutiqueHero";
import { stripesHeroColour } from "../heroes/DemureHeroes";
import { latteBand, latteShade } from "../heroes/LatteHero";
import { veilAccent, veilPageTheme } from "../heroes/SheerHero";
import {
  customTextStyle,
  onAccentInk,
  sectionsSitOnPage,
  serviceCardSurface,
  sheetInk,
} from "../ProfilePageStyle";
import { BUSINESS_TYPE_LABEL } from "../profilePresentation";
import type { ProviderProfileData } from "../profileTypes";
import { getPageStyle, policyPicturePlacement } from "../../../constants/pageStyles";
import {
  isDarkColor,
  parseThemeKey,
  resolveProviderTheme,
  withAlpha,
} from "../../../constants/providerThemes";

/**
 * Everything about how a provider's page looks that follows from their saved
 * branding: the page style, theme colours, card surfaces, hero ink and the
 * words round the name. Pure — the app's profile screen and the website both
 * build the page from this, so the two can't drift apart.
 *
 * Until the provider loads (`provider` null) this resolves to the 'app'
 * preset and Classic, exactly as the screen always has.
 */
export function buildProviderPagePalette(provider: ProviderProfileData | null) {
  // Palette follows the provider's chosen profile theme (preset key or custom set).
  // Until the provider loads this resolves to the 'app' preset.
  // Branding → Page Style (constants/pageStyles): headings, card treatment,
  // the policy layout and the logo frame, on top of the colours. Classic is
  // the profile exactly as it was.
  const themeParts = parseThemeKey(provider?.profileTheme);
  const pageStyle = getPageStyle(themeParts.pageStyle, themeParts.custom);
  // Branding → Custom's text font, laid over the page's body text; null on
  // every other style, which keeps Jura.
  const bodyFont = customTextStyle(pageStyle);
  // A veil page (Sheer) keeps the theme's hero and accent but puts the
  // content on see-through dark glass, so every section inks itself white.
  const baseTheme = resolveProviderTheme(provider?.profileTheme);
  const veilTheme = pageStyle.veilPage ? veilPageTheme(baseTheme) : null;
  const OP = veilTheme ?? baseTheme;
  // Branding → Card Shape: square corners on the profile's cards (the service
  // cards and category pills, About/Policies, the sharing card, Reviews,
  // Contact, Opening hours, Additional info), or the rounded look it has
  // always had. The availability pill and Instagram button beside it stay
  // rounded, and so do photos (owner's call, 2026-11-09).
  const squareCards = themeParts.shape === 'square';
  // Branding → Policy Pictures: story circles near the top, or one of the
  // designs (full size, framed, swipe, fanned, peek, thumbnails, a button)
  // after the services.
  const policyLook = themeParts.policyLook;
  const policyPlacement = policyPicturePlacement(policyLook);

  // The saved accent_color, else the provider's own theme accent (the app's
  // brown for the default theme). There used to be a middle step that guessed
  // an accent from the gradient's first colour through a table of old
  // placeholder presets, falling back to purple for anything else.
  const rawAccentColor = provider?.accentColor ?? OP.accent;
  // On a veil page's dark glass a dark accent is lifted so it still reads.
  const adaptiveAccentColor = veilTheme ? veilAccent(rawAccentColor) : rawAccentColor;
  // Recommend's badge on the logo wears this page's colours.
  const recommendBadgeTheme: RecommendBadgeTheme = {
    card: OP.card,
    text: OP.text,
    accent: adaptiveAccentColor,
    onAccent: onAccentInk(adaptiveAccentColor).text,
  };

  // Card overlay tint sits on top of a BlurView for a frosted-glass look instead of a flat
  // opaque fill — derived from the provider theme's card colour so every preset matches.
  const cardBg = withAlpha(OP.card, OP.isDark ? 0.5 : 0.9);
  const cardBlurTint = OP.isDark ? ("dark" as const) : ("light" as const);
  const cardBlurIntensity = OP.isDark ? 35 : 25;
  const cardHighlightColors = (OP.isDark
    ? ["rgba(255,255,255,0.08)", "transparent"]
    : ["rgba(255,255,255,0.3)", "transparent"]
  ) as [string, string];
  const sectionPalette = {
    text: OP.text,
    sub: OP.sub,
    border: OP.border,
    separator: OP.sep,
    background: OP.bg,
    cardBackground: cardBg,
    accent: adaptiveAccentColor,
    blurTint: cardBlurTint,
    blurIntensity: cardBlurIntensity,
    highlightColors: cardHighlightColors,
    squareCards,
    pageStyle,
  };

  // A style that draws sections straight on the page (Cover, Spa, Framed)
  // takes its text colours from the content area, not the card — the
  // theme's own text colours follow the card's brightness. SV is what the
  // service list reads; every other style keeps OP.
  const pageInk = sheetInk(OP.bg);
  // Latte's services sit on their own band of the pour, in its ink.
  const serviceInk = pageStyle.cards === "pour" ? sheetInk(latteBand(adaptiveAccentColor, OP.bg, "services")) : pageInk;
  const SV = sectionsSitOnPage(pageStyle)
    ? { ...OP, text: serviceInk.text, sub: serviceInk.sub, border: serviceInk.border, sep: serviceInk.separator }
    : OP;
  const serviceSurfaceStyle = serviceCardSurface(pageStyle, {
    card: OP.card,
    accent: adaptiveAccentColor,
    sheet: OP.bg,
  });

  // Hero info floats over the photo/gradient. Every theme always carries a
  // gradient now (saved as [backdrop, sheetColor]), so "is there a gradient"
  // can't decide text colour any more — some backdrops (Cream, Sky, Blush…)
  // are pale, and white text on them is close to invisible. Decide from the
  // actual rendered colour's brightness instead; a photo always gets the
  // dark-overlay treatment so white text is safe there.
  const heroBgColor = provider?.hasCustomGradient
    ? provider?.gradient[0]
    : OP.hero;
  // Latte's top is the palest band of its pour (the deepest on a dark page),
  // drawn over whatever is behind, so its ink follows that band.
  const pourTop = pageStyle.hero === "pourTop" ? latteShade(adaptiveAccentColor, OP.bg, 0) : null;
  const heroIsDark = pourTop ? isDarkColor(pourTop) :
    heroIsDarkForStyle(pageStyle) ||
    !!provider?.backgroundImage ||
    (heroBgColor ? isDarkColor(heroBgColor) : true);
  const heroText = heroIsDark ? "#FFFFFF" : "#26201E";
  const heroSub = heroIsDark ? "rgba(255,255,255,0.96)" : "rgba(38,32,30,0.78)";
  // Duet and Calling Card draw the stars, years and link-only caption on a
  // card, so they take that card's ink whatever is behind the hero.
  const detailsOnCard = detailsSitOnCard(pageStyle);
  // Boutique's panel and Duet's welcome card are their card
  // colour, so their ink follows that colour. Calling Card's cream card is dark ink.
  // Lounge's sit on a strip of the page colour under its panel, Stripes' on
  // its strip of the accent.
  const sheetColour = veilTheme ? veilTheme.sheetFill : OP.bg;
  const cardDetailsInk = pageStyle.hero === "productPage" || pageStyle.hero === "duet" || pageStyle.hero === "receiptHead"
    ? cardInk(OP.card)
    : pageStyle.hero === "stripes"
      ? cardInk(stripesHeroColour(adaptiveAccentColor))
    : pageStyle.hero === "lounge"
      ? cardInk(sheetColour)
      : DETAILS_ON_CARD_INK;
  const detailsText = detailsOnCard ? cardDetailsInk.text : heroText;
  const detailsSub = detailsOnCard ? cardDetailsInk.sub : heroSub;
  const detailsShadow = heroIsDark && !detailsOnCard;

  // What they do, for Arch's curved caption, Spa's top line and the like.
  let heroKicker = "";
  if (provider) {
    const types = provider.serviceTypes.length ? provider.serviceTypes : [provider.providerService];
    heroKicker = [...new Set(types.map((type) => (type === "OTHER" ? provider.customServiceType || "SERVICE" : type).toUpperCase()))].join(" · ");
  }

  // Cover's pills under the name: their area and how they work. What they do
  // isn't repeated here: Additional Information lists it as Category
  // (owner, 2026-11-15).
  const heroPillLabels: string[] = [];
  if (provider && pageStyle.heroPills) {
    if (provider.location) heroPillLabels.push(provider.location.toUpperCase());
    if (provider.businessType) heroPillLabels.push(BUSINESS_TYPE_LABEL[provider.businessType].toUpperCase());
  }

  return {
    themeParts,
    pageStyle,
    bodyFont,
    baseTheme,
    veilTheme,
    OP,
    squareCards,
    policyLook,
    policyPlacement,
    adaptiveAccentColor,
    recommendBadgeTheme,
    cardBg,
    cardBlurTint,
    cardBlurIntensity,
    cardHighlightColors,
    sectionPalette,
    pageInk,
    SV,
    serviceSurfaceStyle,
    heroBgColor,
    heroIsDark,
    heroText,
    heroSub,
    detailsOnCard,
    sheetColour,
    detailsText,
    detailsSub,
    detailsShadow,
    heroKicker,
    heroPillLabels: [...new Set(heroPillLabels)],
  };
}

export type ProviderPagePalette = ReturnType<typeof buildProviderPagePalette>;

/** The palette, rebuilt only when the provider itself changes, so every
 *  object in it (page style, section palette, badge theme) keeps its identity
 *  across unrelated re-renders. */
export function useProviderPagePalette(provider: ProviderProfileData | null): ProviderPagePalette {
  return useMemo(() => buildProviderPagePalette(provider), [provider]);
}
