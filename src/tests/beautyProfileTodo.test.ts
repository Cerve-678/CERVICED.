import { beautyProfileTodo, REQUIRED_BEAUTY_FIELDS, TODO_FIELD_CATEGORY } from '../utils/beautyProfileTodo';
import { EMPTY_BEAUTY_DATA, type BeautyData } from '../types/beautyProfile';

const FILLED: BeautyData = {
  ...EMPTY_BEAUTY_DATA,
  hairType: '4C',
  skinType: 'Oily',
  skinConcerns: ['Acne'],
  styleVibe: 'Natural',
  allergies: ['None known'],
  treatmentHistory: ['None'],
};
const CLIENT = { dob: '1995-04-02', hasClientProfile: true };

describe('beautyProfileTodo', () => {
  it('has nothing to do once every required answer and the date of birth are saved', () => {
    expect(beautyProfileTodo(FILLED, CLIENT)).toEqual([]);
  });

  it('ignores optional answers like medical notes, skin tone and nails', () => {
    const optionalBlank: BeautyData = { ...FILLED, medicalNotes: '', skinTone: '', nailShape: '', hairGoals: [] };
    expect(beautyProfileTodo(optionalBlank, CLIENT)).toEqual([]);
  });

  it('lists everything an Apple or Google account skipped, in sign-up order', () => {
    // createSocialProfileIfMissing writes no beauty answers and no dob.
    expect(beautyProfileTodo(EMPTY_BEAUTY_DATA, { dob: '', hasClientProfile: true }))
      .toEqual([...REQUIRED_BEAUTY_FIELDS, 'dob']);
  });

  it('treats whitespace and empty lists as blank', () => {
    expect(beautyProfileTodo({ ...FILLED, styleVibe: '  ', skinConcerns: [] }, CLIENT))
      .toEqual(['skinConcerns', 'styleVibe']);
  });

  it('accepts single or multi-pick shapes for every field', () => {
    // skin type and style vibe are moving to multi-pick arrays.
    expect(beautyProfileTodo({ ...FILLED, skinType: ['Oily', 'Dry'], styleVibe: ['Glam'] }, CLIENT)).toEqual([]);
    expect(beautyProfileTodo({ ...FILLED, skinType: [], styleVibe: null }, CLIENT))
      .toEqual(['skinType', 'styleVibe']);
    expect(beautyProfileTodo({ ...FILLED, skinConcerns: [''] }, CLIENT)).toEqual(['skinConcerns']);
  });

  it('counts "None known" and "None" as real answers', () => {
    expect(beautyProfileTodo({ ...FILLED, allergies: ['None known'], treatmentHistory: ['None'] }, CLIENT)).toEqual([]);
  });

  it('asks for nothing it cannot vouch for while data is still loading', () => {
    expect(beautyProfileTodo(null, CLIENT)).toEqual([]);
    expect(beautyProfileTodo(FILLED, { dob: '' })).toEqual([]);
    expect(beautyProfileTodo(FILLED, null)).toEqual([]);
  });

  it('has nothing to do for an account without a client hat', () => {
    expect(beautyProfileTodo(EMPTY_BEAUTY_DATA, { dob: '', hasClientProfile: false })).toEqual([]);
  });

  it('maps every field to the category that edits it', () => {
    for (const field of REQUIRED_BEAUTY_FIELDS) {
      expect(TODO_FIELD_CATEGORY[field]).toBeDefined();
    }
  });
});
