# FormPilot AI 1.0.3 — model reachable, structured answer rejected

## What the user's evidence establishes

The supplied Windows curl output shows OpenRouter accepting the API key (`GET /key`: HTTP 200) and `google/gemma-4-26b-a4b-it:free` returning plain-text `4` (generation: HTTP 200). The extension screenshot separately shows **API key verified and saved** followed by **Invalid or malformed answer JSON**. Authentication and ordinary model reachability are therefore not the current reported failure.

The earlier curl example requested only a bare number; it did **not** reproduce the extension's structured-answer contract. The raw assistant answer for the extension's request has not been supplied. We cannot claim a particular Gemma output shape caused that failure or certify live account compatibility from mock tests.

## Confirmed code defect and changes

1. The old system prompt said “numbers numeric,” while the validator required scalar answer strings. That contradiction could make `{ "answer": 4 }` fail even inside an otherwise valid answer record. The prompt now explicitly requires strings, including numeric answers, and forbids numeric scalar output.
2. The user turn includes the actual required IDs/types and a zero-confidence empty response template before the separately serialized untrusted question/profile data. This reinforces the contract for routed models that give the system role less weight. It does not embed question text as an instruction.
3. Numeric scalar answers are normalized to strings only for matching text/textarea/number/contenteditable question records, with finite/safe-integer checks. No question ID, type, confidence, option or personal fact is invented or guessed. Boolean/null answers, numeric choice values, unsafe integers and missing confidence remain invalid. Existing strict ID/type/choice/extra-field checks remain.
4. Format errors retain the actual HTTP success status and a safe explanation (for example, missing `answers` array, invalid confidence, mismatched IDs/types or omitted questions). Diagnostics and provider cards distinguish **model responded / answer format failed** from HTTP routing/authentication failures. No raw generated answer is included in stored validation diagnostics.
5. Text content blocks are supported; hidden reasoning is never substituted for an assistant answer. Truncation, missing assistant text and malformed API envelopes receive specific format diagnostics. No new automatic retry/repair requests or model substitution are introduced.

A bare `4` is intentionally **not** accepted as a form answer: silently inventing question metadata/confidence to make a connection badge turn green would hide a real form-filling incompatibility.

## Matching Windows curl reproduction

`npm run build` generates `dist/Test-OpenRouter-Structured.ps1` from the actual request builder and the same synthetic test question used in Configure. Generation intercepts fetch locally and makes **no live requests**. The packaged file contains no credential or profile data.

On Windows, open this file in a text editor and review it, then paste its contents into PowerShell. It asks for a masked key and the exact model ID (Enter selects the model from the report). It makes one model request, potentially billable, with the same messages/output contract and 25-second timeout as the extension's generation test. Unlike the earlier plain-text command, it does not impose a 32-token output limit that could truncate a structured answer.

HTTP 200 alone means reachable. Inspect `choices[0].message.content`: it must contain the identified `answers` envelope, not a bare answer or prose. For the synthetic test, the required ID is `test`, type `text`, with an answer and numeric confidence. If the update still fails, share only the new validation reason or the reviewed synthetic assistant content—not your API key, full authentication response or account metadata. Do not bypass execution policy; reviewing/pasting the script avoids requiring a policy change.

## Verification and limits

- **155 unit tests**, including 30 new format-contract cases: numeric scalar normalization; no invented metadata; confidence bounds; unsafe integers; strict choices; no extraction from prose/examples; exact response templates; reported-model-shaped mocked responses; HTTP-200 format outcomes; content blocks versus hidden reasoning; truncation; API envelope failures; no raw generated text in errors.
- **20 Chromium browser tests**, including a real-background/vault workflow for the reported model ID with intercepted missing-confidence, plain-number and numeric-envelope responses. Failed diagnostics survive reopening/reload; valid numeric structured output passes without loosening confidence/ID checks.
- Typecheck/production build, formatting, audit and diff checks.

These are local/intercepted tests, **not live Gemma/OpenRouter certification**. No real key was requested or used. Native Chrome popup verification limitations from 1.0.2 remain unchanged. The prompt/schema contradiction is confirmed; the exact live response shape in the user's screenshot is still unconfirmed.

## Upgrade

Keep the extension installed. Replace files in the **same unpacked-extension folder**, click **Reload** at `chrome://extensions`, verify **1.0.3**, close old dashboard/popup windows and reopen. Unlock the existing vault and use **Save & test connection** again. Old stored test results retain their original timestamps until retested. Do not uninstall or load a different folder; that can change the extension ID/data store.
