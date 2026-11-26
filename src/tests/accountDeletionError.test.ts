import { accountDeletionError } from '../utils/accountDeletionError';

describe('accountDeletionError', () => {
  it('asks for upcoming appointments to be dealt with first', () => {
    expect(accountDeletionError({ error: 'upcoming_bookings', count: 1 }).message)
      .toBe('You have 1 upcoming appointment. Please cancel or complete it first.');
    expect(accountDeletionError({ error: 'upcoming_bookings', count: 3 }).message)
      .toBe('You have 3 upcoming appointments. Please cancel or complete them first.');
  });

  it('says in plain words which money is still moving', () => {
    expect(accountDeletionError({ error: 'money_in_progress', blockers: { payouts_waiting: 2 } }).message)
      .toBe("You can't delete your account yet because there's a payout still on its way to you. You can delete it once that's finished.");
    expect(accountDeletionError({ error: 'money_in_progress', audience: 'provider', blockers: { refunds_owed: 1, refund_requests_open: 1, debts_owed: 1 } }).message)
      .toBe("You can't delete your account yet because there's a refund still owed to a client, a client's refund request that is still open and money you still owe from a refund or chargeback. You can delete it once that's finished.");
  });

  it('words the reasons for a client deleting their own profile', () => {
    expect(accountDeletionError({ error: 'money_in_progress', audience: 'client', blockers: { payouts_waiting: 1, refunds_owed: 1 } }).message)
      .toBe("You can't delete your account yet because there's a payment to your provider that hasn't gone out yet and a refund still owed to you. You can delete it once that's finished.");
  });

  it('never shows a raw code for a reason it does not know', () => {
    expect(accountDeletionError({ error: 'money_in_progress', blockers: { something_new: 1 } }).message)
      .toBe("You can't delete your account yet because a payment on it is still being settled. Please try again later.");
    expect(accountDeletionError(null).message).toBe('Could not delete your account.');
  });
});
