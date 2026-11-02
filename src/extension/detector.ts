import type { Answer, FillResult, Option, Question, QuestionType } from '../shared/types';
import { normalize } from '../services/profile';
import { adapterContainer, adapterTitle } from './adapters';
interface Entry {
  question: Question;
  elements: HTMLElement[];
  options: HTMLElement[];
}
const selector =
  'input,textarea,select,[contenteditable="true"],[role="textbox"],[role="radio"],[role="checkbox"],[role="combobox"],[role="listbox"]';
const blocked =
  /password|credit.?card|card.?number|cvv|cvc|social.?security|\bssn\b|bank.?account|routing.?number|one.?time.?password|\botp\b|security.?code|passport|aadhaar|pan.?number|tax.?id|national.?id|expir(?:ation|y) date|security.?answer/i;
const consent =
  /\b(consent|agree|agreement|terms|privacy|subscribe|certify|attest(?:ation)?|declaration|authoriz(?:e|ed|ation)|permission|accept|marketing)\b/i;
export function isVisible(el: HTMLElement): boolean {
  if (!el.isConnected || el.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
    return false;
  return el.getClientRects().length > 0;
}
function allRoots(root: Document | ShadowRoot): (Document | ShadowRoot)[] {
  const roots: (Document | ShadowRoot)[] = [root];
  for (const el of root.querySelectorAll('*'))
    if (el.shadowRoot) roots.push(...allRoots(el.shadowRoot));
  return roots;
}
function rootOf(el: Element): Document | ShadowRoot {
  return el.getRootNode() as Document | ShadowRoot;
}
function text(el: Element | null): string {
  return (el?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
}
function labelled(el: HTMLElement): string {
  const root = rootOf(el);
  const refs = el
    .getAttribute('aria-labelledby')
    ?.split(/\s+/)
    .map((id) => root.getElementById(id))
    .filter(Boolean) as Element[] | undefined;
  if (refs?.length) return refs.map(text).join(' ');
  if (el.getAttribute('aria-label')) return el.getAttribute('aria-label')!;
  if ('labels' in el) {
    const labels = (el as HTMLInputElement).labels;
    if (labels?.length) return [...labels].map(text).join(' ');
  }
  return text(el.closest('label'));
}
// Explicit adapters add context; the generic accessible-control scanner remains the fallback.
export function questionContainer(el: HTMLElement): HTMLElement | null {
  return (
    adapterContainer(el) ||
    el.closest(
      '[data-automation-id="formField"],[data-automation-id="questionItem"],.freebirdFormviewerComponentsQuestionBaseRoot,[role="listitem"],fieldset,[role="radiogroup"],[role="group"],.form-group,.form-field,[data-question]',
    )
  );
}
function questionLabel(el: HTMLElement, group = false): string {
  const container = questionContainer(el);
  if (group && container) {
    const parents = [
      container,
      container.parentElement?.closest<HTMLElement>(
        '[role="listitem"],fieldset,[data-question],[data-automation-id="questionItem"]',
      ),
    ].filter(Boolean) as HTMLElement[];
    for (const parent of parents) {
      const label =
        labelled(parent) ||
        text(adapterTitle(parent)) ||
        text(
          parent.querySelector(
            'legend,[role="heading"],.freebirdFormviewerComponentsQuestionBaseTitle,[data-automation-id="questionTitle"],.question-title',
          ),
        );
      if (label) return label;
    }
  }
  const siteTitle = container && text(adapterTitle(container));
  if (siteTitle) return siteTitle;
  const direct = labelled(el);
  if (direct) return direct;
  const heading =
    container &&
    (adapterTitle(container) ||
      container.querySelector(
        'legend,[role="heading"],.question-title,[data-automation-id="questionTitle"]',
      ));
  return (
    text(heading || null) ||
    el.getAttribute('placeholder') ||
    el.getAttribute('name') ||
    el.id ||
    'Unlabelled field'
  );
}
function getType(el: HTMLElement): QuestionType {
  const role = el.getAttribute('role');
  if (role === 'radio' || role === 'checkbox') return role;
  if (role === 'combobox' || role === 'listbox') return 'select';
  if (role === 'textbox') return el.getAttribute('aria-multiline') === 'true' ? 'textarea' : 'text';
  if (el instanceof HTMLSelectElement) return el.multiple ? 'checkbox' : 'select';
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  if (el.isContentEditable || el.getAttribute('contenteditable') === 'true')
    return 'contenteditable';
  if (el instanceof HTMLInputElement)
    return (
      ['text', 'email', 'tel', 'number', 'date', 'url', 'radio', 'checkbox'].includes(el.type)
        ? el.type
        : 'unknown'
    ) as QuestionType;
  return 'unknown';
}
function currentValue(elements: HTMLElement[], type: QuestionType): string {
  if (type === 'radio' || type === 'checkbox') {
    if (elements[0] instanceof HTMLSelectElement)
      return [...elements[0].selectedOptions]
        .filter((o) => o.value)
        .map((o) => o.text.trim())
        .join(', ');
    return elements
      .filter((el) =>
        el instanceof HTMLInputElement ? el.checked : el.getAttribute('aria-checked') === 'true',
      )
      .map((el) => labelled(el) || text(el))
      .join(', ');
  }
  const el = elements[0];
  if (el instanceof HTMLSelectElement)
    return el.value ? el.selectedOptions[0]?.text.trim() || '' : '';
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
  if (el.getAttribute('role') === 'combobox' || el.getAttribute('role') === 'listbox')
    return (
      el.getAttribute('aria-valuetext') ||
      text(el.querySelector('[aria-selected="true"]')) ||
      text(el)
    );
  return el.textContent?.trim() || '';
}
export class FormDetector {
  private ids = new WeakMap<HTMLElement, string>();
  private seq = 0;
  private documentId = [...crypto.getRandomValues(new Uint8Array(8))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  entries = new Map<string, Entry>();
  private id(el: HTMLElement) {
    let id = this.ids.get(el);
    if (!id) {
      id = `fp-${this.documentId}-${++this.seq}`;
      this.ids.set(el, id);
    }
    return id;
  }
  scan(): Question[] {
    this.entries.clear();
    const roots = allRoots(document);
    const controls = roots
      .flatMap((root) => [...root.querySelectorAll<HTMLElement>(selector)])
      .filter((el) => {
        if (
          el instanceof HTMLInputElement &&
          [
            'hidden',
            'submit',
            'reset',
            'button',
            'image',
            'file',
            'password',
            'range',
            'color',
          ].includes(el.type)
        )
          return false;
        if (el.matches(':disabled,[aria-disabled="true"],[readonly],[aria-readonly="true"]'))
          return false;
        if (el.parentElement?.closest('[contenteditable="true"],[role="textbox"]')) return false;
        // Many component libraries render a native input inside an ARIA wrapper. Keep one control only.
        if (el.matches('input') && el.closest('[role="radio"],[role="checkbox"],[role="combobox"]'))
          return false;
        return isVisible(el);
      });
    const visited = new Set<HTMLElement>();
    for (const el of controls) {
      if (visited.has(el)) continue;
      const type = getType(el);
      let elements = [el];
      if ((type === 'radio' || type === 'checkbox') && !(el instanceof HTMLSelectElement)) {
        const name = el.getAttribute('name'),
          container = questionContainer(el);
        if (name)
          elements = controls.filter(
            (other) =>
              getType(other) === type &&
              other.getAttribute('name') === name &&
              other.getRootNode() === el.getRootNode() &&
              (other as HTMLInputElement).form === (el as HTMLInputElement).form,
          );
        else if (container)
          elements = controls.filter(
            (other) => getType(other) === type && questionContainer(other) === container,
          );
      }
      elements.forEach((e) => visited.add(e));
      const container = questionContainer(el);
      const label = questionLabel(el, type === 'radio' || type === 'checkbox');
      let optionNodes: HTMLElement[] = [],
        options: Option[] = [];
      if (el instanceof HTMLSelectElement) {
        optionNodes = [...el.options].filter((o) => !o.disabled && !!o.value);
        options = optionNodes.map((o, index) => ({
          id: `o${index}`,
          label: (o as HTMLOptionElement).text.trim(),
          value: (o as HTMLOptionElement).value,
        }));
      } else if (type === 'radio' || type === 'checkbox') {
        optionNodes = elements;
        options = elements.map((e, index) => ({
          id: `o${index}`,
          label: labelled(e) || text(e) || (e as HTMLInputElement).value || '',
          value: e.getAttribute('value') || String(index),
        }));
      } else if (type === 'select') {
        const root = rootOf(el);
        const owned = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
        const list = owned ? root.getElementById(owned) : el;
        optionNodes = [...(list?.querySelectorAll<HTMLElement>('[role="option"]') || [])];
        options = optionNodes
          .filter((o) => o.getAttribute('aria-disabled') !== 'true')
          .map((o, index) => ({
            id: `o${index}`,
            label: text(o),
            value: o.getAttribute('data-value') || text(o),
          }));
      }
      const name = el.getAttribute('name') || el.id;
      const heading = text(
        container?.closest('section')?.querySelector('h1,h2,h3') || document.querySelector('h1'),
      );
      const context = [
        heading,
        container
          ? text(
              container.querySelector('[role="note"],.description,.help-text,[data-description]'),
            )
          : '',
      ]
        .filter(Boolean)
        .join(' — ')
        .slice(0, 1500);
      const q: Question = {
        id: this.id(el),
        frameId: 0,
        text: label.slice(0, 2000),
        type,
        options,
        required:
          elements.some(
            (e) => e.hasAttribute('required') || e.getAttribute('aria-required') === 'true',
          ) || /\*\s*$/.test(label),
        name,
        autocomplete: el.getAttribute('autocomplete') || '',
        context,
        currentValue: currentValue(elements, type),
        sensitive:
          blocked.test(`${label} ${name} ${el.getAttribute('autocomplete')}`) ||
          consent.test(label) ||
          options.some(
            (o) =>
              blocked.test(o.label) ||
              ((type === 'checkbox' || type === 'radio') && consent.test(o.label)),
          ) ||
          (type === 'checkbox' && elements.length === 1),
        constraints: {
          min: el.getAttribute('min') || undefined,
          max: el.getAttribute('max') || undefined,
          pattern: el.getAttribute('pattern') || undefined,
          maxLength:
            el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
              ? el.maxLength > 0
                ? el.maxLength
                : undefined
              : undefined,
        },
      };
      if (type === 'select' && !options.length) q.type = 'unknown';
      this.entries.set(q.id, { question: q, elements, options: optionNodes });
    }
    return [...this.entries.values()].map((e) => e.question);
  }
  async fill(answer: Answer, preserveExisting: boolean): Promise<FillResult> {
    const entry = this.entries.get(answer.questionId);
    const failure = (reason: string) => ({ questionId: answer.questionId, success: false, reason });
    if (!entry) return failure('Field changed. Scan again.');
    const { question: q, elements, options } = entry;
    const el = elements[0];
    if (
      !elements.every(
        (e) => isVisible(e) && !e.matches(':disabled,[readonly],[aria-disabled="true"]'),
      )
    )
      return failure('Field is no longer available.');
    if (
      questionLabel(el, q.type === 'radio' || q.type === 'checkbox').slice(0, 2000) !== q.text ||
      getType(el) !== q.type
    )
      return failure('Question changed since scanning. Scan again.');
    if (
      blocked.test(`${q.text} ${el.getAttribute('name')} ${el.getAttribute('autocomplete')}`) ||
      consent.test(q.text) ||
      q.sensitive
    )
      return failure('Sensitive field or consent requires manual input.');
    if (q.options.length) {
      const now =
        el instanceof HTMLSelectElement
          ? [...el.options].filter((o) => !o.disabled && !!o.value).map((o) => o.text.trim())
          : q.type === 'radio' || q.type === 'checkbox'
            ? elements.map((e) => labelled(e) || text(e) || (e as HTMLInputElement).value || '')
            : options.map((o) => text(o));
      if (now.length !== q.options.length || now.some((label, i) => label !== q.options[i].label))
        return failure('Available choices changed. Scan again.');
    }
    const current = currentValue(elements, q.type);
    if (preserveExisting && current) return failure('Existing value preserved.');
    if (current !== q.currentValue) return failure('Field changed after scanning. Scan again.');
    const values = Array.isArray(answer.answer) ? answer.answer : [answer.answer];
    if (q.type !== 'checkbox' && values.length !== 1) return failure('Expected a single answer.');
    const value = values[0] || '';
    if (values.some((v) => !v.trim())) return failure('Answer is empty.');
    if (
      q.options.length &&
      values.some((v) => q.options.filter((o) => normalize(o.label) === normalize(v)).length !== 1)
    )
      return failure('Choice is missing or ambiguous.');
    if (q.constraints?.maxLength && value.length > q.constraints.maxLength)
      return failure('Answer exceeds the field length limit.');
    try {
      if (el instanceof HTMLSelectElement) {
        for (const option of [...el.options])
          option.selected = q.options.some(
            (o) =>
              o.value === option.value && values.some((v) => normalize(v) === normalize(o.label)),
          );
        fire(el);
      } else if (q.type === 'radio' || q.type === 'checkbox') {
        for (let i = 0; i < elements.length; i++) {
          const node = elements[i];
          const wanted = values.some((v) => normalize(v) === normalize(q.options[i]?.label || ''));
          const checked =
            node instanceof HTMLInputElement
              ? node.checked
              : node.getAttribute('aria-checked') === 'true';
          if (wanted !== checked) node.click();
        }
      } else if (q.type === 'select') {
        const index = q.options.findIndex((o) => normalize(o.label) === normalize(value));
        if (index < 0 || !options[index]) return failure('Custom dropdown needs manual review.');
        if (!isVisible(options[index])) {
          el.click();
          await delay(120);
        }
        if (!isVisible(options[index])) return failure('Dropdown option is not accessible.');
        options[index].click();
      } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        if (el instanceof HTMLInputElement) {
          const probe = document.createElement('input');
          probe.type = el.type;
          probe.value = value;
          for (const attr of ['min', 'max', 'pattern', 'step'])
            if (el.hasAttribute(attr)) probe.setAttribute(attr, el.getAttribute(attr)!);
          if (!probe.value || !probe.checkValidity())
            return failure('Answer does not match the field format.');
        }
        const proto =
          el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
        fire(el);
      } else if (
        el.isContentEditable ||
        el.getAttribute('contenteditable') === 'true' ||
        el.getAttribute('role') === 'textbox'
      ) {
        el.textContent = value;
        fire(el);
      } else return failure('Unsupported custom control.');
      await delay(160);
      const after = currentValue(elements, q.type);
      const expected =
        q.type === 'checkbox' ? values.map(normalize).sort().join('|') : normalize(value);
      const actual =
        q.type === 'checkbox'
          ? elements[0] instanceof HTMLSelectElement
            ? [...elements[0].selectedOptions]
                .map((o) => normalize(o.text))
                .sort()
                .join('|')
            : elements
                .filter((e) =>
                  e instanceof HTMLInputElement
                    ? e.checked
                    : e.getAttribute('aria-checked') === 'true',
                )
                .map((e) => normalize(labelled(e) || text(e)))
                .sort()
                .join('|')
          : normalize(after);
      if (actual !== expected)
        return failure('The website did not retain the answer. Please review.');
      q.currentValue = after;
      return { questionId: q.id, success: true, reason: 'Filled and verified.' };
    } catch {
      return failure('This control could not be filled safely.');
    }
  }
}
function fire(el: HTMLElement) {
  el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  el.dispatchEvent(new FocusEvent('blur', { bubbles: true, composed: true }));
}
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
