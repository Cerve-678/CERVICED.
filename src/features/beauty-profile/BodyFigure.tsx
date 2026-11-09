// src/features/beauty-profile/BodyFigure.tsx
//
// The "Map of you" figure (approved 2026-11-08): a gender-neutral outline
// with a pin per area, joined by a dashed leader line. Tapping a pin picks
// that area for the panel underneath. Four drawings, all from the approved
// mockup; "Portrait + hands" is the default. Zones only ever use the accent
// colour — never a skin colour.
//
// Everything is drawn in the mockup's 320 × 260 coordinate space and scaled
// to the width it's given, so pins and lines stay where the drawing put them.

import React, { memo, useId, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Line, Path, Rect } from 'react-native-svg';
import type { AppTheme } from '../../constants/theme';
import { FONT_DISPLAY, hapticSelection, type SemanticColors } from '../maintenance/ui';
import { AREA_PIN_LABEL, MAP_AREAS, type DueDot, type FigureKey, type MapArea } from './bodyMap';

const VB_W = 320;
const VB_H = 260;

interface Pin {
  /** Where the line meets the figure. */
  anchor: [number, number];
  /** Where the pin's label sits. */
  label: [number, number];
}

type Pins = Record<MapArea, Pin>;

const HAND = 'M12 70 L10 44 C9 38 14 36 17 40 L19 30 L18 14 C18 9 25 9 25 14 L26 28 L28 8 C28 3 35 3 35 8 L35 28 L38 12 C39 7 46 8 46 13 L44 30 L48 22 C50 18 56 21 54 26 L48 46 C45 58 44 64 44 70 Z';
const HALF_BODY = 'M92 62 C92 71 91 76 88 80 C72 83 60 88 56 102 C52 124 50 150 47 176 C46 184 44 190 42 196 C46 198 50 196 52 190 C56 178 59 160 62 140 C64 126 66 112 70 104 C70 140 70 176 73 214 C74 246 72 272 74 290 L92 290 C93 262 95 236 98 206 L100 200';

const PINS: Record<FigureKey, Pins> = {
  line: {
    hair: { anchor: [160, 16], label: [62, 26] },
    eyes: { anchor: [160, 32], label: [62, 74] },
    nails: { anchor: [114, 166], label: [62, 166] },
    skin: { anchor: [173, 41], label: [258, 48] },
    makeup: { anchor: [160, 47], label: [258, 92] },
    general: { anchor: [160, 104], label: [258, 140] },
  },
  portrait: {
    hair: { anchor: [134, 40], label: [62, 26] },
    eyes: { anchor: [140, 100], label: [62, 76] },
    nails: { anchor: [44, 200], label: [62, 158] },
    skin: { anchor: [194, 124], label: [258, 70] },
    makeup: { anchor: [168, 148], label: [258, 120] },
    general: { anchor: [220, 206], label: [258, 172] },
  },
  zones: {
    hair: { anchor: [120, 50], label: [62, 26] },
    eyes: { anchor: [140, 98], label: [62, 76] },
    nails: { anchor: [32, 214], label: [62, 158] },
    skin: { anchor: [196, 130], label: [258, 70] },
    makeup: { anchor: [172, 146], label: [258, 120] },
    general: { anchor: [224, 224], label: [258, 172] },
  },
  segments: {
    hair: { anchor: [136, 58], label: [62, 26] },
    eyes: { anchor: [134, 96], label: [62, 76] },
    nails: { anchor: [48, 208], label: [62, 158] },
    skin: { anchor: [196, 126], label: [258, 70] },
    makeup: { anchor: [170, 150], label: [258, 120] },
    general: { anchor: [212, 214], label: [258, 172] },
  },
};

interface DrawProps {
  P: AppTheme;
  /** The picked area, filled in solid on the zone drawings. */
  area: MapArea | null;
  clipId: string;
}

/** A zone's fill: the accent, faint; the picked one strong; hair a touch stronger. */
function zone(P: AppTheme, area: MapArea | null, key: MapArea, strong = false) {
  return {
    fill: P.accent,
    fillOpacity: area === key ? 0.6 : strong ? 0.24 : 0.12,
    stroke: P.bg,
    strokeWidth: 2.5,
  };
}

function LineFigure({ P }: DrawProps) {
  return (
    <G transform="translate(77 4) scale(.83)" stroke={P.sub} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M100 13 C113 13 121 24 121 38 C121 54 112 65 100 65 C88 65 79 54 79 38 C79 24 87 13 100 13 Z" />
      <Path d="M80 34 C78 14 92 6 100 6 C110 6 122 14 120 34" />
      <Path d={HALF_BODY} />
      <Path d={HALF_BODY} transform="translate(200 0) scale(-1 1)" />
    </G>
  );
}

function PortraitFigure({ P }: DrawProps) {
  return (
    <G stroke={P.sub} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M108 94 C102 50 130 28 160 28 C190 28 218 50 212 94 C204 70 188 58 160 58 C132 58 116 70 108 94 Z" />
      <Path d="M110 96 C110 140 132 168 160 168 C188 168 210 140 210 96" />
      <Path d="M110 104 C102 104 102 122 110 122 M210 104 C218 104 218 122 210 122" />
      <Path d="M138 160 L138 188 C116 192 94 198 84 214 L80 260 M182 160 L182 188 C204 192 226 198 236 214 L240 260" />
      <Path d="M128 102 q12 -9 24 0 M168 102 q12 -9 24 0 M124 88 q16 -10 30 -3 M166 85 q14 -7 30 3 M160 110 q-5 14 -1 22 q5 3 9 -1 M147 148 q13 -7 26 0 q-13 13 -26 0 Z" />
      <Path transform="translate(12 190)" d={HAND} />
      <Path transform="translate(308 190) scale(-1 1)" d={HAND} />
    </G>
  );
}

function ZonesFigure({ P, area }: DrawProps) {
  return (
    <G>
      <Path {...zone(P, area, 'general')} d="M138 166 L138 190 C108 196 76 204 64 232 L60 260 L260 260 L256 232 C244 204 212 196 182 190 L182 166 Z" />
      <Path {...zone(P, area, 'hair', true)} d="M104 100 C96 50 128 20 160 20 C192 20 224 50 216 100 C214 118 210 128 206 132 C204 100 190 70 160 66 C130 70 116 100 114 132 C110 128 106 118 104 100 Z" />
      <Path {...zone(P, area, 'skin')} d="M114 100 C114 70 134 62 160 62 C186 62 206 70 206 100 C206 138 188 166 160 168 C132 166 114 138 114 100 Z" />
      <Path {...zone(P, area, 'eyes')} d="M126 90 C136 82 184 82 194 90 C194 108 184 112 160 112 C136 112 126 108 126 90 Z" />
      <Ellipse {...zone(P, area, 'makeup')} cx={160} cy={146} rx={16} ry={8} />
      <Path {...zone(P, area, 'nails')} transform="translate(2 188)" d={HAND} />
      <Path {...zone(P, area, 'nails')} transform="translate(318 188) scale(-1 1)" d={HAND} />
    </G>
  );
}

const BAR_HEIGHTS = [30, 40, 44, 38, 26];

function SegmentsFigure({ P, area, clipId }: DrawProps) {
  const nails = zone(P, area, 'nails');
  return (
    <G>
      <Defs>
        <ClipPath id={clipId}>
          <Circle cx={160} cy={100} r={58} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${clipId})`}>
        <Rect {...zone(P, area, 'hair', true)} strokeWidth={0} x={90} y={42} width={140} height={36} />
        <Rect {...zone(P, area, 'eyes')} strokeWidth={0} x={90} y={82} width={140} height={28} />
        <Rect {...zone(P, area, 'skin')} strokeWidth={0} x={90} y={114} width={140} height={24} />
        <Rect {...zone(P, area, 'makeup')} strokeWidth={0} x={90} y={142} width={140} height={16} />
      </G>
      <Path {...zone(P, area, 'general')} d="M96 186 C96 178 104 174 112 174 L208 174 C216 174 224 178 224 186 L234 254 L86 254 Z" />
      {BAR_HEIGHTS.map((h, i) => (
        <React.Fragment key={i}>
          <Rect {...nails} x={26 + 10 * i} y={250 - h} width={7} height={h} rx={3.5} />
          <Rect {...nails} x={320 - 26 - 10 * i - 7} y={250 - h} width={7} height={h} rx={3.5} />
        </React.Fragment>
      ))}
    </G>
  );
}

const DRAWINGS: Record<FigureKey, (p: DrawProps) => React.ReactElement> = {
  line: LineFigure,
  portrait: PortraitFigure,
  zones: ZonesFigure,
  segments: SegmentsFigure,
};

/** Just the outline, no pins, for the Change figure sheet. */
export const FigureThumb = memo(function FigureThumb({ figure, P, width }: { figure: FigureKey; P: AppTheme; width: number }) {
  const clipId = `thumb-${useId().replace(/:/g, '')}`;
  const Draw = DRAWINGS[figure];
  return (
    <Svg width={width} height={(width * VB_H) / VB_W} viewBox={`0 0 ${VB_W} ${VB_H}`}>
      <Draw P={P} area={null} clipId={clipId} />
    </Svg>
  );
});

interface BodyMapProps {
  figure: FigureKey;
  area: MapArea;
  onPick: (area: MapArea) => void;
  P: AppTheme;
  S: SemanticColors;
  /** Due dots per area; only drawn when the client turned them on. */
  dots?: Partial<Record<MapArea, DueDot>> | undefined;
}

/** Pins are laid out in a box this wide, centred on their label point. */
const PIN_BOX = 132;

export function BodyMap({ figure, area, onPick, P, S, dots }: BodyMapProps) {
  const [width, setWidth] = useState(0);
  const clipId = `map-${useId().replace(/:/g, '')}`;
  const Draw = DRAWINGS[figure];
  const pins = PINS[figure];
  const height = (width * VB_H) / VB_W;
  const k = width / VB_W;

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== width) setWidth(w);
  };

  return (
    <View style={[styles.wrap, { height: height || undefined, aspectRatio: VB_W / VB_H }]} onLayout={onLayout}>
      {width > 0 ? (
        <>
          <Svg width={width} height={height} viewBox={`0 0 ${VB_W} ${VB_H}`} style={StyleSheet.absoluteFill}>
            <Draw P={P} area={area} clipId={clipId} />
            {MAP_AREAS.map((key) => {
              const { anchor, label } = pins[key];
              // The line stops at the near edge of the label (roughly its width in drawing units).
              const half = (14 + AREA_PIN_LABEL[key].length * 6.3) / 2;
              const x1 = label[0] + (anchor[0] > label[0] ? half : -half);
              return (
                <G key={key}>
                  <Line x1={x1} y1={label[1]} x2={anchor[0]} y2={anchor[1]} stroke={P.border} strokeWidth={1} strokeDasharray="2 2" />
                  <Circle cx={anchor[0]} cy={anchor[1]} r={2.6} fill={P.accent} />
                </G>
              );
            })}
          </Svg>
          {MAP_AREAS.map((key) => {
            const [lx, ly] = pins[key].label;
            const on = key === area;
            const dot = dots?.[key];
            return (
              <View
                key={key}
                pointerEvents="box-none"
                style={[styles.pinBox, { left: lx * k - PIN_BOX / 2, top: ly * k - 16, width: PIN_BOX }]}
              >
                <TouchableOpacity
                  style={[
                    styles.pin,
                    on
                      ? { backgroundColor: P.accent, borderColor: P.accent }
                      : { backgroundColor: P.card, borderColor: P.border },
                  ]}
                  onPress={() => { hapticSelection(); onPick(key); }}
                  activeOpacity={0.7}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${AREA_PIN_LABEL[key]}${dot === 'bad' ? ', something overdue' : dot === 'warn' ? ', something due soon' : ''}`}
                >
                  <Text style={[styles.pinText, { color: on ? P.onAccent : P.text }]}>{AREA_PIN_LABEL[key]}</Text>
                  {dot ? <View style={[styles.dot, { backgroundColor: dot === 'bad' ? S.bad : S.warn }]} /> : null}
                </TouchableOpacity>
              </View>
            );
          })}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', marginBottom: 6 },
  pinBox: { position: 'absolute', height: 32, alignItems: 'center', justifyContent: 'center' },
  pin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 100,
    paddingVertical: 6,
    paddingHorizontal: 10,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  pinText: { fontFamily: FONT_DISPLAY, fontSize: 10, letterSpacing: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
