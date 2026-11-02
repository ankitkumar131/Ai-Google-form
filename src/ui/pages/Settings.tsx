import { useState } from 'react';
import { CheckCheck, Download, Globe2, LockKeyhole, ShieldCheck, Trash2 } from 'lucide-react';
import { download, request } from '../bridge';
import { Button, SectionHead, Toggle } from '../components';
import type { PageProps } from '../types';
export function SettingsPage({ state, update, notify, refresh }: PageProps) {
  const [busy, setBusy] = useState(false);
  const set = (key: string, value: unknown) =>
    void update(
      'SAVE_SETTINGS',
      { settings: { ...state.settings, [key]: value } },
      'Preference saved.',
    ).catch((e) => notify(e.message));
  return (
    <div className="settings-columns">
      <section className="panel settings-panel">
        <SectionHead
          title="A copilot, not an autopilot"
          description="A few thoughtful guardrails for every form."
        />
        {[
          {
            key: 'preserveExisting',
            label: 'Keep existing answers',
            description: 'Never overwrite fields you have already completed.',
          },
          {
            key: 'autoReuse',
            label: 'Reuse confirmed answers',
            description: 'Fill matching questions from your active profile’s Question bank.',
          },
          {
            key: 'aiEnabled',
            label: 'Use AI for unanswered questions',
            description:
              'Share question text and relevant profile facts with your configured providers.',
          },
        ].map((s) => (
          <div className="setting-row" key={s.key}>
            <div>
              <strong>{s.label}</strong>
              <p>{s.description}</p>
            </div>
            <Toggle
              label={s.label}
              checked={!!state.settings[s.key as keyof typeof state.settings]}
              onChange={(value) => set(s.key, value)}
            />
          </div>
        ))}
        <div className="setting-row">
          <div>
            <strong>Minimum AI confidence</strong>
            <p>
              Below this threshold, we ask you to review. Confidence is model-reported, not a
              guarantee.
            </p>
          </div>
          <select
            aria-label="Minimum AI confidence"
            value={state.settings.confidence}
            onChange={(e) => set('confidence', Number(e.target.value))}
          >
            {[0.5, 0.7, 0.8, 0.85, 0.9, 0.95, 1].map((n) => (
              <option key={n} value={n}>
                {Math.round(n * 100)}%
              </option>
            ))}
          </select>
        </div>
      </section>
      <section className="panel settings-panel">
        <SectionHead
          title="Your data belongs to you"
          description="Stored on this device. Never on a FormPilot server."
        />
        <div className="privacy-points">
          <p>
            <ShieldCheck size={19} />
            <span>
              Profiles use trusted extension-local storage. Confirmed answers and activity use
              extension-origin IndexedDB.
            </span>
          </p>
          <p>
            <LockKeyhole size={19} />
            <span>
              Keys use passphrase-derived AES-GCM encryption. Unlocked keys are accessible to
              trusted extension contexts during your session. This cannot protect a compromised
              device.
            </span>
          </p>
          <p>
            <Globe2 size={19} />
            <span>
              “All websites” access enables universal detection without domain lists. Data goes to
              AI only when you click Answer all. Chrome-protected pages, closed shadow roots, and
              inaccessible controls cannot be filled.
            </span>
          </p>
          <p>
            <CheckCheck size={19} />
            <span>
              No auto-submission. No passwords, payment details, identity numbers, or automated
              consent.
            </span>
          </p>
        </div>
        <div className="setting-row">
          <div>
            <strong>Export your data</strong>
            <p>
              Profiles and confirmed answers. Never API keys. The file contains personal
              information—keep it private.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                download('formpilot-private-backup.json', await request('EXPORT'));
                notify('Private backup downloaded.');
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            <Download size={15} /> Export
          </Button>
        </div>
        <div className="setting-row">
          <div>
            <strong>Reset API vault</strong>
            <p>
              Forgot your passphrase? Remove encrypted keys and configure them again. Profiles are
              kept.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={busy || !state.vaultConfigured}
            onClick={async () => {
              if (!confirm('Delete all saved API keys and reset the vault?')) return;
              setBusy(true);
              try {
                await update(
                  'RESET_VAULT',
                  {},
                  'Vault reset. Set up a new passphrase in Providers.',
                );
              } catch (e) {
                notify((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Reset vault
          </Button>
        </div>
        <div className="setting-row danger-zone">
          <div>
            <strong>Delete all local data</strong>
            <p>
              Delete profiles, answers, activity, keys and synced preferences. This cannot be
              undone.
            </p>
          </div>
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              if (!confirm('Permanently delete ALL FormPilot data? This cannot be undone.')) return;
              setBusy(true);
              try {
                await update('DELETE_ALL', {}, 'All FormPilot data deleted.');
                await refresh();
              } catch (e) {
                notify((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Trash2 size={15} /> Delete all
          </Button>
        </div>
      </section>
    </div>
  );
}
