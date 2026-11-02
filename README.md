# FormPilot AI

A privacy-conscious **Manifest V3 Chrome extension** that gets repetitive form filling out of the way. Built from [`instruction.md`](instruction.md) using React, TypeScript, Vite, SCSS, Lucide, Zod, Chrome APIs and IndexedDB.

## Get started

Requires **Node.js 22+** and **Chrome 120+**.

```sh
npm ci
npm run build
```

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select this repository's **`dist`** directory (not the repository itself).
3. The first-install profile page opens automatically. Add whichever details you want; nothing is required unless you mark it with a star.
4. In **AI providers**, create a vault passphrase (at least 12 characters), add an API key and model, enable the provider and test the connection. The default model IDs are editable; availability depends on your provider account.
5. Reload any form pages that were open before installation. Open the extension popup and click **Answer all**.
6. Review the completion report in **Activity**, inspect the original form, and submit it yourself. FormPilot **never submits** a form.

**No API key is required for profile matches or confirmed saved answers.** AI requests use your own provider account and may incur charges. Never put keys in source files, environment variables intended for Vite, or the web preview.

### Web preview

```sh
npm run dev
```

Open the printed Vite URL. The responsive dashboard has usable local profile, preference, provider-order and question-bank editing. It is explicitly marked **Web preview**. It **cannot scan other tabs, store API keys, unlock a vault, or call providers**. Those capabilities require the installed extension. Preview data uses its own browser-local demo storage and is separate from extension data.

To try a safe form, visit `http://localhost:5173/playground.html` in the same Chrome browser with the extension installed. It contains native fields, radio/checkbox groups, an ARIA radio group, contenteditable, an open shadow root, a dynamic field and an iframe. It never sends submissions anywhere. The development server is also bound to `0.0.0.0` for hosted previews.

## What is implemented

- Popup with **Answer all**, progress, cancellation, profile selection shortcut and completion summary.
- Full dashboard: overview, multiple profiles, providers, question bank, activity, settings and first-run guidance.
- Native text/email/tel/number/date/URL inputs, textareas, selects, multiple selects, radio/checkbox groups, contenteditable, accessible ARIA controls and open shadow roots.
- Labels, `aria-labelledby`, `aria-label`, autocomplete, placeholders, field names, headings, context, required indicators and field constraints.
- Site hints for **Google Forms, Microsoft Forms, Workday and LinkedIn**, plus a generic accessible-control fallback for other websites. No manual domain list.
- Frame-aware scanning including accessible cross-origin frames with the granted host permissions. Per-document unique question IDs prevent old reports targeting new documents.
- Mutation/SPA invalidation and fresh scans on each user run. New/lazy-loaded sections are picked up by the next run; the extension deliberately does not fire AI requests in response to DOM mutations.
- Local profile matching using aliases and field-description semantics, without treating every sentence containing “city” or “email” as personal information.
- Confirmed-answer memory in IndexedDB, scoped to each profile, with save/search/edit/delete. Token similarity helps search; **automatic reuse requires normalized question equality** to avoid negation/direction/context mistakes.
- Central untrusted-data prompt, relevant profile facts only, strict Zod validation, option/ID/type checking, bounded retries, timeouts and priority fallback.
- Seven adapters: **OpenAI, Anthropic, Gemini, OpenRouter, Groq, DeepSeek and custom OpenAI-compatible HTTPS endpoints**.
- Confidence-based review, exact choice matching, native setters and DOM events, preserved existing values, stale-field guards, format validation and verification of retained values.
- Review reports with answer sources (**Profile / Saved answer / AI / Manual**), manual correction/application, and explicit confirmation before saving an answer.
- Encrypted API-key vault, sanitized local failure logs, private data export, vault reset and complete data deletion.
- Text resume attachments (`.txt`/`.md`, up to 1 MB) stored locally for reference. Add verified resume facts to profile fields; attachments are not sent automatically to AI or uploaded into websites.

## Safety and privacy

- Passwords, file inputs, payment/identity/security fields and consent/legal attestations are not automatically filled. Single checkboxes are treated conservatively as requiring manual input.
- Existing answers are preserved by default. Low-confidence, unsupported, ambiguous or missing answers stay for review; uncertainty alone **does not trigger provider fallback**.
- No analytics, account system, telemetry or FormPilot backend. Provider requests happen only after a user initiates a run (or tests a connection).
- Host permission **`<all_urls>`** is needed for universal detection and API calls to configurable endpoints; `webNavigation` enumerates frames. Only HTTP(S) content scripts are installed. Chrome's protected pages remain inaccessible.
- Profile data is not encrypted; it is in `chrome.storage.local` restricted to `TRUSTED_CONTEXTS`. Question memory and reports live in extension-origin IndexedDB. Non-sensitive preferences also use `chrome.storage.sync`.
- API keys are encrypted at rest using **AES-256-GCM**, a fresh 96-bit IV on each write, and **PBKDF2-SHA-256 (310,000 iterations)** with a random salt. Your passphrase is not persisted. The derived unlock key is in trusted `chrome.storage.session`, so it survives worker restarts but not the browser session. Use **Lock vault** to remove it sooner.
- This is not an OS keychain: a compromised device, browser, unlocked extension context or malicious extension update can access data. There is no passphrase recovery. Resetting the vault discards keys but keeps profiles.
- Only the background worker performs provider requests. Content scripts cannot read settings or vaults or invoke AI APIs. Keys are never returned to the UI or sent to page scripts. Gemini uses a header, not a query-string key. API redirects and non-HTTPS endpoints are rejected.
- **Use trusted endpoints only.** Your key goes to the endpoint you configure. Only the relevant subset of profile facts is included, but question text and nearby form descriptions are also sent and may themselves contain personal information. Each fallback provider receives that same batch. Review providers' own privacy policies.
- Exports contain personal information and confirmed answers, **never API keys**. Keep exports private. Clearing Activity removes reports and sanitized failure logs. Deleting all local data removes the database contents, preferences and vault.

See [architecture](docs/ARCHITECTURE.md) and [testing / compatibility](docs/TESTING.md).

## Development

```sh
npm run dev           # dashboard preview, port 5173 by default
npm run typecheck     # strict TypeScript, including tests
npm test              # unit/integration tests
npm run build         # checked dashboard + bundled content and background scripts
npm run format:check
npm audit

# Browser tests (one-time browser/dependency install required)
npx playwright install --with-deps chromium
npm run test:e2e
```

`CHROMIUM_EXECUTABLE=/path/to/chromium npm run test:e2e` uses a locally installed browser instead of Playwright's downloaded browser. Rebuild and click **Reload** in `chrome://extensions` after changing extension code, then reload your test webpages. Vite HMR is only for the web dashboard, not installed extension scripts.

The CI workflow checks formatting, tests, the build and browser workflows, then uploads the unpacked extension as an artifact. It does not publish to the Chrome Web Store or use real API credentials.

## Important boundaries

“Universal” means standards-based best effort, **not a guarantee on every website**. Closed shadow roots, browser-protected pages, CAPTCHAs, canvas forms, inaccessible/virtualized controls and some custom dropdowns need manual handling. Do not use this to bypass access controls, site rules, or assessments that prohibit assistance.

The extension does not navigate multi-page forms, click Next, scroll to materialize hidden sections, or submit; load the next section yourself and run it again. It scans up to 200 accessible questions per run, sends AI batches of 10, allows up to 2 retries per provider, caps individual requests at 25 seconds (MV3 worker constraint), and cancels AI work after 2 minutes. Review remaining questions in another run. A closed popup does not intentionally cancel the worker; a browser or worker shutdown may interrupt it.

Model confidence is self-reported, **not a calibrated correctness guarantee**. Always review important answers. The prompt prohibits invented personal facts, and known missing identity fields are handled locally, but no generative model can guarantee that it never makes a mistake.

PDF/DOCX resume parsing, automatic file uploads, embedding-based semantic retrieval, multilingual field-alias dictionaries, Web Store distribution and certified compatibility with live vendor forms are not claimed by this implementation. Real API calls and full installed-extension behavior must be smoke-tested in Chrome with your own accounts; automated tests use mocked APIs and a real browser for dashboard/DOM behavior.
