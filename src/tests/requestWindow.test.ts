import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  clientRequestNote,
  providerRequestNote,
  requestAnswerDeadline,
  REQUEST_ANSWER_LEAD_HOURS,
  REQUEST_RESPONSE_HOURS,
} from '../features/bookings/requestWindow';

const MIGRATIONS = join(__dirname, '../../supabase/migrations');

const newestDefinition = (fn: string) => {
  const pattern = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(`);
  const definitions = readdirSync(MIGRATIONS)
    .sort()
    .map(file => readFileSync(join(MIGRATIONS, file), 'utf8'))
    .filter(sql => pattern.test(sql));
  return definitions[definitions.length - 1]!;
};

it('promises the same window the database enforces', () => {
  const deadline = newestDefinition('booking_request_deadline');
  expect(deadline).toContain(`INTERVAL '${REQUEST_RESPONSE_HOURS} hours'`);
  expect(deadline).toContain(`INTERVAL '${REQUEST_ANSWER_LEAD_HOURS} hour'`);
  expect(newestDefinition('process_expire_stale_pending_bookings'))
    .toContain('public.booking_request_deadline(created_at, booking_date, booking_time)');
});

const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m);

describe('requestAnswerDeadline', () => {
  it('gives 24 hours when the appointment is further off', () => {
    expect(requestAnswerDeadline(at(4, 10), at(10, 14))).toEqual({ answerBy: at(5, 10), urgent: false });
  });

  it('wants an answer an hour before a same-day appointment', () => {
    // Booked at 12:00 for 17:00 — 5 hours left, so the answer is due at 16:00.
    expect(requestAnswerDeadline(at(4, 12), at(4, 17))).toEqual({ answerBy: at(4, 16), urgent: true });
  });

  it('uses the hour-before rule whenever it comes before the 24 hours', () => {
    expect(requestAnswerDeadline(at(4, 20), at(5, 9))).toEqual({ answerBy: at(5, 8), urgent: true });
  });

  it('gives until the start when booked less than an hour ahead', () => {
    expect(requestAnswerDeadline(at(4, 16, 30), at(4, 17))).toEqual({ answerBy: at(4, 17), urgent: true });
  });
});

describe('the notes both sides read', () => {
  const now = at(4, 12);

  it('tells the client the 24 hours and when they end', () => {
    expect(clientRequestNote('Amy', requestAnswerDeadline(now, at(10, 14)), now))
      .toContain('Amy has 24 hours to accept this request, until 12:00pm tomorrow');
  });

  it('tells the provider a short-notice request needs an answer by a time', () => {
    const note = providerRequestNote(requestAnswerDeadline(now, at(4, 17)), now);
    expect(note).toContain('Needs your answer soon');
    expect(note).toContain('4:00pm today');
  });

  it('tells the provider the 24 hours otherwise', () => {
    expect(providerRequestNote(requestAnswerDeadline(now, at(10, 14)), now))
      .toContain('You have 24 hours to answer, until 12:00pm tomorrow');
  });
});

describe('a request whose payment is held on the card', () => {
  const now = new Date(2026, 10, 12, 9, 0);
  const deadline = requestAnswerDeadline(now, new Date(2026, 10, 20, 14, 0));

  it('tells the client they are only charged if the provider accepts', () => {
    const note = clientRequestNote('Amy', deadline, now, true);
    expect(note).toContain('only charged if they accept');
    expect(note).toContain('you pay nothing');
    expect(note).not.toContain('refunded');
  });

  it('tells the provider the money is taken when they accept', () => {
    const note = providerRequestNote(deadline, now, true);
    expect(note).toContain('taken when you accept');
    expect(note).not.toContain('refunded');
  });
});
