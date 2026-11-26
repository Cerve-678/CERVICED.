jest.mock('../utils/logger', () => ({ reportError: jest.fn(), logger: { error: jest.fn() } }));

import {
  BLOCKED_LANGUAGE_MESSAGE,
  toUserMessage,
  toUserMessageAllowingDbGuard,
} from '../utils/userFacingError';

// The refusal raised by refuse_blocked_language() (migration 20261125170000),
// exactly as PostgREST hands it to the app.
const refusal = {
  code: 'P0001',
  message: "This includes language that isn't allowed on CERVICED. Please change it and try again.",
  details: null,
  hint: null,
};

describe('language filter refusal reaches the person', () => {
  it('tells them what to fix even on screens that only use toUserMessage', () => {
    expect(toUserMessage(refusal, 'Could not save your changes.')).toBe(BLOCKED_LANGUAGE_MESSAGE);
  });

  it('reads the same on screens that pass database guards through', () => {
    expect(toUserMessageAllowingDbGuard(refusal, 'Message not sent.')).toBe(BLOCKED_LANGUAGE_MESSAGE);
  });

  it('matches the wording the database raises, word for word', () => {
    expect(BLOCKED_LANGUAGE_MESSAGE).toBe(refusal.message);
  });

  it('leaves other failures on their own fallback', () => {
    expect(toUserMessage({ code: '23503', message: 'insert violates foreign key' }, 'Could not save your changes.'))
      .toBe('Could not save your changes.');
  });
});
