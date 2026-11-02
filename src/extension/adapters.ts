/** Site hints supplement, never replace, generic accessible HTML detection. */
export interface SiteAdapter {
  name: string;
  matches: (host: string) => boolean;
  container: string;
  title: string;
}
const adapters: SiteAdapter[] = [
  {
    name: 'Google Forms',
    matches: (h) => h === 'docs.google.com' || h === 'forms.google.com',
    container: '.Qr7Oae,.freebirdFormviewerComponentsQuestionBaseRoot,[role="listitem"]',
    title: '[role="heading"],.M7eMe,.freebirdFormviewerComponentsQuestionBaseTitle',
  },
  {
    name: 'Microsoft Forms',
    matches: (h) => h === 'forms.office.com' || h === 'forms.cloud.microsoft',
    container: '[data-automation-id="questionItem"],[data-automation-id="formField"]',
    title: '[data-automation-id="questionTitle"],.office-form-question-title,[role="heading"]',
  },
  {
    name: 'Workday',
    matches: (h) => h.endsWith('.myworkdayjobs.com') || h.endsWith('.myworkday.com'),
    container: '[data-automation-id^="formField"]',
    title: 'label,legend,[role="heading"]',
  },
  {
    name: 'LinkedIn',
    matches: (h) => h === 'www.linkedin.com' || h === 'linkedin.com',
    container:
      '.jobs-easy-apply-form-element,.fb-dash-form-element,.jobs-easy-apply-form-section__grouping',
    title: 'label,legend,[role="heading"]',
  },
];
export const currentAdapter = () => adapters.find((a) => a.matches(location.hostname));
export function adapterContainer(el: HTMLElement): HTMLElement | null {
  const a = currentAdapter();
  return a ? el.closest<HTMLElement>(a.container) : null;
}
export function adapterTitle(container: HTMLElement): Element | null {
  const a = currentAdapter();
  if (a?.name === 'Google Forms')
    return (
      container.querySelector('.M7eMe,.freebirdFormviewerComponentsQuestionBaseTitle') ||
      container.querySelector('[role="heading"]')
    );
  return a ? container.querySelector(a.title) : null;
}
