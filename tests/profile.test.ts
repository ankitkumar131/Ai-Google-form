import { describe, expect, it } from 'vitest';
import {
  memoryAnswer,
  profileAnswer,
  profileKey,
  relevantProfile,
  similarity,
} from '../src/services/profile';
import { question, saved } from './helpers';
import type { Profile } from '../src/shared/types';
const profile: Profile = {
  id: 'p1',
  name: 'Personal',
  mandatory: [],
  firstName: 'Alex',
  lastName: 'Lee',
  email: 'alex@example.com',
  mobileNumber: '+919876543210',
  skills: 'React, TypeScript',
  dateOfBirth: '1995-04-17',
  city: 'Pune',
};
describe('profile mapping', () => {
  it.each([
    ['Given name', 'firstName'],
    ['Family name', 'lastName'],
    ['Contact number', 'contactNumber'],
    ['Email address', 'email'],
    ['Current company', 'currentCompany'],
    ['LinkedIn profile', 'linkedInUrl'],
    ['Phone number', 'mobileNumber'],
    ['Current location', 'currentLocation'],
    ['Graduation year', 'graduationYear'],
    ['College / university', 'university'],
    ['Professional summary', 'professionalSummary'],
  ])('maps %s to %s', (text, key) => {
    expect(profileKey(question({ text }))).toBe(key);
  });
  it('prefers standard autocomplete', () =>
    expect(profileKey(question({ text: 'Name', autocomplete: 'section-contact given-name' }))).toBe(
      'firstName',
    ));
  it('combines the full name', () =>
    expect(profileAnswer(question({ text: 'Full name' }), profile)?.answer).toBe('Alex Lee'));
  it('does not invent a missing personal fact', () =>
    expect(profileAnswer(question({ text: 'Current company' }), profile)).toBeUndefined());
  it('only matches exact unambiguous choices', () => {
    expect(
      profileAnswer(
        question({
          text: 'City',
          type: 'select',
          options: [{ id: '1', label: 'Pune', value: 'pn' }],
        }),
        profile,
      )?.answer,
    ).toBe('Pune');
    expect(
      profileAnswer(
        question({
          text: 'City',
          type: 'select',
          options: [{ id: '1', label: 'Mumbai', value: 'm' }],
        }),
        profile,
      ),
    ).toBeUndefined();
  });
  it('omits unrelated private data from AI context', () => {
    const data = relevantProfile([question()], profile);
    expect(data).toEqual({});
    expect(
      relevantProfile([question({ text: 'Describe your skills and experience' })], profile),
    ).toEqual({ skills: 'React, TypeScript' });
  });
});
describe('answer memory', () => {
  it('reuses confirmed near-exact matches', () =>
    expect(memoryAnswer(question(), [saved()], 'p1')?.source).toBe('Saved answer'));
  it('isolates profiles and field types', () => {
    expect(memoryAnswer(question(), [saved()], 'other')).toBeUndefined();
    expect(memoryAnswer(question({ type: 'radio' }), [saved()], 'p1')).toBeUndefined();
  });
  it('rejects ambiguous saved answers', () =>
    expect(
      memoryAnswer(question(), [saved(), saved({ id: 'a2', answer: '5' })], 'p1'),
    ).toBeUndefined());
  it('rejects choices not present in the new form', () =>
    expect(
      memoryAnswer(
        question({ type: 'radio', options: [{ id: '1', label: '3', value: '3' }] }),
        [saved({ type: 'radio' })],
        'p1',
      ),
    ).toBeUndefined());
  it('does not conflate meaningful negation', () =>
    expect(
      memoryAnswer(
        question({ text: 'Do you not agree?' }),
        [saved({ question: 'Do you agree?' })],
        'p1',
      ),
    ).toBeUndefined());
  it('finds related wording for search but not automatic reuse', () => {
    expect(
      similarity('Why join our organization?', 'Why do you want to join our organization?'),
    ).toBeGreaterThan(0.4);
    expect(
      memoryAnswer(
        question({ text: 'Why join our organization?' }),
        [saved({ question: 'Why do you want to join our organization?' })],
        'p1',
      ),
    ).toBeUndefined();
  });
});
describe('profile mapping safety', () => {
  it.each([
    'Which city is the capital of France?',
    'Why does your company name matter?',
    'Do you have a degree?',
    'What is the email protocol used to send messages?',
  ])('does not confuse a knowledge or narrative question with a profile field: %s', (text) =>
    expect(profileKey(question({ text }))).toBeUndefined(),
  );
  it('recognizes personal field phrasing', () =>
    expect(profileKey(question({ text: 'Please enter your city of residence' }))).toBe('city'));
});
describe('memory directionality', () => {
  it('does not automatically reuse token-identical questions with opposite meaning', () => {
    expect(
      memoryAnswer(
        question({ text: 'Would you move from Pune to Mumbai?' }),
        [saved({ question: 'Would you move from Mumbai to Pune?' })],
        'p1',
      ),
    ).toBeUndefined();
  });
});
