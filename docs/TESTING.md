# Testing and release checklist

## Automated coverage

`npm test` runs Vitest tests for:

- Profile aliases, name composition, autocomplete, exact choice mapping, missing facts and relevant-only provider context.
- Saved-answer profile/type isolation, ambiguous matches, meaningful negation and directionality.
- DOM labels/types/options, Google-style ARIA radio grouping, hidden/disabled/read-only exclusions, open shadow roots and stable IDs.
- Native input/change events, dropdowns, grouped radios and checkboxes, format/bounds/length constraints, preservation, website rejection, changed labels/options and per-document ID isolation.
- Strict JSON validation, unknown/duplicate/omitted IDs, answer type/option consistency and confidence bounds.
- OpenAI-compatible, Anthropic and Gemini response formats; auth failures, rate-limit retry, malformed JSON fallback, exhaustion, cancellation, HTTPS requirements and sanitized logs.
- Encrypted vault creation, ciphertext-only key persistence, fresh IVs, locking, correct/incorrect passphrases, key deletion and short-passphrase rejection.
- Answer-all orchestration using mocked Chrome APIs, local/profile/memory precedence, frame namespacing, provider exhaustion, uncertainty review, protected-page and empty-form errors.

`npm run test:e2e` runs Playwright with a real Chromium renderer:

- Dashboard empty state, preview disclosure and installation dialog.
- Profile creation, persistence, deletion and confirmed-answer create/search/edit/delete.
- Preference persistence, confidence threshold, provider order, disabled API-key entry in preview.
- Mobile navigation/modal behavior and horizontal overflow checks.
- Actual DOM filling on `playground.html`, including native choices, ARIA radios, an open shadow root, preserved data, consent/payment classification, dynamic fields and no form submission.

No test sends billable API requests. Automated provider responses and Chrome orchestration APIs are mocked. Headless DOM tests inject the same detector module directly; they are not a certification of full Chrome extension installation.

## Installed extension smoke test (Chrome 120+)

1. `npm ci && npm run build`, load `dist` unpacked, verify no errors in `chrome://extensions`.
2. Confirm the first-run profile page opens. Save a profile with first/last name, email, phone, location, links and a truthful professional summary.
3. Serve the repository with `npm run dev`; visit `/playground.html` over HTTP. Reload it after extension installation.
4. Without any API key, run Answer all from the popup. Verify local profile fields and the iframe contact number are filled; existing answers and consent/payment fields remain untouched. AI-only fields should be marked for review.
5. Add and confirm a manual answer in Question bank. Repeat the matching question; verify the report source is **Saved answer**. Change profiles and confirm answers do not leak between profiles.
6. Set up the API vault, configure a provider with your own key and valid model, test the connection, enable it and run the test form. Verify **4** and prime numbers **2, 3** (review factual correctness yourself).
7. Put an invalid key/model first and a working provider second. Verify finite fallback and sanitized connection logs. Test HTTP 429 and timeouts with a trusted development endpoint if available.
8. Lock the vault and restart Chrome. Confirm profile/memory autofill still works and the vault must be unlocked for AI. Confirm incorrect passphrases fail and key fields never reveal saved keys.
9. Open a fresh form with existing values. Toggle preservation and test intended overwrite behavior. Manually change a field during a run and ensure it is not silently overwritten.
10. Add a dynamic field, expand a lazy section and change an SPA route. Run again. Previously completed fields stay preserved by default; newly accessible fields are discovered.
11. Open Activity, review a suggestion, apply it, confirm and save it. Navigate/reload the original page and ensure an old report cannot fill new document IDs.
12. Cancel during AI generation. Close/reopen the popup during a run. Verify the report remains available in Activity after normal completion.
13. Export a complete backup: inspect providers, model/endpoint/order/preferences, profiles, answers, reports/logs and encrypted vault bytes. Confirm no readable keys appear by default. Unlock the vault, explicitly choose readable-key export, confirm the warning and verify that only this opted-in file contains readable keys. Restore the encrypted backup, unlock with its original passphrase and retest a provider. Clear Activity; reset the vault; delete all data and confirm the corresponding stores are empty.
14. Repeat representative native/ARIA flows in Google Forms, Microsoft Forms, a Workday application and LinkedIn Easy Apply using accounts you control. Document regressions; vendor DOMs change frequently.

## Browser limitations

Chrome system pages and the Chrome Web Store cannot run these content scripts. Incognito needs separate user permission; file pages are not supported by content-script match patterns. Cross-origin frames require granted host permissions; restricted/sandboxed frames may remain unavailable. Closed shadow DOM, inaccessible custom controls, canvas forms and CAPTCHAs require manual action. The extension never attempts to circumvent those boundaries.

Before public distribution, perform the installed-extension tests, obtain provider account/model compatibility results, review privacy disclosures/permissions, check accessibility and contrast, and complete Chrome Web Store policy review. Passing local tests is not a substitute for that review.

## 1.0.1 regression coverage

Additional automated tests cover full versus base API URLs, Gemini `models/` prefixes, real fast-404 request dispatch, atomic key persistence across lock/unlock and UI reload, blank-key model edits, concurrent provider saves, complete backup round trips and rollback, stale key metadata, transparent native choice inputs, Google Forms-style delayed ARIA radios/checkboxes/grid rows/closed dropdowns, missing content-script recovery, short popup viewports and provider dialogs from 320×480 through 1366×768. The provider UI workflow uses the real background router/vault/provider modules with emulated Chrome storage/messaging and intercepted HTTP; it does not use real account credentials or constitute an installed-extension certification.
