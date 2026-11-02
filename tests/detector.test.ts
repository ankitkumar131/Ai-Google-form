import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FormDetector } from '../src/extension/detector';
import type { Answer, Question } from '../src/shared/types';
beforeEach(() => {
  document.body.innerHTML = '';
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(
    () => [{ width: 100, height: 30 }] as unknown as DOMRectList,
  );
});
function answer(q: Question, value: string | string[]): Answer {
  return { questionId: q.id, questionType: q.type, answer: value, confidence: 1, source: 'Manual' };
}
describe('universal form scanner', () => {
  it('detects labels, types, required flags and choices', () => {
    document.body.innerHTML =
      '<label for="email">Email address</label><input id="email" type="email" required/><fieldset><legend>Pick a color</legend><label><input type="radio" name="color" value="a"/>Red</label><label><input type="radio" name="color" value="b"/>Blue</label></fieldset><label>Role<select><option value="">Choose</option><option value="dev">Developer</option></select></label>';
    const qs = new FormDetector().scan();
    expect(qs).toHaveLength(3);
    expect(qs[0]).toMatchObject({ text: 'Email address', type: 'email', required: true });
    expect(qs[1]).toMatchObject({ text: 'Pick a color', type: 'radio' });
    expect(qs[1].options.map((o) => o.label)).toEqual(['Red', 'Blue']);
    expect(qs[2].options).toHaveLength(1);
  });
  it('ignores hidden, disabled, read-only, file and password inputs', () => {
    document.body.innerHTML =
      '<input type="password"/><input hidden/><input disabled/><input readonly/><input type="file"/><input type="hidden"/><input aria-label="Visible"/>';
    expect(new FormDetector().scan()).toHaveLength(1);
  });
  it('reads aria-labelledby, placeholders and contenteditable', () => {
    document.body.innerHTML =
      '<span id="label">Tell us more</span><div role="textbox" aria-labelledby="label" contenteditable="true"></div><input placeholder="Your city"/>';
    const qs = new FormDetector().scan();
    expect(qs.map((q) => q.text)).toEqual(['Tell us more', 'Your city']);
  });
  it('traverses open shadow roots', () => {
    const host = document.createElement('div');
    document.body.append(host);
    host.attachShadow({ mode: 'open' }).innerHTML =
      '<label for="x">First name</label><input id="x"/>';
    expect(new FormDetector().scan()[0].text).toBe('First name');
  });
  it('has stable IDs across dynamic rescans without duplicate questions', () => {
    document.body.innerHTML = '<input aria-label="One"/>';
    const d = new FormDetector();
    const id = d.scan()[0].id;
    document.body.insertAdjacentHTML('beforeend', '<input aria-label="Two"/>');
    const qs = d.scan();
    expect(qs).toHaveLength(2);
    expect(qs[0].id).toBe(id);
  });
  it('flags consent and financial information', () => {
    document.body.innerHTML =
      '<label><input type="checkbox"/>I agree to the terms</label><input aria-label="Credit card number"/><input aria-label="SSN"/>';
    expect(new FormDetector().scan().every((q) => q.sensitive)).toBe(true);
  });
  it('adapts Google Forms-style ARIA radio questions', () => {
    document.body.innerHTML =
      '<div role="listitem"><div role="heading">Your preferred language?</div><div role="radiogroup"><div role="radio" aria-label="English" aria-checked="false"></div><div role="radio" aria-label="Marathi" aria-checked="false"></div></div></div>';
    const qs = new FormDetector().scan();
    expect(qs).toHaveLength(1);
    expect(qs[0].type).toBe('radio');
    expect(qs[0].text).toBe('Your preferred language?');
    expect(qs[0].options.map((o) => o.label)).toEqual(['English', 'Marathi']);
  });
});
describe('safe filling and verification', () => {
  it('uses native setters and emits framework input/change events', async () => {
    document.body.innerHTML = '<input aria-label="Name"/>';
    const input = document.querySelector('input')!;
    const onInput = vi.fn(),
      onChange = vi.fn();
    input.addEventListener('input', onInput);
    input.addEventListener('change', onChange);
    const d = new FormDetector(),
      q = d.scan()[0];
    expect((await d.fill(answer(q, 'Alex'), true)).success).toBe(true);
    expect(input.value).toBe('Alex');
    expect(onInput).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledOnce();
  });
  it('never overwrites existing values by default', async () => {
    document.body.innerHTML = '<input aria-label="Name" value="Original"/>';
    const d = new FormDetector(),
      q = d.scan()[0];
    expect((await d.fill(answer(q, 'Changed'), true)).success).toBe(false);
    expect(document.querySelector('input')!.value).toBe('Original');
  });
  it('rejects changes since the scan', async () => {
    document.body.innerHTML = '<input aria-label="Name"/>';
    const d = new FormDetector(),
      q = d.scan()[0];
    document.querySelector('input')!.value = 'User typing';
    expect((await d.fill(answer(q, 'AI'), false)).success).toBe(false);
  });
  it('selects a native dropdown by label and verifies it', async () => {
    document.body.innerHTML =
      '<select aria-label="Color"><option value="">Choose</option><option value="b">Blue</option></select>';
    const d = new FormDetector(),
      q = d.scan()[0];
    expect((await d.fill(answer(q, 'Blue'), true)).success).toBe(true);
    expect(document.querySelector('select')!.value).toBe('b');
  });
  it('fills grouped radios, never arbitrary options', async () => {
    document.body.innerHTML =
      '<fieldset><legend>Color</legend><label><input type="radio" name="c"/>Red</label><label><input type="radio" name="c"/>Blue</label></fieldset>';
    const d = new FormDetector(),
      q = d.scan()[0];
    expect((await d.fill(answer(q, 'Green'), true)).success).toBe(false);
    expect((await d.fill(answer(q, 'Blue'), true)).success).toBe(true);
    expect(document.querySelectorAll('input')[1].checked).toBe(true);
  });
  it('fills and verifies multiple checkboxes', async () => {
    document.body.innerHTML =
      '<fieldset><legend>Skills</legend><label><input type="checkbox" name="s"/>React</label><label><input type="checkbox" name="s"/>TypeScript</label></fieldset>';
    const d = new FormDetector(),
      q = d.scan()[0];
    expect((await d.fill(answer(q, ['React', 'TypeScript']), true)).success).toBe(true);
  });
  it('refuses consent even in a reviewed answer', async () => {
    document.body.innerHTML = '<label><input type="checkbox"/>I agree to the terms</label>';
    const d = new FormDetector(),
      q = d.scan()[0];
    expect((await d.fill(answer(q, ['I agree to the terms']), false)).success).toBe(false);
  });
  it('detects websites rejecting an answer', async () => {
    document.body.innerHTML = '<input aria-label="Name"/>';
    document
      .querySelector('input')!
      .addEventListener('input', (e) => ((e.target as HTMLInputElement).value = ''));
    const d = new FormDetector(),
      q = d.scan()[0];
    expect((await d.fill(answer(q, 'Alex'), true)).success).toBe(false);
  });
  it('validates email, numeric bounds and length', async () => {
    document.body.innerHTML =
      '<input type="email" aria-label="Email"/><input type="number" min="1" max="10"/><input maxlength="3"/>';
    const d = new FormDetector(),
      qs = d.scan();
    expect((await d.fill(answer(qs[0], 'bad email'), true)).success).toBe(false);
    expect((await d.fill(answer(qs[1], '99'), true)).success).toBe(false);
    expect((await d.fill(answer(qs[2], 'too long'), true)).success).toBe(false);
  });
});
describe('stale question protection', () => {
  it('refuses a question whose label changed after scanning', async () => {
    document.body.innerHTML = '<input aria-label="First name"/>';
    const d = new FormDetector(),
      q = d.scan()[0];
    document.querySelector('input')!.setAttribute('aria-label', 'Credit card number');
    expect((await d.fill(answer(q, 'Alex'), false)).success).toBe(false);
  });
  it('does not reuse IDs across document instances', () => {
    document.body.innerHTML = '<input aria-label="Name"/>';
    expect(new FormDetector().scan()[0].id).not.toBe(new FormDetector().scan()[0].id);
  });
  it('refuses choices changed after scanning', async () => {
    document.body.innerHTML =
      '<select aria-label="Color"><option value="">Choose</option><option value="1">Red</option></select>';
    const d = new FormDetector(),
      q = d.scan()[0];
    document.querySelectorAll('option')[1].textContent = 'Green';
    expect((await d.fill(answer(q, 'Red'), false)).success).toBe(false);
  });
});
