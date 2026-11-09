import { DURATION_PRESETS } from '../features/provider-registration/DurationPicker';
import {
  minutesToServiceDuration,
  serviceDurationToMinutes,
} from '../services/providerRegistrationService';

describe('service duration presets', () => {
  it('saves each preset as the minutes it says', () => {
    expect(DURATION_PRESETS.map(serviceDurationToMinutes)).toEqual([
      15, 30, 45, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360, 420, 480,
    ]);
  });

  it('reloads a saved preset as the same chip, so it shows selected', () => {
    for (const preset of DURATION_PRESETS) {
      expect(minutesToServiceDuration(serviceDurationToMinutes(preset))).toBe(preset);
    }
  });

  it('still reads older labels saved before the picker', () => {
    expect(serviceDurationToMinutes('1 hr 30 mins')).toBe(90);
    expect(serviceDurationToMinutes('2 hours 15 min')).toBe(135);
    expect(serviceDurationToMinutes('1.5 hours')).toBe(90);
    expect(serviceDurationToMinutes('2hrs')).toBe(120);
    expect(serviceDurationToMinutes('90 mins')).toBe(90);
    expect(serviceDurationToMinutes('45')).toBe(45);
    expect(serviceDurationToMinutes('')).toBe(60);
  });
});
