// src/features/providers/CustomPageMaker.tsx
//
// Branding → Custom: the provider makes a plain page of their own (owner,
// 2026-11-18, from the "Simple template" canvas): a layout, three fonts that
// go together (or each picked by hand), how the headings read, and the corners.
// Picking anything here switches the page to Custom; picking a style under
// Layout switches it back. The name font is the same Business Name Font that
// Branding → Name sets, and the corners are the same Card Shape as Layout's.

import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import {
  CUSTOM_HEADING_FONTS,
  CUSTOM_LAYOUTS,
  CUSTOM_PARTS,
  LAYOUT_PARTS,
  matchingLook,
  partsOf,
  withPart,
  type CustomPartKey,
  CUSTOM_TEXT_FONTS,
  FONT_SET_COLLECTIONS,
  FONT_SETS,
  customHeadingFont,
  customTextFont,
  matchingFontSet,
  type CustomChoices,
  type CustomLayout,
} from '../../constants/customPageStyle';
import { PROVIDER_FONTS, resolveProviderFontFamily, resolveProviderFontScale } from '../../constants/providerFonts';
import { CARD_SHAPES, type CardShape } from '../../constants/providerThemes';

export interface CustomPageMakerPalette {
  surface: string;
  card: string;
  text: string;
  sub: string;
  border: string;
}

interface Props {
  choices: CustomChoices;
  onChange: (next: CustomChoices) => void;
  /** Whether the page is on Custom right now. */
  active: boolean;
  onUse: () => void;
  brandFont: string;
  onBrandFontChange: (key: string) => void;
  cardShape: CardShape;
  onCardShapeChange: (shape: CardShape) => void;
  /** Opens Branding → Colours, where the page's colours are set. */
  onOpenColours: () => void;
  /** Opens the full preview, where tapping a part of the page changes it. */
  onOpenTapEdit: () => void;
  /** Link-only providers get Classic only, so Custom shows locked. */
  locked: boolean;
  onLockedPress: () => void;
  accent: string;
  P: CustomPageMakerPalette;
}

type FontMode = 'sets' | 'mix';

function tap(): void {
  Haptics.selectionAsync().catch(() => {});
}

export function CustomPageMaker({
  choices,
  onChange,
  active,
  onUse,
  brandFont,
  onBrandFontChange,
  cardShape,
  onCardShapeChange,
  onOpenColours,
  onOpenTapEdit,
  locked,
  onLockedPress,
  accent,
  P,
}: Props) {
  const current = matchingFontSet(brandFont, choices.heading, choices.text);
  // Opens on Mix when their fonts aren't one of the sets, so what they picked is what they see.
  const [mode, setMode] = React.useState<FontMode>(current || !active ? 'sets' : 'mix');

  // Every pick goes through here: a locked provider gets the explainer, and
  // anyone else's page moves to Custom with the change.
  const guard = (apply: () => void) => () => {
    tap();
    if (locked) { onLockedPress(); return; }
    apply();
    if (!active) onUse();
  };
  const set = (patch: Partial<CustomChoices>) => guard(() => onChange({ ...choices, ...patch }));
  const look = matchingLook(partsOf(choices));

  const sectionStyle = [styles.section, { backgroundColor: P.card, borderColor: P.border }];

  return (
    <View style={locked && styles.lockedAll}>
      {/* Where they stand: on Custom, or a button to start. */}
      <View style={sectionStyle}>
        <Text style={[styles.sectionTitle, { color: P.text }]}>Your Own Page</Text>
        {active ? (
          <View style={styles.activeRow}>
            <Ionicons name="checkmark-circle" size={18} color={accent} />
            <Text style={[styles.sectionSubFlat, { color: P.sub }]}>Your page is using Custom. Choose a style under Layout to switch back.</Text>
          </View>
        ) : (
          <>
            <Text style={[styles.sectionSub, { color: P.sub }]}>A plain page you make yourself. Pick a layout and fonts below.</Text>
            <TouchableOpacity
              style={[styles.useBtn, { backgroundColor: accent }]}
              onPress={guard(() => {})}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={locked ? 'Use Custom, locked' : 'Use Custom'}
            >
              {locked ? <Ionicons name="lock-closed" size={14} color="#FFFFFF" /> : null}
              <Text style={styles.useBtnText}>Use Custom</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* 1 · A look to start from: each sets every part below at once. */}
      <View style={sectionStyle}>
        <Text style={[styles.sectionTitle, { color: P.text }]}>Start From a Look</Text>
        <Text style={[styles.sectionSub, { color: P.sub }]}>Each one sets your whole page. Then change any part below.</Text>
        <View style={styles.layoutGrid}>
          {CUSTOM_LAYOUTS.map(layout => {
            const selected = active && look === layout.key;
            return (
              <TouchableOpacity
                key={layout.key}
                style={[styles.layoutOption, { borderColor: selected ? P.text : P.border }, selected && styles.selectedBorder]}
                // Keeps their headings: those are theirs, not the look's.
                onPress={set({ layout: layout.key, ...LAYOUT_PARTS[layout.key], headingStyle: choices.headingStyle })}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${layout.name}: ${layout.description}`}
              >
                <LayoutSketch layout={layout.key} accent={accent} surface={P.surface} line={P.border} card={P.card} />
                <Text style={[styles.optionName, { color: P.text }]}>{layout.name}</Text>
                <Text style={[styles.optionDesc, { color: P.sub }]} numberOfLines={2}>{layout.description}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 2 · Every part on its own */}
      <View style={sectionStyle}>
        <Text style={[styles.sectionTitle, { color: P.text }]}>Part by Part</Text>
        <Text style={[styles.sectionSub, { color: P.sub }]}>Change one part of your page at a time.</Text>
        <TouchableOpacity
          style={[styles.tapEditBtn, { borderColor: P.border, backgroundColor: P.surface }]}
          onPress={guard(onOpenTapEdit)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Tap your page: change a part by tapping it on your page"
        >
          <Ionicons name="hand-left-outline" size={18} color={P.text} />
          <View style={styles.coloursText}>
            <Text style={[styles.tapEditTitle, { color: P.text }]}>Tap Your Page</Text>
            <Text style={[styles.sectionSubFlat, { color: P.sub }]}>See your page and tap the part you want to change.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={P.sub} />
        </TouchableOpacity>
        {CUSTOM_PARTS.map(part => (
          <View key={part.key} style={styles.group}>
            <Text style={[styles.groupLabel, { color: P.sub }]}>{part.label}</Text>
            <CustomPartPicker
              part={part.key}
              choices={choices}
              active={active}
              onPick={(key, value) => guard(() => onChange(withPart(choices, key, value)))()}
              P={P}
            />
          </View>
        ))}
      </View>

      {/* 3 · Fonts */}
      <View style={sectionStyle}>
        <Text style={[styles.sectionTitle, { color: P.text }]}>Fonts</Text>
        <Text style={[styles.sectionSub, { color: P.sub }]}>Your name, your headings and your text.</Text>
        <View style={[styles.segment, { backgroundColor: P.surface }]}>
          {(['sets', 'mix'] as const).map(key => {
            const selected = mode === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.segmentOption, selected && { backgroundColor: P.card }]}
                onPress={() => { tap(); setMode(key); }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.segmentLabel, { color: selected ? P.text : P.sub }]}>{key === 'sets' ? 'Font Sets' : 'Mix Your Own'}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {mode === 'sets' ? (
          FONT_SET_COLLECTIONS.map(collection => (
            <View key={collection.key} style={styles.group}>
              <Text style={[styles.groupLabel, { color: P.sub }]}>{collection.name.toUpperCase()}</Text>
              {/* One swipeable row per collection, so each set keeps room to show its fonts. */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.setScroll}
                contentContainerStyle={styles.setRow}
              >
                {FONT_SETS.filter(fontSet => fontSet.collection === collection.key).map(fontSet => {
                  const selected = active && current?.key === fontSet.key;
                  const heading = customHeadingFont(fontSet.heading);
                  const text = customTextFont(fontSet.text);
                  return (
                    <TouchableOpacity
                      key={fontSet.key}
                      style={[styles.setCard, { backgroundColor: P.surface, borderColor: selected ? P.text : P.border }, selected && styles.selectedBorder]}
                      onPress={guard(() => {
                        onBrandFontChange(fontSet.nameFont);
                        onChange({ ...choices, heading: fontSet.heading, text: fontSet.text });
                      })}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${fontSet.name} fonts`}
                    >
                      <Text
                        style={[styles.setName, {
                          color: P.text,
                          fontFamily: resolveProviderFontFamily(fontSet.nameFont),
                          fontSize: Math.round(17 * resolveProviderFontScale(fontSet.nameFont)),
                          lineHeight: Math.round(17 * resolveProviderFontScale(fontSet.nameFont) * 1.55),
                        }]}
                        numberOfLines={1}
                      >
                        {fontSet.name}
                      </Text>
                      <Text style={[styles.setHeading, { color: P.text, fontFamily: heading.fontFamily, fontSize: Math.round(14 * (heading.sizeScale ?? 1)) }]} numberOfLines={1}>Services</Text>
                      <Text style={[styles.setText, { color: P.sub, fontFamily: text.fontFamily }]} numberOfLines={1}>Your text</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          ))
        ) : (
          <>
            <FontRow
              label="YOUR NAME"
              fonts={PROVIDER_FONTS.map(font => ({ key: font.key, name: font.name, fontFamily: font.fontFamily, sizeScale: font.sizeScale }))}
              value={active ? brandFont : null}
              onPick={key => guard(() => onBrandFontChange(key))()}
              P={P}
            />
            <FontRow
              label="HEADINGS"
              fonts={CUSTOM_HEADING_FONTS}
              value={active ? choices.heading : null}
              onPick={key => set({ heading: key })()}
              P={P}
            />
            <FontRow
              label="TEXT"
              fonts={CUSTOM_TEXT_FONTS}
              value={active ? choices.text : null}
              onPick={key => set({ text: key })()}
              P={P}
            />
          </>
        )}
      </View>

      {/* 4 · Corners */}
      <View style={sectionStyle}>
        <Text style={[styles.sectionTitle, { color: P.text }]}>Finishing Touches</Text>
        <Text style={[styles.groupLabel, styles.touchLabel, { color: P.sub }]}>CORNERS</Text>
        <View style={[styles.segment, { backgroundColor: P.surface }]}>
          {CARD_SHAPES.map(shape => {
            const selected = cardShape === shape.key;
            return (
              <TouchableOpacity
                key={shape.key}
                style={[styles.segmentOption, selected && { backgroundColor: P.card }]}
                onPress={guard(() => onCardShapeChange(shape.key))}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.segmentLabel, { color: selected ? P.text : P.sub }]}>{shape.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Colours live in their own part, so there is one place to set them. */}
      <TouchableOpacity
        style={[sectionStyle, styles.coloursRow]}
        onPress={() => { tap(); onOpenColours(); }}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Your colours are set in Colours. Open Colours"
      >
        <View style={styles.coloursText}>
          <Text style={[styles.sectionTitle, { color: P.text }]}>Colours</Text>
          <Text style={[styles.sectionSubFlat, { color: P.sub }]}>Your page uses the colours you set in Colours.</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={P.sub} />
      </TouchableOpacity>
    </View>
  );
}

/**
 * One part's choices in a row you swipe through. Used in the Custom tab and
 * in the preview's Tap Your Page panel, so both offer the same choices.
 * `bleed` is the padding of whatever it sits in, so the row runs edge to edge.
 */
export function CustomPartPicker({
  part,
  choices,
  active,
  onPick,
  P,
  bleed = 18,
}: {
  part: CustomPartKey;
  choices: CustomChoices;
  active: boolean;
  onPick: (part: CustomPartKey, value: string) => void;
  P: CustomPageMakerPalette;
  bleed?: number;
}) {
  const config = CUSTOM_PARTS.find(p => p.key === part);
  if (!config) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -bleed }}
      contentContainerStyle={[styles.setRow, { paddingHorizontal: bleed }]}
    >
      {config.options.map(option => {
        const selected = active && choices[part] === option.key;
        return (
          <TouchableOpacity
            key={option.key}
            style={[styles.partChip, { backgroundColor: P.surface, borderColor: selected ? P.text : P.border }, selected && styles.selectedBorder]}
            onPress={() => { tap(); onPick(part, option.key); }}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${config.name}: ${option.name}. ${option.description}`}
          >
            <Text style={[styles.optionName, { color: P.text }]} numberOfLines={1}>{option.name}</Text>
            <Text style={[styles.optionDesc, { color: P.sub }]} numberOfLines={2}>{option.description}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

/** One wrapping row of font names, each drawn in its own font. */
function FontRow({
  label,
  fonts,
  value,
  onPick,
  P,
}: {
  label: string;
  fonts: readonly { key: string; name: string; fontFamily: string; sizeScale?: number | undefined }[];
  value: string | null;
  onPick: (key: string) => void;
  P: CustomPageMakerPalette;
}) {
  return (
    <View style={styles.group}>
      <Text style={[styles.groupLabel, { color: P.sub }]}>{label}</Text>
      <View style={styles.chipWrap}>
        {fonts.map(font => {
          const selected = value === font.key;
          const size = Math.round(15 * (font.sizeScale ?? 1));
          return (
            <TouchableOpacity
              key={font.key}
              style={[styles.chip, { backgroundColor: P.surface, borderColor: selected ? P.text : P.border }, selected && styles.selectedBorder]}
              onPress={() => onPick(font.key)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={font.name}
            >
              <Text style={{ color: P.text, fontFamily: font.fontFamily, fontSize: size, lineHeight: Math.round(size * 1.55) }}>{font.name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

/** A small drawing of each layout: where the name sits and what the sections sit on. */
function LayoutSketch({ layout, accent, surface, line, card }: { layout: CustomLayout; accent: string; surface: string; line: string; card: string }) {
  return (
    <View style={[styles.sketch, { backgroundColor: surface }]}>
      {layout === 'plain' && (
        <>
          <View style={[styles.sketchPhoto, { backgroundColor: line }]} />
          <View style={[styles.sketchLogo, styles.sketchCentre, { backgroundColor: accent }]} />
          <View style={[styles.sketchName, styles.sketchCentre, { backgroundColor: accent }]} />
          <View style={[styles.sketchRule, { backgroundColor: line }]} />
          <View style={[styles.sketchText, { backgroundColor: line }]} />
          <View style={[styles.sketchRule, { backgroundColor: line }]} />
          <View style={[styles.sketchText, { backgroundColor: line }]} />
        </>
      )}
      {layout === 'cards' && (
        <>
          <View style={styles.sketchRow}>
            <View style={[styles.sketchLogo, { backgroundColor: accent, marginTop: 0 }]} />
            <View style={[styles.sketchName, { backgroundColor: accent, width: 30 }]} />
          </View>
          <View style={[styles.sketchCard, { backgroundColor: card }]} />
          <View style={[styles.sketchCard, { backgroundColor: card }]} />
          <View style={[styles.sketchCard, { backgroundColor: card }]} />
        </>
      )}
      {layout === 'bigName' && (
        <>
          <View style={[styles.sketchBig, { backgroundColor: accent, width: '85%' }]} />
          <View style={[styles.sketchBig, { backgroundColor: accent, width: '55%' }]} />
          <View style={[styles.sketchText, { backgroundColor: line }]} />
          <View style={[styles.sketchRule, { backgroundColor: line, marginTop: 8 }]} />
          <View style={[styles.sketchText, { backgroundColor: line }]} />
        </>
      )}
      {layout === 'banner' && (
        <>
          <View style={[styles.sketchBand, { backgroundColor: accent }]} />
          <View style={[styles.sketchBox, { borderColor: line }]} />
          <View style={[styles.sketchBox, { borderColor: line }]} />
          <View style={[styles.sketchBox, styles.sketchBoxShort, { borderColor: line }]} />
        </>
      )}
      {layout === 'soft' && (
        <>
          <View style={[styles.sketchLogo, styles.sketchCentre, { backgroundColor: accent, marginTop: 0 }]} />
          <View style={[styles.sketchName, styles.sketchCentre, { backgroundColor: accent }]} />
          <View style={[styles.sketchCard, styles.sketchSoft, { backgroundColor: card }]} />
          <View style={[styles.sketchCard, styles.sketchSoft, { backgroundColor: card }]} />
        </>
      )}
      {layout === 'bigBoxes' && (
        <>
          <View style={[styles.sketchBig, { backgroundColor: accent, width: '80%' }]} />
          <View style={[styles.sketchBox, styles.sketchBoxRound, { borderColor: line }]} />
          <View style={[styles.sketchBox, styles.sketchBoxRound, { borderColor: line }]} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  lockedAll: { opacity: 0.6 },
  section: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  sectionTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 14, marginBottom: 4 },
  sectionSub: { fontFamily: 'Jura-VariableFont_wght', fontWeight: '700', fontSize: 12, marginBottom: 16, opacity: 0.8 },
  sectionSubFlat: { fontFamily: 'Jura-VariableFont_wght', fontWeight: '700', fontSize: 12, opacity: 0.8, flexShrink: 1 },
  activeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  useBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, minHeight: 46 },
  useBtnText: { fontFamily: 'BakbakOne-Regular', fontSize: 14, color: '#FFFFFF' },
  layoutGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  layoutOption: { width: '47%', flexGrow: 1, borderWidth: 1, borderRadius: 14, padding: 10 },
  selectedBorder: { borderWidth: 2 },
  optionName: { fontFamily: 'BakbakOne-Regular', fontSize: 13, marginTop: 8 },
  optionDesc: { fontFamily: 'Jura-VariableFont_wght', fontWeight: '700', fontSize: 11, marginTop: 2 },
  segment: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: 12, marginBottom: 6 },
  segmentOption: { flex: 1, minHeight: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentLabel: { fontFamily: 'BakbakOne-Regular', fontSize: 12 },
  group: { marginTop: 14 },
  groupLabel: { fontFamily: 'Jura-VariableFont_wght', fontWeight: '800', fontSize: 10, letterSpacing: 1.6, marginBottom: 8 },
  touchLabel: { marginTop: 12 },
  // Bleeds to the section card's edges (its padding is 18) so the row scrolls edge to edge.
  setScroll: { marginHorizontal: -18 },
  setRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 18 },
  setCard: { width: 132, borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 10, minHeight: 92 },
  setName: { paddingHorizontal: 3 },
  setHeading: { marginTop: 2 },
  setText: { fontSize: 11, marginTop: 2 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4, minHeight: 40, justifyContent: 'center' },
  coloursRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  coloursText: { flex: 1 },
  // Layout drawings
  sketch: { height: 92, borderRadius: 10, padding: 8, gap: 4, overflow: 'hidden' },
  sketchPhoto: { height: 20, marginHorizontal: -8, marginTop: -8 },
  sketchLogo: { width: 14, height: 14, borderRadius: 7, marginTop: -10 },
  sketchCentre: { alignSelf: 'center' },
  sketchName: { width: '55%', height: 5, borderRadius: 2 },
  sketchRule: { height: StyleSheet.hairlineWidth * 2, marginTop: 4 },
  sketchText: { width: '60%', height: 4, borderRadius: 2 },
  sketchRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sketchCard: { height: 14, borderRadius: 4 },
  sketchBig: { height: 10, borderRadius: 2 },
  sketchBand: { height: 22, marginHorizontal: -8, marginTop: -8 },
  sketchBox: { height: 14, borderWidth: 1, borderRadius: 4 },
  sketchBoxShort: { height: 10 },
  sketchSoft: { height: 18, borderRadius: 8 },
  sketchBoxRound: { height: 16, borderRadius: 8 },
});
