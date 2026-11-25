import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BeautyProfileLanding } from '../features/beauty-profile/BeautyProfileLanding';
import { NextUpCard } from '../features/maintenance/NextUpCard';
import { MaintenanceHowTo } from '../features/maintenance/MaintenanceHowTo';
import { groupMaintenanceItems, nextUpFrom } from '../features/maintenance/presentation';
import type { MaintenanceState } from '../features/maintenance/useMaintenance';
import { semanticColors } from '../features/maintenance/ui';
import { clientLightTheme } from '../constants/theme';
import type { AppTheme } from '../constants/theme';
import { EMPTY_BEAUTY_DATA, type BeautyData } from '../types/beautyProfile';
import type { MaintenanceItem } from '../types/maintenance';
import { computeBeautyProfileStats } from '../utils/beautyProfileStats';
import { dateToYMD } from '../utils/dateUtils';

jest.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({ isDarkMode: false, palette: jest.requireActual('../constants/theme').clientLightTheme, theme: {} }),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));
jest.mock('../components/ThemedBackground', () => {
  const { View } = jest.requireActual('react-native');
  return { ThemedBackground: View };
});
jest.mock('../components/FocusAwareStatusBar', () => ({ FocusAwareStatusBar: () => null }));
jest.mock('../i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => (params ? `${key} ${JSON.stringify(params)}` : key),
  }),
}));

const P = clientLightTheme as unknown as AppTheme;
const S = semanticColors(false);
const t = (key: string, params?: Record<string, string | number>) =>
  params ? `${key} ${JSON.stringify(params)}` : key;

const NONE = { serviceIds: new Set<string>(), providerIds: new Set<string>() };

function item(p: Partial<MaintenanceItem>): MaintenanceItem {
  const today = dateToYMD(new Date());
  return {
    id: 'x', kind: 'service', origin: 'booking', title: 'Lash infill', typeKey: 'lash_infill',
    providerId: 'p1', serviceId: 's1', providerName: 'Lash Lab', repeatWeeks: 3, intervalEdited: false,
    intervalSource: 'default', learnedDays: null, learnedFrom: null,
    lastDoneOn: today, dueOn: today, eventOn: null, paused: false,
    note: null, createdAt: `${today}T10:00:00Z`, ...p,
  };
}

function maintenanceState(items: MaintenanceItem[]): MaintenanceState {
  const noop = () => Promise.resolve();
  return {
    loading: false, error: false, items, settings: null,
    context: { prep: [], aftercare: [], upcomingServiceIds: [], upcomingProviderIds: [], pastProviders: [] } as never,
    coverage: NONE, remindersOn: null,
    reload: noop, addItems: noop, updateItem: noop, deleteItem: noop, saveSettings: noop, setRemindersOn: noop,
  };
}

function renderLanding(profile: Partial<BeautyData>, items: MaintenanceItem[] = [], handlers: Partial<React.ComponentProps<typeof BeautyProfileLanding>> = {}) {
  const data = { ...EMPTY_BEAUTY_DATA, ...profile };
  return render(
    <BeautyProfileLanding
      firstName="Jess"
      profile={data}
      stats={computeBeautyProfileStats(data)}
      maintenance={maintenanceState(items)}
      circle={{ isPrivate: true, requests: 0 }}
      onBack={jest.fn()}
      onEditCategory={jest.fn()}
      onOpenAllProfile={jest.fn()}
      onOpenMaintenance={jest.fn()}
      onOpenSetup={jest.fn()}
      onOpenCircle={jest.fn()}
      onBook={jest.fn()}
      busyItemId={null}
      todo={[]}
      onOpenTodoField={jest.fn()}
      onOpenAccountDetails={jest.fn()}
      onFindIdea={jest.fn()}
      {...handlers}
    />,
  );
}

describe('the Beauty Profile landing (design C)', () => {
  it('says hello, heads the cards "Your Beauty Profile", and shows each area\'s answer', () => {
    renderLanding({ hairType: ['Curly 3B'], skinType: ['Combination'], nailShape: ['Almond'], nailLength: ['Medium'] });
    expect(screen.getByText('BEAUTYPROFILE.HELLO.TITLE {"NAME":"JESS"}')).toBeTruthy();
    expect(screen.getByText('PROFILE.FORYOU.BEAUTY.TITLE')).toBeTruthy();
    // On the Hair card, and in Your look's title too.
    expect(screen.getAllByText('CURLY 3B').length).toBeGreaterThan(0);
    expect(screen.getByText('COMBINATION')).toBeTruthy();
    expect(screen.getByText('ALMOND · MEDIUM')).toBeTruthy();
  });

  it('opens the editor for the card tapped', () => {
    const onEditCategory = jest.fn();
    renderLanding({ hairType: ['Curly 3B'] }, [], { onEditCategory });
    fireEvent.press(screen.getByLabelText('beautyProfile.hello.hair, Curly 3B'));
    expect(onEditCategory).toHaveBeenCalledWith('hair');
  });

  it('asks to finish Health & Safety until it is started', () => {
    renderLanding({});
    expect(screen.getByText('BEAUTYPROFILE.HELLO.FINISH')).toBeTruthy();
  });

  it('lists the schedule with Book on what is due', () => {
    const due = item({ id: 'd', title: 'Brow lamination' });
    const later = item({ id: 'l', title: 'Gel nails', dueOn: '2099-12-01' });
    const onBook = jest.fn();
    renderLanding({}, [later, due], { onBook });
    expect(screen.getByText('Brow lamination')).toBeTruthy();
    expect(screen.getByText('Gel nails')).toBeTruthy();
    expect(screen.getByText('beautyProfile.hello.scheduleSub {"done":1,"total":2}')).toBeTruthy();
    fireEvent.press(screen.getByText('beautyProfile.hello.book'));
    expect(onBook).toHaveBeenCalledWith(due);
  });

  it('offers setup when there is nothing on the schedule yet', () => {
    const onOpenSetup = jest.fn();
    renderLanding({}, [], { onOpenSetup });
    fireEvent.press(screen.getByText('beautyProfile.hello.scheduleEmpty'));
    expect(onOpenSetup).toHaveBeenCalled();
  });
});

describe('the big Maintenance card', () => {
  it('shows the countdown and runs Book, Done it and Snooze for the item', () => {
    const due = item({ id: 'd', title: 'Gel nails' });
    const nextUp = nextUpFrom(groupMaintenanceItems([due], dateToYMD(new Date()), NONE));
    const onBook = jest.fn();
    const onDone = jest.fn();
    const onSnooze = jest.fn();
    render(
      <NextUpCard nextUp={nextUp} P={P} t={t as never} onBook={onBook} onDone={onDone} onSnooze={onSnooze} busyItemId={null} />,
    );
    expect(screen.getByText('Gel nails')).toBeTruthy();
    fireEvent.press(screen.getByText('MAINTENANCE.ACTION.BOOK'));
    fireEvent.press(screen.getByText('MAINTENANCE.ACTION.DONEIT'));
    fireEvent.press(screen.getByText('MAINTENANCE.ACTION.SNOOZEWEEK'));
    expect(onBook).toHaveBeenCalledWith(due);
    expect(onDone).toHaveBeenCalledWith(due);
    expect(onSnooze).toHaveBeenCalledWith(due);
  });

  it('reads all clear with nothing due', () => {
    render(
      <NextUpCard nextUp={{ due: null, upcoming: null }} P={P} t={t as never} onBook={jest.fn()} onDone={jest.fn()} onSnooze={jest.fn()} busyItemId={null} />,
    );
    expect(screen.getByText('maintenance.next.nothingDue')).toBeTruthy();
    expect(screen.queryByText('MAINTENANCE.ACTION.BOOK')).toBeNull();
  });
});

describe('How Maintenance works', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('plays through all four frames and lets you jump to one', () => {
    render(<MaintenanceHowTo visible onClose={jest.fn()} P={P} S={S} t={t as never} />);
    expect(screen.getByText('maintenance.howto.frame1')).toBeTruthy();
    act(() => { jest.advanceTimersByTime(7000); });
    expect(screen.getByText('maintenance.howto.frame2')).toBeTruthy();
    act(() => { jest.advanceTimersByTime(7600); });
    expect(screen.getByText('maintenance.howto.frame3')).toBeTruthy();
    act(() => { jest.advanceTimersByTime(7600); });
    expect(screen.getByText('maintenance.howto.frame4')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('maintenance.howto.frameN {"n":2}'));
    expect(screen.getByText('maintenance.howto.frame2')).toBeTruthy();
  });

  it('shows the real cards: a done appointment becomes a Lash infill reminder', () => {
    render(<MaintenanceHowTo visible onClose={jest.fn()} P={P} S={S} t={t as never} />);
    // The copy of the screen is hidden from screen readers; the caption speaks for it.
    const hidden = { includeHiddenElements: true };
    expect(screen.queryByText('maintenance.howto.sample.lashes', hidden)).toBeNull();
    act(() => { jest.advanceTimersByTime(2100); });
    expect(screen.getByText('maintenance.howto.sample.lashes', hidden)).toBeTruthy();
    expect(screen.getByText('MAINTENANCE.SECTION.COMINGUP · 1', hidden)).toBeTruthy();
  });

  it('acts on the big card the way the screen does: snooze, then the next one steps up', () => {
    render(<MaintenanceHowTo visible onClose={jest.fn()} P={P} S={S} t={t as never} />);
    fireEvent.press(screen.getByLabelText('maintenance.howto.frameN {"n":3}'));
    act(() => { jest.advanceTimersByTime(100); });
    // Lash infill leads, three days over; Snooze moves it a week on, so the
    // nails due in four days step up to the big card.
    const hidden = { includeHiddenElements: true };
    expect(screen.getAllByText('maintenance.howto.sample.lashes', hidden).length).toBe(2);
    act(() => { jest.advanceTimersByTime(3400); });
    expect(screen.getAllByText('maintenance.howto.sample.nails', hidden).length).toBe(2);
    expect(screen.getByText('maintenance.howto.hintSnooze')).toBeTruthy();
  });
});

describe('Your look', () => {
  it('reads as two words and a sentence, not one word', () => {
    renderLanding({ styleVibe: ['Natural'], makeupFinish: ['Dewy'], hairType: ['4C'], styleOccasions: ['Everyday'] });
    expect(screen.getByText('NATURAL & DEWY')).toBeTruthy();
    expect(screen.getByText('4C hair and a dewy finish, for everyday.')).toBeTruthy();
  });

  it('opens Style & vibe from anywhere on the card, not just the title', () => {
    const onEditCategory = jest.fn();
    renderLanding({ styleVibe: ['Natural'], hairType: ['4C'], styleOccasions: ['Everyday'] }, [], { onEditCategory });
    fireEvent.press(screen.getByText('4C hair, for everyday.'));
    expect(onEditCategory).toHaveBeenCalledWith('general');
  });
});
