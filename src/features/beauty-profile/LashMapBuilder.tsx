// src/features/beauty-profile/LashMapBuilder.tsx
//
// The client's lash map (owner, 2026-11-27: "lash map is like 16mm, 14, 14,
// 14, 12 … someone could want 16 at the end, so we could have a lash
// building itself when they select it"). Five zones, inner corner to outer,
// each a length in mm. The drawing grows to the new lengths whenever the map
// changes, inner corner first, so picking a start shape or nudging a zone
// visibly builds the lash.
//
// LashMapDrawing is the picture alone; the provider's view of the profile
// shows it too, read-only.

import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import type { AppTheme } from '../../constants/theme';
import {
  LASH_MAP_MAX_MM, LASH_MAP_MIN_MM, LASH_MAP_PRESETS, LASH_MAP_ZONES, formatLashMap,
} from './options';

// ── Geometry ─────────────────────────────────────────────────────────────────

const VIEW_W = 300;
const VIEW_H = 150;
/** The upper lash line, inner corner (left) to outer corner (right). */
const LID = { x0: 24, y0: 120, cx: 150, cy: 56, x1: 276, y1: 108 };
const STRANDS = 31;
const PX_PER_MM = 4.2;
/** The length the faint guide lashes show before any map is set. */
const GUIDE_MM = 10;

/** How far a lash's tip turns up, from the client's lash curl answer. */
function curlAmount(curl: string | null | undefined): number {
  const c = (curl ?? '').trim();
  if (c.startsWith('CC')) return 0.42;
  if (c.startsWith('J')) return 0.12;
  if (c.startsWith('B')) return 0.22;
  if (c.startsWith('C')) return 0.32;
  if (c.startsWith('D')) return 0.52;
  if (c.startsWith('L')) return 0.62;
  return 0.32;
}

/** Length in mm at a point along the lash line, blending between zone centres. */
function lengthAt(t: number, map: readonly number[]): number {
  const pos = t * map.length - 0.5;
  const i = Math.max(0, Math.min(map.length - 1, Math.floor(pos)));
  const j = Math.min(map.length - 1, i + 1);
  const f = Math.max(0, Math.min(1, pos - i));
  const a = map[i] ?? 0;
  const b = map[j] ?? a;
  return a + (b - a) * f;
}

/** One SVG path per lash, for these zone lengths. */
export function lashStrandPaths(map: readonly number[], curl?: string | null): string[] {
  const k = curlAmount(curl);
  const paths: string[] = [];
  for (let s = 0; s < STRANDS; s++) {
    const t = 0.03 + (0.94 * s) / (STRANDS - 1);
    const u = 1 - t;
    const bx = u * u * LID.x0 + 2 * u * t * LID.cx + t * t * LID.x1;
    const by = u * u * LID.y0 + 2 * u * t * LID.cy + t * t * LID.y1;
    // Tangent, then the normal that points up, away from the eye, tilted a
    // little toward the outer corner the further out the lash sits.
    const tx = 2 * u * (LID.cx - LID.x0) + 2 * t * (LID.x1 - LID.cx);
    const ty = 2 * u * (LID.cy - LID.y0) + 2 * t * (LID.y1 - LID.cy);
    const tl = Math.hypot(tx, ty) || 1;
    let nx = ty / tl;
    let ny = -tx / tl;
    const tilt = (t - 0.5) * 0.35;
    [nx, ny] = [nx * Math.cos(tilt) - ny * Math.sin(tilt), nx * Math.sin(tilt) + ny * Math.cos(tilt)];
    const len = lengthAt(t, map) * PX_PER_MM;
    if (len <= 0.5) continue;
    // The tip turns toward straight up by the curl amount.
    let dx = nx * (1 - k);
    let dy = ny * (1 - k) - k;
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl; dy /= dl;
    const cx = bx + nx * len * 0.5;
    const cy = by + ny * len * 0.5;
    const ex = bx + dx * len;
    const ey = by + dy * len;
    paths.push(`M${bx.toFixed(1)} ${by.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`);
  }
  return paths;
}

const LID_PATH = `M${LID.x0} ${LID.y0} Q${LID.cx} ${LID.cy} ${LID.x1} ${LID.y1}`;
const LOWER_LID_PATH = `M${LID.x0} ${LID.y0} Q150 168 ${LID.x1} ${LID.y1}`;
const GUIDE_MAP = Array.from({ length: LASH_MAP_ZONES }, () => GUIDE_MM);

// ── Growing to a new map ─────────────────────────────────────────────────────

const GROW_MS = 380;
const ZONE_STAGGER_MS = 70;
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

/** The map as drawn right now: it eases from whatever is showing to `target`,
 *  inner zone first. A new target mid-way starts from where the lash is. */
function useGrowingMap(target: readonly number[]): number[] {
  const goal = target.length === LASH_MAP_ZONES ? target : Array.from({ length: LASH_MAP_ZONES }, () => 0);
  const [shown, setShown] = useState<number[]>(() => Array.from({ length: LASH_MAP_ZONES }, () => 0));
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const key = goal.join(',');

  useEffect(() => {
    const from = shownRef.current.slice();
    const to = key.split(',').map(Number);
    const start = Date.now();
    let frame = 0;
    const step = () => {
      const elapsed = Date.now() - start;
      const next = to.map((end, i) => {
        const p = Math.max(0, Math.min(1, (elapsed - i * ZONE_STAGGER_MS) / GROW_MS));
        const begin = from[i] ?? 0;
        return begin + (end - begin) * easeOut(p);
      });
      setShown(next);
      if (elapsed < GROW_MS + ZONE_STAGGER_MS * (LASH_MAP_ZONES - 1)) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [key]);

  return shown;
}

// ── The picture ──────────────────────────────────────────────────────────────

interface DrawingProps {
  map: readonly number[];
  curl?: string | null;
  lashColor: string;
  lidColor: string;
  /** Shown when no map is set: faint lashes so the eye isn't bare. */
  guideColor: string;
  height?: number;
}

export function LashMapDrawing({ map, curl, lashColor, lidColor, guideColor, height = 120 }: DrawingProps) {
  const empty = map.length !== LASH_MAP_ZONES;
  const shown = useGrowingMap(map);
  const guide = empty ? lashStrandPaths(GUIDE_MAP, curl) : [];
  const strands = lashStrandPaths(shown, curl);
  return (
    <Svg
      width="100%"
      height={height}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      accessibilityLabel={empty ? 'Lash map not set' : `Lash map ${formatLashMap(map)}, inner corner to outer`}
    >
      {guide.map((d, i) => (
        <Path key={`g${i}`} d={d} stroke={guideColor} strokeWidth={1.4} strokeLinecap="round" fill="none" />
      ))}
      {strands.map((d, i) => (
        <Path key={`s${i}`} d={d} stroke={lashColor} strokeWidth={1.6} strokeLinecap="round" fill="none" />
      ))}
      <Path d={LOWER_LID_PATH} stroke={guideColor} strokeWidth={1.2} fill="none" />
      <Path d={LID_PATH} stroke={lidColor} strokeWidth={2.4} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

// ── The builder ──────────────────────────────────────────────────────────────

const ZONE_LABELS = ['Inner', '', 'Middle', '', 'Outer'];

interface BuilderProps {
  map: number[];
  curl: string;
  editing: boolean;
  onChange: (map: number[]) => void;
  P: AppTheme;
}

export function LashMapBuilder({ map, curl, editing, onChange, P }: BuilderProps) {
  const set = map.length === LASH_MAP_ZONES;
  const tap = () => Haptics.selectionAsync().catch(() => {});

  const nudge = (zone: number, by: 1 | -1) => {
    if (!editing) return;
    // The first nudge starts from the Natural shape, so there's a lash to change.
    const base = set ? map : [...(LASH_MAP_PRESETS[0]?.map ?? [])];
    const next = base.map((mm, i) =>
      i === zone ? Math.max(LASH_MAP_MIN_MM, Math.min(LASH_MAP_MAX_MM, mm + by)) : mm,
    );
    tap();
    onChange(next);
  };

  const presetOn = (preset: readonly number[]) => set && preset.every((mm, i) => map[i] === mm);

  return (
    <View>
      <View style={[styles.canvas, { backgroundColor: P.surface, borderColor: P.border }]}>
        <LashMapDrawing map={map} curl={curl} lashColor={P.text} lidColor={P.text} guideColor={P.border} />
        <Text style={[styles.mapText, { color: set ? P.text : P.sub }]}>
          {set ? formatLashMap(map) : 'Pick a start shape, or tap + to build it zone by zone'}
        </Text>
      </View>

      <View style={styles.zones}>
        {Array.from({ length: LASH_MAP_ZONES }, (_, i) => {
          const mm = set ? map[i] : null;
          return (
            <View key={i} style={styles.zone}>
              <TouchableOpacity
                style={[styles.stepBtn, { borderColor: P.border, backgroundColor: P.surface }]}
                onPress={() => nudge(i, 1)}
                disabled={!editing || mm === LASH_MAP_MAX_MM}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={`Zone ${i + 1} longer${mm ? `, now ${mm}mm` : ''}`}
              >
                <Text style={[styles.stepText, { color: P.text }]}>+</Text>
              </TouchableOpacity>
              <Text style={[styles.zoneMm, { color: mm ? P.text : P.sub }]}>{mm ? `${mm}` : '–'}</Text>
              <TouchableOpacity
                style={[styles.stepBtn, { borderColor: P.border, backgroundColor: P.surface }]}
                onPress={() => nudge(i, -1)}
                disabled={!editing || mm === LASH_MAP_MIN_MM}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={`Zone ${i + 1} shorter${mm ? `, now ${mm}mm` : ''}`}
              >
                <Text style={[styles.stepText, { color: P.text }]}>−</Text>
              </TouchableOpacity>
              <Text style={[styles.zoneLabel, { color: P.sub }]}>{ZONE_LABELS[i]}</Text>
            </View>
          );
        })}
      </View>

      {editing ? (
        <>
          <Text style={[styles.startLabel, { color: P.sub }]}>START FROM</Text>
          <View style={styles.chips}>
            {LASH_MAP_PRESETS.map(p => {
              const on = presetOn(p.map);
              return (
                <TouchableOpacity
                  key={p.name}
                  style={[styles.chip, { backgroundColor: on ? P.accentDim : P.surface, borderColor: on ? P.accent : P.border }]}
                  onPress={() => { tap(); onChange([...p.map]); }}
                  activeOpacity={0.5}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`Start from ${p.name}, ${formatLashMap(p.map)}`}
                >
                  <Text style={[styles.chipText, { color: on ? P.text : P.sub }]}>{p.name}</Text>
                </TouchableOpacity>
              );
            })}
            {set ? (
              <TouchableOpacity
                style={[styles.chip, { backgroundColor: P.surface, borderColor: P.border }]}
                onPress={() => { tap(); onChange([]); }}
                activeOpacity={0.5}
                accessibilityRole="button"
                accessibilityLabel="Clear lash map"
              >
                <Text style={[styles.chipText, { color: P.sub }]}>Clear</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas:     { borderWidth: 1, borderRadius: 14, paddingTop: 6, paddingBottom: 10, paddingHorizontal: 8, marginBottom: 10 },
  mapText:    { fontFamily: 'BakbakOne-Regular', fontSize: 12, letterSpacing: 1, textAlign: 'center', marginTop: 2 },
  zones:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  zone:       { flex: 1, alignItems: 'center', gap: 4 },
  stepBtn:    { width: 40, height: 30, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepText:   { fontFamily: 'BakbakOne-Regular', fontSize: 16, lineHeight: 18 },
  zoneMm:     { fontFamily: 'BakbakOne-Regular', fontSize: 15, minWidth: 24, textAlign: 'center' },
  zoneLabel:  { fontFamily: 'Jura-VariableFont_wght', fontSize: 10.5, minHeight: 14 },
  startLabel: { fontFamily: 'BakbakOne-Regular', fontSize: 9.5, letterSpacing: 1.5, marginBottom: 6 },
  // Same chip as the rest of the Beauty Profile editor.
  chips:      { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 24 },
  chip:       { borderRadius: 100, borderWidth: 1.5, paddingVertical: 9, paddingHorizontal: 15 },
  chipText:   { fontFamily: 'BakbakOne-Regular', fontSize: 12, letterSpacing: 0.7 },
});
