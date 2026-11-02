import { useState } from 'react';
import {
  CheckCheck,
  Download,
  Globe2,
  LockKeyhole,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { download, request, isExtension } from '../bridge';
import { Button, SectionHead, Toggle, Modal, Busy } from '../components';
import type { PageProps } from '../types';
export function SettingsPage({ state, update, notify, refresh }: PageProps) {
  const [busy, setBusy] = useState(false),
    [exportOpen, setExportOpen] = useState(false),
    [readableKeys, setReadableKeys] = useState(false),
    [backupError, setBackupError] = useState('');
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
            <strong>Complete extension backup</strong>
            <p>
              All profiles, provider models/endpoints/priority, preferences, saved answers, activity
              and API keys. Keys stay encrypted by default; keep the vault passphrase to restore
              them.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setBackupError('');
              setReadableKeys(false);
              setExportOpen(true);
            }}
          >
            <Download size={15} /> Export everything
          </Button>
        </div>
        <div className="setting-row">
          <div>
            <strong>Restore a complete backup</strong>
            <p>
              Replaces existing settings, profiles, answers, activity and API vault. You will unlock
              imported keys with the original vault passphrase.
            </p>
          </div>
          <label className="button outline backup-upload">
            <Upload size={15} />
            {busy ? 'Restoring…' : 'Import backup'}
            <input
              aria-label="Import backup file"
              type="file"
              accept=".json,application/json"
              disabled={busy}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                setBackupError('');
                if (file.size > 20 * 1024 * 1024) {
                  setBackupError('Choose a backup smaller than 20 MB.');
                  return;
                }
                if (
                  !confirm(
                    'Replace all existing FormPilot settings, profiles, answers, activity and API keys with this backup?',
                  )
                )
                  return;
                setBusy(true);
                try {
                  const backup = JSON.parse(await file.text());
                  await update(
                    'IMPORT_BACKUP',
                    { backup },
                    'Complete backup restored. Unlock the imported vault with its original passphrase.',
                  );
                  await refresh();
                } catch (error) {
                  setBackupError(
                    error instanceof SyntaxError
                      ? 'This file is not valid JSON.'
                      : (error as Error).message,
                  );
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
        </div>
        {backupError && !exportOpen && (
          <div role="alert" className="notice danger">
            {backupError}
          </div>
        )}
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
      {exportOpen && (
        <Modal title="Export complete extension settings" onClose={() => setExportOpen(false)}>
          <p className="muted">
            Includes every profile, provider configuration and priority, preference, confirmed
            answer, activity report and connection log. Your encrypted API-key vault is included,
            even when locked.
          </p>
          <div className="notice compact">
            <LockKeyhole size={18} />
            <span>
              Keep your vault passphrase. It is not exported. On restore, use it to unlock the saved
              API keys. Browser-session unlock tokens are deliberately excluded.
            </span>
          </div>
          <label className="export-secret-option">
            <input
              type="checkbox"
              checked={readableKeys}
              disabled={!isExtension || !state.vaultUnlocked}
              onChange={(e) => setReadableKeys(e.target.checked)}
            />
            <span>Also include readable API keys (sensitive)</span>
          </label>
          {!state.vaultUnlocked && (
            <p className="form-note">
              Unlock the vault in AI providers first if you also want readable keys. The normal
              encrypted backup already contains the complete keys.
            </p>
          )}
          {readableKeys && (
            <div className="notice danger compact">
              Anyone with this JSON file will be able to read and use your API keys. Do not upload
              it to GitHub or share it.
            </div>
          )}
          {backupError && (
            <div role="alert" className="notice danger compact">
              {backupError}
            </div>
          )}
          <div className="modal-actions">
            <Button variant="outline" onClick={() => setExportOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                if (
                  readableKeys &&
                  !confirm(
                    'Export readable API keys? Anyone who receives the file can use your provider accounts.',
                  )
                )
                  return;
                setBusy(true);
                setBackupError('');
                try {
                  download(
                    'formpilot-complete-backup.json',
                    await request('EXPORT', { includePlaintextKeys: readableKeys }),
                  );
                  notify('Complete extension backup downloaded.');
                  setExportOpen(false);
                } catch (e) {
                  setBackupError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? (
                <Busy />
              ) : (
                <>
                  <Download size={15} /> Download complete backup
                </>
              )}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
