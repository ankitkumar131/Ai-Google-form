# FormPilot AI 1.0.4 — multi-batch Google Forms completion

## User report and verification boundary

The user reported a 30-question Google Form initially receiving only 12 answers, reaching 29 only after five clicks on Answer all. The actual respondent URL and Activity report have not been supplied, so the exact cause of those counts and the last unanswered question remain unconfirmed. This release addresses concrete orchestration/control defects and reproduces a 12-of-30 partial-response scenario in a controlled 30-question Google-style fixture. It is not a claim that every question on the user's form is automatically answerable or that a live Google Form/account has been certified.

## Confirmed defects and changes

- **Batch failure stopped later batches.** The old generation loop had one catch around every batch. A failure in batch two meant batch three was never requested. Each batch is now isolated and later batches still get a turn.
- **All generation happened before filling.** Local and earlier successful answers waited for all later requests; the global deadline could prevent them from being applied. Local answers and completed batches now fill immediately, so a later failure/cancellation does not throw away verified progress.
- **One malformed/omitted row rejected the whole batch.** Form filling now opts into independently validating rows from a complete JSON `answers` envelope. Valid known-ID/type/choice/confidence rows can be used, while invalid/missing rows remain unfilled. All rows with duplicate IDs are rejected; unknown IDs are never remapped. Extra envelope fields, oversized batches, malformed syntax and wholly invalid responses still fail. Default parsing and connection tests remain strict.
- **Bounded missing-answer recovery.** Only omitted/invalid rows get new requests, never already returned uncertain/empty answers or completed fields. Recovery has at most two levels and six extra requests globally, within the existing 120-second run deadline. Whole malformed batches can be split. Auth/network/quota failures do not acquire a second independent recovery loop. Provider-level retry/fallback remains bounded. Extra requests can incur provider charges.
- **Delayed and re-rendered choice controls.** Choice clicks wait for each transition before moving on. Radios click only the desired option, not an old selected option that could undo a delayed update. Dropdowns poll for opening rather than using a fixed 120ms sleep. Detached controls/options can be rebound only to a unique exact question snapshot on the same URL. Changed/ambiguous questions, choices, names, contexts, constraints and user-entered values are not overwritten.
- **One bad control no longer aborts a frame's remaining fill results.** Content handling catches errors per answer and continues other fields. Cancellation is checked inside delayed choice/dropdown operations.
- **Final verification is read-only.** After all batches, `FP_VERIFY` checks completed values. If later renders or user actions cleared/changed an answer, the report marks it for review without silently reapplying it.

## Regression evidence

**177 unit tests and 23 Chromium browser regressions** cover existing safety/provider/vault/backup/layout behavior plus these changes. New tests include:

1. A 30-question Google-style form with radios, checkbox groups, closed dropdowns and text controls, including off-screen questions. Every committed answer re-renders the form's children. Choices settle asynchronously; dropdowns open after 350ms.
2. An intercepted provider intentionally returns only four valid answers for each initial batch of ten: 12 initially. One run requests only the remaining questions with batch sizes **10, 10, 10, 6, 6, 6, 2, 2, 2**, finishes **30/30**, verifies retained values, and never submits. A second run preserves all 30 existing answers without any new provider calls.
3. A failed middle batch still permits the last ten questions to complete, preserving 20 verified answers and reporting ten review items honestly.
4. A provider's low-confidence final answer correctly produces **29 filled / 1 review**, with no uncertainty retries or automatic submit.
5. Unit checks cover cancellation preserving progress, bounded recovery caps, duplicate/unknown/invalid partial rows, exact rebinds versus ambiguous/changed targets, user edits, unexpected checkbox changes and final-value/choice-set changes.

The browser tests bundle the real runner, content handler, detector, provider, vault, storage and report code, with Chrome's API boundary emulated and HTTP intercepted. They do not use real keys, call a live model, or install a native Chrome action popup. No private form/account details or credentials are embedded in the fixture.

## Update and check your form

1. Keep the existing extension installed. Replace files in the **same unpacked-extension folder**, click **Reload** at `chrome://extensions`, and verify **1.0.4**. Do not uninstall or load a different folder.
2. Close old dashboard/popup windows and **refresh the Google Form tab** so the new content handler (including final verification) is loaded. Save/copy any unsaved manual responses before refreshing; draft persistence is controlled by the site. Chrome/the form may retain drafts; leave preservation on if you want to keep them.
3. Unlock the saved vault, confirm the working provider/model, and click Answer all **once**. Wait for progress to finish. No automatic submission occurs.
4. Check Activity for every detected question's status/reason. A missing personal fact, consent/sensitive field, uncertain response, changed control, provider failure, inaccessible section or deadline can legitimately remain for review. Do not repeatedly click to force these into guessed answers.
5. For a multipage form, navigate to the next section yourself and run again; FormPilot does not automatically click Next/Submit or discover inaccessible branches.
6. If the same form still misses questions, share the respondent link if safe to share (not an edit/admin link), or a redacted Activity report showing detected counts and the remaining reasons. Do not share API keys or private responses. Without this evidence we cannot certify the exact 30-question form or determine its remaining manual question.
