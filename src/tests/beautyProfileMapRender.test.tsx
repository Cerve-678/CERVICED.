import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BodyMap } from '../features/beauty-profile/BodyFigure';
import { FigureSheet } from '../features/beauty-profile/FigureSheet';
import { FIGURE_KEYS, type MapArea } from '../features/beauty-profile/bodyMap';
import { NextUpCard } from '../features/maintenance/NextUpCard';
import { MaintenanceHowTo } from '../features/maintenance/MaintenanceHowTo';
import { groupMaintenanceItems, nextUpFrom } from '../features/maintenance/presentation';
import { semanticColors } from '../features/maintenance/ui';
import { clientLightTheme } from '../constants/theme';
import type { AppTheme } from '../constants/theme';
import type { MaintenanceItem } from '../types/maintenance';
import { dateToYMD } from '../utils/dateUtils';

jest.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({ isDarkMode: false, palette: jest.requireActual('../constants/theme').clientLightTheme, theme: {} }),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
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

/** Fires the layout the map waits for before drawing pins. */
function layout(width: number) {
  const wrap = screen.UNSAFE_root.findAll((n) => typeof n.props['onLayout'] === 'function')[0];
  if (!wrap) throw new Error('no layout host');
  act(() => { wrap.props['onLayout']({ nativeEvent: { layout: { width, height: 0, x: 0, y: 0 } } }); });
}

describe('body map', () => {
  it.each(FIGURE_KEYS)('draws %s with a pin per area, and a tap picks it', (figure) => {
    const onPick = jest.fn();
    render(<BodyMap figure={figure} area="hair" onPick={onPick} P={P} S={S} />);
    layout(340);
    for (const label of ['HAIR', 'LASHES & BROWS', 'SKIN', 'MAKEUP', 'NAILS', 'STYLE']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    fireEvent.press(screen.getByText('NAILS'));
    expect(onPick).toHaveBeenCalledWith<[MapArea]>('nails');
  });

  it('shows due dots only when given them', () => {
    render(<BodyMap figure="portrait" area="hair" onPick={jest.fn()} P={P} S={S} dots={{ nails: 'bad' }} />);
    layout(340);
    expect(screen.getByLabelText('NAILS, something overdue')).toBeTruthy();
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
    act(() => { jest.advanceTimersByTime(7200); });
    expect(screen.getByText('maintenance.howto.frame4')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('maintenance.howto.frameN {"n":2}'));
    expect(screen.getByText('maintenance.howto.frame2')).toBeTruthy();
  });
});

describe('Change figure', () => {
  it('picks a figure and closes', () => {
    const onChange = jest.fn();
    const onClose = jest.fn();
    render(<FigureSheet visible prefs={{ figure: 'portrait', dueDots: false }} onChange={onChange} onClose={onClose} P={P} t={t as never} />);
    fireEvent.press(screen.getByLabelText('Soft zones'));
    expect(onChange).toHaveBeenCalledWith({ figure: 'zones', dueDots: false });
    expect(onClose).toHaveBeenCalled();
  });
});
