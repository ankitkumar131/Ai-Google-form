# Architecture

## Boundaries

```text
React popup / dashboard (trusted extension pages)
  │ typed request envelope; no keys in routine state responses
  ▼
MV3 background worker
  ├─ sender validation + Zod request validation
  ├─ chrome.storage local/sync/session access restricted to TRUSTED_CONTEXTS
  ├─ passphrase key vault → provider adapters → HTTPS AI APIs
  ├─ profiles / answer memory / IndexedDB activity reports
  └─ run coordinator
       ├─ webNavigation.getAllFrames → FP_SCAN on each accessible frame
       ├─ local profile → confirmed answer → batched provider fallback
       ├─ validate answer ID, type, schema, exact options, confidence
       └─ incremental FP_FILL → read-only FP_VERIFY → report
            ▼
       Isolated content-script world in each website frame
         DOM + site adapter + open shadow roots
         native setters / user-like choice clicks / input & change events
         no vault, profile database, provider API or page-message bridge
```

The extension UI is compiled by Vite. `scripts/build-extension.mjs` uses esbuild to make a single IIFE content script and an ESM service worker. All executable code is bundled locally; no remote scripts, `eval`, or inline extension scripts. `public/manifest.json` and icons are copied into `dist`.

## Modules

- `src/shared/`: entities, default providers, profile fields and Zod validation.
- `src/services/profile.ts`: field-description matching, relevant fact selection, normalized exact memory reuse and token-based search similarity.
- `src/services/provider-config.ts`: serialized, atomic configuration + encrypted-key writes, blank-key preservation and persisted-key verification.
- `src/services/backup.ts` / `src/shared/backup.ts`: complete version-2 export/import, encrypted vault by default, explicitly authorized readable-key export, schema validation and rollback.
- `src/services/vault.ts`: background-only encryption, unlock, lock and key updates.
- `src/services/providers.ts`: OpenAI-compatible, Anthropic and Gemini wire formats; prompt construction; strict response parsing; bounded retry/fallback.
- `src/services/memory.ts`: transaction-complete IndexedDB access, separate `answers` and `reports` stores.
- `src/services/storage.ts`: trusted settings, report retention and serialized failure logging.
- `src/extension/adapters.ts`: Google/Microsoft/Workday/LinkedIn DOM hints.
- `src/extension/detector.ts`: extraction and safe fill/verification, isolated per document.
- `src/extension/content.ts`: extension-only scan/fill bridge and debounced invalidation.
- `src/extension/runner.ts`: per-tab locks, scan/match/generate/fill/report pipeline and cancellation budget.
- `src/extension/background.ts`: trusted-page request router. Page/content-script senders cannot call settings, vault, AI, or fill orchestration.
- `src/ui/pages/`: six dashboard pages. `components.tsx`: reusable components. `dialogs.tsx`: installation guidance, tab selection and per-field reports.
- `src/ui/bridge.ts`: extension transport or explicitly limited local web-preview adapter.
- `src/popup.tsx`: active-tab workflow and progress subscription.

## Data model

Questions carry frame + document-local IDs, accessible text, type, available options, context, constraints, required flags, current values and sensitivity classification. Node references never leave the content script. Answers carry matching IDs, types, a string/checkbox array, confidence, source and optional explanation. Reports retain each original question and the outcome, including preserved/manual-review/failed states.

Profile IDs namespace confirmed answers. Multiple profiles are supported now, not just reserved for later. All profile fields are optional; user-selected mandatory fields are validated before saving. Resume text stays in the profile as a local reference, never in the provider payload.

IndexedDB retains at most 20 run reports. Failure logs retain 50 sanitized records. Confirmed answers persist until edited/deleted. There is no server-side storage. Neither IndexedDB nor Chrome local storage is an encrypted personal-data store; only API keys receive application-level encryption.

## Failure semantics

- HTTP/auth/network failures, timeout, malformed JSON, omitted/duplicate IDs, incompatible types, impossible option labels: bounded retries where transient, then next enabled provider in priority order.
- Valid but uncertain answers: stop fallback and mark for review.
- Missing known personal facts: review, not invention.
- No usable provider: finish local matches and report unanswered questions.
- Page value changed, label/options changed, duplicate choice labels, disconnected control, invalid format, or rejected DOM update: do not claim successful filling.
- Original document replaced: its unique question IDs no longer exist. Applying an old report requires a fresh scan/run.
- User cancellation or run time budget: abort provider requests; leave remaining answers for review. No automated navigation or submission.

## Why no automatic semantic reuse?

Token overlap alone loses negation and word order (“move from Pune to Mumbai” versus the reverse). The Question bank uses similarity for discovery/search, but only normalized exact wording (with an optional leading “please”) is eligible for automatic reuse. User confirmation remains the trust boundary. Embedding retrieval could later suggest more matches without silently applying them.

## Complete backups

A backup contains profiles, providers, preferences, saved answers, reports, failure logs and encrypted vault bytes. Optional readable keys require explicit UI consent and an unlocked vault. Neither the passphrase nor the derived session unlock key is exported. Provider writes and backup snapshots/restores share a serialized lock. Restore validates all references before writes, replaces answers/reports atomically in IndexedDB, compensates persistent-store failures with the previous snapshot, and locks the imported vault.

## Bounded multi-batch completion (1.0.4)

`runAll` commits profile/memory matches first, then commits each successful provider batch without waiting for the entire generation loop. Batch failures are isolated. The default parser and connection tests remain strict; only the run path opts into per-row validation of a complete JSON envelope. Duplicate, unknown, missing-confidence and invalid-choice rows are not filled. Omitted/invalid rows are re-requested at most two recovery levels with a global cap of six extra requests, respecting the original 120-second cancellation budget. Entire malformed batches may be split; network/auth/quota errors retain provider-level retry behavior. Explicit uncertainty/empty answers are never escalated into extra attempts.

The detector resolves detached controls using an exact unique snapshot (URL, text, type, field name, context, required/sensitive flags, options and constraints). It retains original value-change checks and never matches by ordinal position. Choice transitions are polled sequentially with cancellation checks. `FP_VERIFY` is read-only and audits completed values after the last batch; changed/cleared values become review items rather than triggering an overwrite.
