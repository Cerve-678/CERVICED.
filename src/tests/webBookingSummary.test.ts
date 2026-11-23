import { sheetInitialFrom, summarizeWebBooking } from '../web/webBooking';
import type { WebBookingChoice } from '../web/webBooking';

const service: WebBookingChoice['service'] = {
  id: 1,
  dbId: 'service-uuid',
  name: 'Classic Lash Set',
  price: 45,
  duration: '1h 30m',
  description: '',
  image: null,
};

describe('summarizeWebBooking', () => {
  it('shows the service, the day and time, and the add-ons by name', () => {
    const summary = summarizeWebBooking({
      service,
      result: {
        selectedAddOns: [{ id: 7, name: 'Lash bath', price: 5.5 }],
        date: '2026-12-03',
        time: '14:30',
        notes: '',
        isDepositOnly: false,
      },
    });
    expect(summary).toEqual({
      serviceName: 'Classic Lash Set',
      when: 'Thursday 3rd December at 2:30pm',
      addOns: [{ id: '7', name: 'Lash bath' }],
    });
  });

  it('shows just the day when there is no time', () => {
    const summary = summarizeWebBooking({
      service,
      result: { selectedAddOns: [], date: '2026-12-03', time: '', notes: '', isDepositOnly: true },
    });
    expect(summary.when).toBe('Thursday 3rd December');
    expect(summary.addOns).toEqual([]);
  });
});

describe('sheetInitialFrom', () => {
  it('reopens the sheet on the same day, time, add-ons, notes and deposit choice', () => {
    const addOns = [{ id: 7, name: 'Lash bath', price: 5.5 }];
    expect(sheetInitialFrom({
      selectedAddOns: addOns,
      date: '2026-11-25',
      time: '14:30',
      notes: 'Sensitive eyes',
      isDepositOnly: true,
      promoCode: 'LOU10',
    })).toEqual({
      selectedAddOns: addOns,
      selectedDate: '2026-11-25',
      selectedTime: '14:30',
      notes: 'Sensitive eyes',
      isDepositOnly: true,
    });
  });
});
