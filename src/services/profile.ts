import type { Answer, Profile, Question, SavedAnswer } from '../shared/types';
const mappings: [string, RegExp][] = [
  ['alternativeEmail', /alternat(?:e|ive) (e mail|email)|secondary (e mail|email)/],
  ['firstName', /first name|given name|forename/],
  ['lastName', /last name|surname|family name/],
  ['fullName', /full name|your name|^name$/],
  ['email', /e mail|email/],
  ['contactNumber', /contact (number|phone)/],
  ['mobileNumber', /mobile|phone|telephone|cell number/],
  ['dateOfBirth', /date of birth|birth date|birthday|^dob$/],
  ['gender', /^gender$|^sex$/],
  ['linkedInUrl', /linkedin/],
  ['githubUrl', /github/],
  ['portfolioUrl', /portfolio|personal website/],
  ['postalCode', /postal|zip code|pincode|pin code/],
  ['city', /city|town/],
  ['state', /state|province/],
  ['country', /country/],
  ['currentLocation', /current location|^location$/],
  ['currentCompany', /current (company|employer)|company name/],
  ['currentJobTitle', /current (job title|role)|job title/],
  ['totalExperience', /total experience|years of (work |professional )?experience/],
  ['skills', /^(technical )?skills$|key skills/],
  ['university', /university|college/],
  ['graduationYear', /graduation year|year of graduation/],
  ['degree', /degree/],
  ['cgpa', /cgpa|^gpa$/],
  ['certifications', /certifications|certificates/],
  ['education', /^education$|educational background/],
  ['professionalSummary', /professional summary|about yourself|about you/],
];
const autocomplete: Record<string, string> = {
  'given-name': 'firstName',
  'family-name': 'lastName',
  name: 'fullName',
  email: 'email',
  tel: 'mobileNumber',
  bday: 'dateOfBirth',
  'address-level2': 'city',
  'address-level1': 'state',
  'country-name': 'country',
  'postal-code': 'postalCode',
  organization: 'currentCompany',
  'organization-title': 'currentJobTitle',
  url: 'portfolioUrl',
};
export const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[_\-]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
export function profileKey(q: Question): string | undefined {
  const auto = q.autocomplete.split(' ').at(-1) || '';
  if (autocomplete[auto]) return autocomplete[auto];
  const label = normalize(q.text);
  // Match field descriptions, not arbitrary sentences containing a profile keyword.
  // "City of residence" is a profile field; "Which city is France's capital?" is not.
  const fieldWords = new Set(
    'your the enter please provide what is are a an current primary of applicant candidate student employee contact work personal full home preferred select required address optional residence city town state province profile url link number'.split(
      ' ',
    ),
  );
  const match = (value: string) =>
    mappings.find(([, pattern]) => {
      if (!pattern.test(value)) return false;
      const remaining = value
        .replace(new RegExp(pattern.source, 'g'), '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      return remaining.every((word) => fieldWords.has(word));
    })?.[0];
  const direct = match(label);
  if (direct) return direct;
  // Names are useful only when no meaningful accessible description is available.
  if (label !== 'unlabelled field' && label !== normalize(q.name) && label.split(' ').length > 3)
    return;
  return match(normalize(q.name.replace(/([a-z])([A-Z])/g, '$1 $2')));
}
export function profileAnswer(q: Question, profile?: Profile): Answer | undefined {
  if (!profile) return;
  const key = profileKey(q);
  if (!key) return;
  let value = profile[key];
  if (key === 'fullName' && !value)
    value = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  if (key === 'mobileNumber' && !value) value = profile.contactNumber;
  if (typeof value !== 'string' || !value.trim()) return;
  if (q.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
  if (q.options.length) {
    const matches = q.options.filter(
      (o) =>
        normalize(o.label) === normalize(value as string) ||
        normalize(o.value) === normalize(value as string),
    );
    if (matches.length !== 1) return;
    value = matches[0].label;
  }
  return {
    questionId: q.id,
    questionType: q.type,
    answer: value,
    confidence: 1,
    source: 'Profile',
  };
}
export function similarity(a: string, b: string): number {
  const tokens = (s: string) =>
    new Set(
      normalize(s)
        .split(' ')
        .filter((t) => !['the', 'a', 'an', 'please', 'your', 'you'].includes(t)),
    );
  const x = tokens(a),
    y = tokens(b);
  if (!x.size || !y.size) return 0;
  const intersect = [...x].filter((t) => y.has(t)).length;
  return intersect / (x.size + y.size - intersect);
}
export function memoryAnswer(
  q: Question,
  bank: SavedAnswer[],
  profileId: string,
): Answer | undefined {
  const matches = bank
    .filter(
      (s) =>
        s.profileId === profileId &&
        s.type === q.type &&
        normalize(s.question).replace(/^please /, '') === normalize(q.text).replace(/^please /, ''),
    )
    .map((s) => ({ s, score: similarity(q.text, s.question) }))
    .filter((m) => m.score >= 0.96)
    .sort((a, b) => b.score - a.score);
  if (!matches.length) return;
  const best = matches[0];
  if (
    matches[1] &&
    matches[1].score === best.score &&
    JSON.stringify(matches[1].s.answer) !== JSON.stringify(best.s.answer)
  )
    return;
  const values = Array.isArray(best.s.answer) ? best.s.answer : [best.s.answer];
  if (
    q.options.length &&
    !values.every((v) => q.options.some((o) => normalize(o.label) === normalize(v)))
  )
    return;
  return {
    questionId: q.id,
    questionType: q.type,
    answer: best.s.answer,
    confidence: best.score,
    source: 'Saved answer',
  };
}
export function relevantProfile(qs: Question[], profile?: Profile): Record<string, string> {
  if (!profile) return {};
  const result: Record<string, string> = {};
  for (const q of qs) {
    const key = profileKey(q);
    if (key && typeof profile[key] === 'string') result[key] = profile[key] as string;
    if (
      /experience|skills|background|qualifications?|education|degree|certifications?|why.*(hire|join)|about (you|yourself)|cover letter|employment|work history/i.test(
        q.text,
      )
    )
      for (const field of [
        'skills',
        'totalExperience',
        'professionalSummary',
        'education',
        'degree',
        'certifications',
        'currentJobTitle',
        'currentCompany',
        'university',
        'graduationYear',
      ])
        if (typeof profile[field] === 'string' && profile[field])
          result[field] = profile[field] as string;
  }
  return result;
}
