// Generate a Windows curl reproduction from the actual request builder and the
// SAME synthetic question as Configure -> Save & test. NO network requests occur
// during generation, and no stored/user credentials or personal facts are read.
import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
const bundle = await build({
  stdin: {
    contents: `export {queryProvider} from './src/services/providers'; export {connectionTestQuestions} from './src/services/provider-diagnostics'; export {defaultProviders} from './src/shared/defaults';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { queryProvider, connectionTestQuestions, defaultProviders } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);
let captured;
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async (url, init) => {
    captured = { url, body: JSON.parse(init.body) };
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                answers: [{ questionId: 'test', questionType: 'text', answer: '4', confidence: 1 }],
              }),
            },
          },
        ],
      }),
    );
  };
  await queryProvider(
    {
      ...defaultProviders.find((p) => p.id === 'openrouter'),
      model: 'google/gemma-4-26b-a4b-it:free',
    },
    'build-only-not-a-real-credential',
    connectionTestQuestions(),
  );
} finally {
  globalThis.fetch = originalFetch;
}
if (!captured || captured.url !== 'https://openrouter.ai/api/v1/chat/completions')
  throw new Error('Unexpected reproduction endpoint');
const body = JSON.stringify(captured.body, null, 2);
if (body.includes('build-only-not-a-real-credential') || body.includes("\n'@"))
  throw new Error('Unsafe reproduction payload');
const script = `# FormPilot structured-answer reproduction. Review, then paste into Windows PowerShell.
# This makes ONE model request (possibly billable), not an authentication-metadata request.
# No profile data is included: only the synthetic question "What is 2 + 2?".
# The payload is generated from the extension's actual request builder.
# Never share your API key. Review the response before sharing any error details.
$key = [System.Net.NetworkCredential]::new("", (Read-Host "OpenRouter API key" -AsSecureString)).Password
$file = $null
try {
  $payload = @'
${body}
'@ | ConvertFrom-Json
  $model = Read-Host "Exact model ID (Enter for google/gemma-4-26b-a4b-it:free)"
  if (-not [string]::IsNullOrWhiteSpace($model)) { $payload.model = $model.Trim() }
  $file = [System.IO.Path]::GetTempFileName()
  [System.IO.File]::WriteAllText($file, ($payload | ConvertTo-Json -Depth 30), [System.Text.UTF8Encoding]::new($false))
  curl.exe --request POST "https://openrouter.ai/api/v1/chat/completions" __PS_CONTINUATION__
    --header "Authorization: Bearer $key" __PS_CONTINUATION__
    --header "Content-Type: application/json" __PS_CONTINUATION__
    --data-binary "@$file" __PS_CONTINUATION__
    --connect-timeout 15 __PS_CONTINUATION__
    --max-time 25 __PS_CONTINUATION__
    --write-out "\\nModel HTTP status: %{http_code}\\n"
}
finally {
  if ($file) { Remove-Item $file -ErrorAction SilentlyContinue }
  Remove-Variable key -ErrorAction SilentlyContinue
}
# HTTP 200 means reachable. The assistant content must ALSO be an answers object
# with questionId "test", questionType "text", an answer and numeric confidence.
# A bare "4" proves connectivity but does NOT meet the form-answer contract.
`;
// Use PowerShell backticks, not Unix backslashes, for command continuations.
await writeFile(
  'dist/Test-OpenRouter-Structured.ps1',
  script.replaceAll('__PS_CONTINUATION__', '`'),
  'utf8',
);
console.log('Generated Windows structured-answer curl reproduction (no live requests).');
