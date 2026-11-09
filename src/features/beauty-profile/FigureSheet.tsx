// src/features/beauty-profile/FigureSheet.tsx
//
// "Change figure": the four outlines from the approved mockup, plus the due
// dots switch (off by default). Picking one closes the sheet.

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { AppTheme } from '../../constants/theme';
import type { TranslationKey, TranslationParams } from '../../i18n';
import { FONT_DISPLAY, Sheet, SwitchRow, hapticSelection, ui } from '../maintenance/ui';
import { FIGURE_KEYS, FIGURE_NAMES, type FigurePrefs } from './bodyMap';
import { FigureThumb } from './BodyFigure';

type T = (key: TranslationKey, params?: TranslationParams) => string;

interface Props {
  visible: boolean;
  prefs: FigurePrefs;
  onChange: (next: FigurePrefs) => void;
  onClose: () => void;
  P: AppTheme;
  t: T;
}

const THUMB = 132;

export function FigureSheet({ visible, prefs, onChange, onClose, P, t }: Props) {
  return (
    <Sheet visible={visible} onClose={onClose} P={P}>
      <Text style={[ui.sheetTitle, { color: P.text }]}>{t('beautyProfile.figure.title')}</Text>
      <Text style={[ui.body, { color: P.sub }]}>{t('beautyProfile.figure.sub')}</Text>
      <View style={styles.grid}>
        {FIGURE_KEYS.map((key) => {
          const on = prefs.figure === key;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.thumb, { backgroundColor: P.card, borderColor: on ? P.accent : P.border }, on && styles.thumbOn]}
              onPress={() => { hapticSelection(); onChange({ ...prefs, figure: key }); onClose(); }}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={FIGURE_NAMES[key]}
            >
              <FigureThumb figure={key} P={P} width={THUMB} />
              <Text style={[styles.name, { color: on ? P.text : P.sub }]}>{FIGURE_NAMES[key].toUpperCase()}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <SwitchRow
        title={t('beautyProfile.figure.dueDots')}
        sub={t('beautyProfile.figure.dueDotsSub')}
        value={prefs.dueDots}
        onChange={(v) => onChange({ ...prefs, dueDots: v })}
        P={P}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  thumb: { borderWidth: 1.5, borderRadius: 16, padding: 8, alignItems: 'center', gap: 6 },
  thumbOn: { borderWidth: 2 },
  name: { fontFamily: FONT_DISPLAY, fontSize: 10, letterSpacing: 1 },
});
