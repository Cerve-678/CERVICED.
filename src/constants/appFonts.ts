/**
 * Every font the app registers by name, in one place so the app (App.tsx,
 * through useFonts) and the website (src/web, which declares them for the
 * browser) can never disagree about what a page style's font is called.
 * Add a new page-style font here, not in App.tsx.
 */
import type { FontSource } from 'expo-font';
import { Lobster_400Regular } from '@expo-google-fonts/lobster';
import { DancingScript_700Bold } from '@expo-google-fonts/dancing-script';
import { Bungee_400Regular } from '@expo-google-fonts/bungee';
import { Righteous_400Regular } from '@expo-google-fonts/righteous';
import { Sniglet_800ExtraBold } from '@expo-google-fonts/sniglet';
import { Baloo2_700Bold } from '@expo-google-fonts/baloo-2';
import { VarelaRound_400Regular } from '@expo-google-fonts/varela-round';
// The 2026-11-03 brand fonts, one weight each: a family's own index would
// bundle every weight it ships.
import { PlayfairDisplay_700Bold } from '@expo-google-fonts/playfair-display/700Bold';
import { Italiana_400Regular } from '@expo-google-fonts/italiana/400Regular';
import { GreatVibes_400Regular } from '@expo-google-fonts/great-vibes/400Regular';
import { PinyonScript_400Regular } from '@expo-google-fonts/pinyon-script/400Regular';
import { Sacramento_400Regular } from '@expo-google-fonts/sacramento/400Regular';
import { Syne_700Bold } from '@expo-google-fonts/syne/700Bold';
import { JosefinSans_600SemiBold } from '@expo-google-fonts/josefin-sans/600SemiBold';
// Quiet's lighter line under the name (ProfileHero quietPhrase).
import { JosefinSans_400Regular } from '@expo-google-fonts/josefin-sans/400Regular';
import { TenorSans_400Regular } from '@expo-google-fonts/tenor-sans/400Regular';
import { PoiretOne_400Regular } from '@expo-google-fonts/poiret-one/400Regular';
import { Limelight_400Regular } from '@expo-google-fonts/limelight/400Regular';
import { Shrikhand_400Regular } from '@expo-google-fonts/shrikhand/400Regular';
import { BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue/400Regular';
import { Fredoka_600SemiBold } from '@expo-google-fonts/fredoka/600SemiBold';
import { Comfortaa_700Bold } from '@expo-google-fonts/comfortaa/700Bold';
import { Pacifico_400Regular } from '@expo-google-fonts/pacifico/400Regular';

/* eslint-disable @typescript-eslint/no-require-imports */
export const APP_FONTS: Record<string, FontSource> = {
  'BakbakOne-Regular': require('../../assets/fonts/BakbakOne-Regular.ttf'),
  'Jura-VariableFont_wght': require('../../assets/fonts/Jura-VariableFont_wght.ttf'),
  'Prata-Regular': require('../../assets/fonts/Prata-Regular.ttf'),
  // Page styles 11–16 (Branding → Page Style, 2026-11-14). Static instances
  // from Google Fonts (OFL), one weight each, bundled as files rather than
  // packages so no dependency changes.
  'LeagueSpartan-Light': require('../../assets/fonts/LeagueSpartan-Light.ttf'),
  'LeagueSpartan-ExtraBold': require('../../assets/fonts/LeagueSpartan-ExtraBold.ttf'),
  'Cinzel-Medium': require('../../assets/fonts/Cinzel-Medium.ttf'),
  'Cinzel-Bold': require('../../assets/fonts/Cinzel-Bold.ttf'),
  'LibreBaskerville-Italic': require('../../assets/fonts/LibreBaskerville-Italic.ttf'),
  'MsMadi-Regular': require('../../assets/fonts/MsMadi-Regular.ttf'),
  'Gloock-Regular': require('../../assets/fonts/Gloock-Regular.ttf'),
  'Anton-Regular': require('../../assets/fonts/Anton-Regular.ttf'),
  'MrsSaintDelafield-Regular': require('../../assets/fonts/MrsSaintDelafield-Regular.ttf'),
  'Montserrat-Medium': require('../../assets/fonts/Montserrat-Medium.ttf'),
  'Montserrat-ExtraBold': require('../../assets/fonts/Montserrat-ExtraBold.ttf'),
  'Fraunces-SoftBlackItalic': require('../../assets/fonts/Fraunces-SoftBlackItalic.ttf'),
  'InstrumentSerif-Regular': require('../../assets/fonts/InstrumentSerif-Regular.ttf'),
  'InstrumentSerif-Italic': require('../../assets/fonts/InstrumentSerif-Italic.ttf'),
  'DidactGothic-Regular': require('../../assets/fonts/DidactGothic-Regular.ttf'),
  'Marcellus-Regular': require('../../assets/fonts/Marcellus-Regular.ttf'),
  'MarcellusSC-Regular': require('../../assets/fonts/MarcellusSC-Regular.ttf'),
  // Sealed (round 4, 2026-11-15).
  'EBGaramond-SemiBold': require('../../assets/fonts/EBGaramond-SemiBold.ttf'),
  // Branding → Custom's Gilda heading font (first loaded for Lace, since removed).
  'GildaDisplay-Regular': require('../../assets/fonts/GildaDisplay-Regular.ttf'),
  // Sheer (page style, round 4, 2026-11-15).
  'Bellefair-Regular': require('../../assets/fonts/Bellefair-Regular.ttf'),
  'Jost-Light': require('../../assets/fonts/Jost-Light.ttf'),
  // Embossed (round 4, 2026-11-15).
  'LibreCaslonDisplay-Regular': require('../../assets/fonts/LibreCaslonDisplay-Regular.ttf'),
  'Italianno-Regular': require('../../assets/fonts/Italianno-Regular.ttf'),
  // Calling Card (round 4, 2026-11-15): a copperplate script and engraved caps.
  'MonsieurLaDoulaise-Regular': require('../../assets/fonts/MonsieurLaDoulaise-Regular.ttf'),
  'Forum-Regular': require('../../assets/fonts/Forum-Regular.ttf'),
  // Boutique (round 4, 2026-11-15).
  'DMSerifDisplay-Regular': require('../../assets/fonts/DMSerifDisplay-Regular.ttf'),
  'Manrope-Bold': require('../../assets/fonts/Manrope-Bold.ttf'),
  // Gazette (round 4, 2026-11-15): a blackletter masthead, condensed
  // headlines and an old newspaper serif.
  'UnifrakturMaguntia-Book': require('../../assets/fonts/UnifrakturMaguntia-Book.ttf'),
  'Oswald-Bold': require('../../assets/fonts/Oswald-Bold.ttf'),
  'Oswald-Medium': require('../../assets/fonts/Oswald-Medium.ttf'),
  'OldStandardTT-Regular': require('../../assets/fonts/OldStandardTT-Regular.ttf'),
  'OldStandardTT-Italic': require('../../assets/fonts/OldStandardTT-Italic.ttf'),
  // Novel (round 4, 2026-11-15): IM Fell English, OFL, static files.
  'IMFellEnglish-Regular': require('../../assets/fonts/IMFellEnglish-Regular.ttf'),
  'IMFellEnglish-Italic': require('../../assets/fonts/IMFellEnglish-Italic.ttf'),
  'IMFellEnglishSC-Regular': require('../../assets/fonts/IMFellEnglishSC-Regular.ttf'),
  // Studio (2026-11-16): chunky caps, a light script for the joining words,
  // and a soft serif for the pressed wordmark. OFL, static files.
  'LilitaOne-Regular': require('../../assets/fonts/LilitaOne-Regular.ttf'),
  'Ephesis-Regular': require('../../assets/fonts/Ephesis-Regular.ttf'),
  'YoungSerif-Regular': require('../../assets/fonts/YoungSerif-Regular.ttf'),
  // The demure set (2026-11-16, page styles 28–32): Lounge, Soft Focus,
  // Hush, Pearl and Bow. OFL, static instances from Google Fonts.
  'LeagueGothic-Regular': require('../../assets/fonts/LeagueGothic-Regular.ttf'),
  'Archivo-ExtraBold': require('../../assets/fonts/Archivo-ExtraBold.ttf'),
  'Newsreader-LightItalic': require('../../assets/fonts/Newsreader-LightItalic.ttf'),
  'HankenGrotesk-Medium': require('../../assets/fonts/HankenGrotesk-Medium.ttf'),
  'Castoro-Regular': require('../../assets/fonts/Castoro-Regular.ttf'),
  'Castoro-Italic': require('../../assets/fonts/Castoro-Italic.ttf'),
  'SortsMillGoudy-Italic': require('../../assets/fonts/SortsMillGoudy-Italic.ttf'),
  'Figtree-SemiBold': require('../../assets/fonts/Figtree-SemiBold.ttf'),
  Lobster_400Regular,
  DancingScript_700Bold,
  Bungee_400Regular,
  Righteous_400Regular,
  Sniglet_800ExtraBold,
  Baloo2_700Bold,
  VarelaRound_400Regular,
  PlayfairDisplay_700Bold,
  Italiana_400Regular,
  GreatVibes_400Regular,
  PinyonScript_400Regular,
  Sacramento_400Regular,
  Syne_700Bold,
  JosefinSans_600SemiBold,
  JosefinSans_400Regular,
  TenorSans_400Regular,
  PoiretOne_400Regular,
  Limelight_400Regular,
  Shrikhand_400Regular,
  BebasNeue_400Regular,
  Fredoka_600SemiBold,
  Comfortaa_700Bold,
  Pacifico_400Regular,
};
