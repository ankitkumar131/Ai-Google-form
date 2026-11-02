# FormPilot AI 1.0.2 — native popup sizing and OpenRouter diagnostics

This follows the user's screenshots showing a tiny native toolbar popup and an OpenRouter HTTP 404, despite 1.0.1's responsive webpage tests passing. Those earlier tests did not establish that the native Chrome popup or the user's account worked.

## Popup

- A stylesheet loaded before JavaScript provides intrinsic **384 × 560 CSS-pixel** document/body/root dimensions. This avoids deriving Chrome's initial document size from its own initially tiny viewport.
- Extension sizing uses available screen dimensions, not the action popup's initial viewport. A short screen reduces the default size; Chrome still controls actual placement and size limits.
- The preview remains viewport-responsive. The scrollable content and fixed action/footer areas remain intact.
- A nonblank startup fallback includes a full-dashboard link if React cannot start.

## OpenRouter

- `GET /api/v1/key` checks authentication separately from the selected model's `POST /api/v1/chat/completions` test. A successful key check followed by a model failure says **API key verified and saved**, not “bad key.” A 401 auth response stops generation. If a proxy lacks the metadata route, model generation is still attempted.
- OpenRouter requests no longer force `response_format` or `temperature`. Some routes cannot support those parameters. The JSON-only system prompt and strict answer validation still apply; malformed or unknown answers are never accepted merely for compatibility.
- HTTP failures retain a bounded `error.message` explanation with the credential/token-like strings redacted. Raw error metadata, HTML bodies and authentication account metadata are not returned to the UI or stored as diagnostics.
- **Load available OpenRouter models** fetches the public catalog without sending a key. Filter and explicitly choose an exact current ID, or type an ID manually. No automatic model substitution, paid-model switch or billable model enumeration is performed. Model tests themselves may incur provider charges.
- A 404 may still reflect unavailable routes, a stale model ID or account/provider restrictions. This release cannot make a provider grant access. The exact cause of the user's screenshot remains unconfirmed without its model ID and sanitized provider explanation. Never share API keys in chat.

## Saved keys and last test

- Configure shows a masked saved-key placeholder and **API key saved securely**; the actual key is never repopulated or sent to the UI.
- Both passed and failed test diagnostics persist: timestamp, model, endpoint, URL, duration, auth status, HTTP status and sanitized explanation. Closing/reopening Configure or reloading the dashboard restores the result.
- Model/endpoint/key replacement clears stale results. Reordering preserves current results. Late test responses for an old model/endpoint/key do not overwrite current diagnostics. Removing a key or resetting the vault clears its test state.
- A failed model test retains the encrypted key. The existing complete backup and Google Forms regressions remain covered.

## Verification and limits

125 unit tests and 19 Chromium browser regressions cover intrinsic dimensions from a 32 × 16 initial viewport, no-JavaScript fallback sizing, responsive popup/dialog layout, separate auth/model results, parameter compatibility, error redaction, timeouts, explicit catalog selection, encrypted key reuse and durable failed/successful results after reload. Provider browser workflows bundle the real background/vault/provider services, with the Chrome messaging/storage boundary emulated and HTTP intercepted. No real keys or billable provider calls are used.

**The available Chromium headless shell does not support a true installed-extension action-popup test.** These checks are not proof of native Chrome toolbar behavior, nor a real OpenRouter account certification. On an actual Chrome installation, verify the popup and provider test after updating as below.

## Update without losing saved data

1. Keep the existing extension installed. Do **not** uninstall it or load a different unpacked folder.
2. Replace the contents of the **same existing unpacked-extension folder** with this ZIP's extension files (or rebuild into the existing `dist` folder).
3. At `chrome://extensions`, click **Reload**, approve any permission prompt, and verify version **1.0.2**.
4. Close old dashboard/popups, reopen the toolbar popup and refresh the form tab. Existing profiles and the encrypted vault should stay associated with the unchanged extension ID.
5. Open AI providers → Configure OpenRouter. Unlock the existing vault; do not re-enter a saved key unless replacing it. Run **Save & test connection**.
6. If model routing fails, read the retained provider explanation. Load the model catalog, deliberately choose a model available to your account (check possible charges), and retry. Confirm the last result remains after reopening Configure.
7. If the native popup is still clipped, use Chrome's extension Options to open the full dashboard and report Chrome version, OS display scaling and a screenshot. Share the model ID and sanitized diagnostic for provider errors—never the API key.
