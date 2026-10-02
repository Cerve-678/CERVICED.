import {
  clampTextScale,
  snapTextScaleToStep,
  labelForTextScale,
  fontFamilyForChoice,
  isFontChoiceKey,
  isLanguageCode,
  isRegionCode,
  TEXT_SCALE_STEPS,
  DEFAULT_TEXT_SCALE,
} from '../utils/displaySettings';

describe('displaySettings pure helpers', () => {
  describe('clampTextScale', () => {
    it('leaves an in-range value untouched', () => {
      expect(clampTextScale(1.15)).toBe(1.15);
    });

    it('clamps below the minimum step', () => {
      expect(clampTextScale(0.5)).toBe(TEXT_SCALE_STEPS[0]!.value);
    });

    it('clamps above the maximum step', () => {
      expect(clampTextScale(3)).toBe(TEXT_SCALE_STEPS[TEXT_SCALE_STEPS.length - 1]!.value);
    });

    it('falls back to the default for a non-finite value (corrupt storage)', () => {
      expect(clampTextScale(NaN)).toBe(DEFAULT_TEXT_SCALE);
      expect(clampTextScale(Number('not-a-number'))).toBe(DEFAULT_TEXT_SCALE);
    });
  });

  describe('snapTextScaleToStep', () => {
    it('snaps to the nearest discrete step', () => {
      expect(snapTextScaleToStep(0.9)).toBe(0.85);
      expect(snapTextScaleToStep(1.06)).toBe(1.0);
      expect(snapTextScaleToStep(1.1)).toBe(1.15);
      expect(snapTextScaleToStep(1.9)).toBe(1.3);
    });

    it('snaps a clamped out-of-range value', () => {
      expect(snapTextScaleToStep(-5)).toBe(0.85);
    });
  });

  describe('labelForTextScale', () => {
    it('returns the label of the nearest step', () => {
      expect(labelForTextScale(1.0)).toBe('Default');
      expect(labelForTextScale(0.85)).toBe('Small');
      expect(labelForTextScale(1.3)).toBe('Larger');
    });
  });

  describe('fontFamilyForChoice', () => {
    it('resolves a known font to its bundled family', () => {
      expect(fontFamilyForChoice('jura')).toBe('Jura-VariableFont_wght');
      expect(fontFamilyForChoice('prata')).toBe('Prata-Regular');
    });

    it('resolves system to undefined (platform default)', () => {
      expect(fontFamilyForChoice('system')).toBeUndefined();
    });
  });

  describe('validators reject unknown persisted values', () => {
    it('isFontChoiceKey', () => {
      expect(isFontChoiceKey('jura')).toBe(true);
      expect(isFontChoiceKey('comic-sans')).toBe(false);
    });

    it('isLanguageCode', () => {
      expect(isLanguageCode('en')).toBe(true);
      expect(isLanguageCode('xx')).toBe(false);
    });

    it('isRegionCode', () => {
      expect(isRegionCode('GB')).toBe(true);
      expect(isRegionCode('ZZ')).toBe(false);
    });
  });
});
