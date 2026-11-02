# FormPilot 1.0.1 — reported issues

> Historical notes: the user subsequently reproduced a tiny native Chrome toolbar popup and an OpenRouter 404. The responsive webpage tests below did **not** verify Chrome action-popup auto-sizing or the user’s provider account. See [1.0.2](FIXES-1.0.2.md) for the follow-up changes and current limits.

## 1. Clipped interface

Chrome action popups cannot grow indefinitely (normally a 600px height cap). The previous layout allowed the content to grow beyond that height, and its React root did not establish a definite percentage-height chain. The popup now has an explicit viewport-bound root, a scrolling content region, and a persistent Answer all action area. Sidebars scroll on short screens, modal headers stay outside scrollable bodies, long URLs wrap, and narrow settings rows wrap instead of overflowing.

Browser regressions exercise 320×320, 384×480 and 384×600 popups, plus provider dialogs at 320×480, 480×320, 768×432, 1024×600 and 1366×768.

## 2. Google Forms detection/selection

- Prefer actual Google question titles instead of a generic “Your answer” input label.
- Group choice grids by their individual radiogroups, not the entire question card.
- Read Google answer values/ARIA labels consistently when scanning and verifying.
- Do not mistake hidden dropdown options or the “Choose” placeholder for an existing answer.
- Support transparent native choices when an associated visible label is available; retain native inputs that explicitly declare their own ARIA role.
- Poll retained values briefly instead of assuming every site commits a selection within one fixed delay.
- Inject the scanner on a user-initiated run if an existing tab missed installation-time content scripts. An isolated-world sentinel prevents duplicate listeners.
- Show detected question counts and provider-unavailable reasons in the popup rather than conflating detection with AI answer availability.

Browser tests use representative Google Forms HTML on an intercepted `docs.google.com` URL, including delayed choices, grid rows and closed dropdowns. These are regression fixtures, not proof that every live Google form works. The specific reported form still needs verification with its respondent URL or sanitized DOM/screenshot.

## 3. API details not saving / immediate 404

Previously, provider configuration and the API key were written in separate requests. They are now prepared and published together with one storage write, serialized against other provider changes, and checked after persistence. Blank key fields preserve saved keys. The UI explicitly says that a blank password box does not mean the existing key was lost. New provider setup enables the provider by default, unless the user chooses otherwise.

Pasting a full operation URL previously produced duplicated paths, such as `/chat/completions/chat/completions`; Gemini `models/` prefixes could also be encoded into an invalid model path. Base URLs, known provider roots and full operation URLs are now normalized before saving/testing/request dispatch.

**Save & test connection** uses the current unsaved model, endpoint and key, persists them, then performs the real request. The result shows the request URL and elapsed milliseconds. Errors distinguish validation, rejected keys, missing models/endpoints, permissions, rate limits and server failures. No artificial delay is added: a fast HTTP 404 can be genuine. A failed connection test after saving explicitly says the settings/key were saved; failure is not confused with a persistence error.

Tests exercise the actual background/vault/provider code with emulated Chrome APIs and intercepted HTTP, including an encrypted key surviving a page reload and a genuine dispatched request receiving a fast 404. No real provider account is used.

## 4. Complete export (including keys)

Settings → **Export everything** now includes:

- All profiles and resume references
- All seven provider configurations, including models, URLs, enable flags, priority, timeouts and retries
- Every preference
- Confirmed answer memory
- Activity reports and sanitized failure logs
- The complete encrypted API-key vault

The default backup contains the keys encrypted, and works while the vault is locked. Retain the original passphrase. For readable API keys, unlock the vault, explicitly check **Also include readable API keys**, and confirm the security warning. That file is sensitive and must not be shared or committed.

Version-2 backups can be imported in Settings. Import validates the backup before replacement, restores both IndexedDB stores in one transaction, rolls back failed persistent writes and locks the imported vault. Session unlock material and the passphrase are intentionally excluded. Restore the vault with its original passphrase.

## Upgrade without losing existing data

Do not uninstall. Replace/build files in the **same unpacked-extension folder**, click Reload in `chrome://extensions`, approve updated permissions if prompted, close old dashboard/popups, reopen, and refresh your form. A newly loaded folder may receive a different extension ID and therefore a separate data store.
