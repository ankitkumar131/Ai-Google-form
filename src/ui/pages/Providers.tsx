import { useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpRight, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import type { Provider } from '../../shared/types';
import { providerSchema } from '../../shared/schema';
import { request } from '../bridge';
import { Badge, Busy, Button, Modal, ProviderIcon, Toggle } from '../components';
import type { PageProps } from '../types';
export function Providers({ state, update, notify }: PageProps) {
  const [editing, setEditing] = useState<Provider | null>(null),
    [key, setKey] = useState(''),
    [passphrase, setPassphrase] = useState(''),
    [busy, setBusy] = useState(false),
    [test, setTest] = useState(''),
    [vault, setVault] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const sorted = [...state.providers].sort((a, b) => a.priority - b.priority);
  const reorder = async (index: number, direction: number) => {
    const list = [...sorted];
    [list[index], list[index + direction]] = [list[index + direction], list[index]];
    await run(() =>
      update(
        'SAVE_PROVIDERS',
        { providers: list.map((p, i) => ({ ...p, priority: i })) },
        'Fallback order updated.',
      ),
    );
  };
  const save = async () => {
    if (!editing) return;
    await run(async () => {
      providerSchema.parse(editing);
      if (key && !state.vaultUnlocked)
        throw new Error('Unlock your vault before saving an API key.');
      await update('SAVE_PROVIDERS', {
        providers: state.providers.map((p) => (p.id === editing.id ? editing : p)),
      });
      if (key) await update('SET_KEY', { id: editing.id, key });
      setKey('');
      setEditing(null);
      notify('Provider configuration saved.');
    });
  };
  return (
    <>
      <div className="provider-security panel">
        <div className="security-icon">
          <KeyRound size={24} />
        </div>
        <div>
          <h3>
            {state.vaultUnlocked
              ? 'Your API vault is unlocked'
              : state.vaultConfigured
                ? 'Your API vault is locked'
                : 'Your keys. Your private vault.'}
          </h3>
          <p>
            Passphrase-encrypted keys, available only to the extension.{' '}
            {state.vaultUnlocked
              ? 'Locks when your browser session ends.'
              : 'Unlock to connect your favorite AI providers.'}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            state.vaultUnlocked
              ? void run(() => update('LOCK', {}, 'API vault locked.'))
              : setVault(true)
          }
        >
          <LockKeyhole size={15} />
          {state.vaultUnlocked
            ? 'Lock vault'
            : state.vaultConfigured
              ? 'Unlock vault'
              : 'Set up vault'}
        </Button>
      </div>
      <div className="section-intro">
        <div>
          <h2>A well-connected copilot.</h2>
          <p className="muted">
            Connect one or more providers. We’ll try them in this order if a request fails.
          </p>
        </div>
        <Badge tone="green">
          {state.providers.filter((p) => p.enabled && p.hasKey).length} of 7 connected
        </Badge>
      </div>
      <div className="provider-list">
        {sorted.map((p, index) => (
          <article className={`panel provider-card ${p.enabled ? 'enabled' : ''}`} key={p.id}>
            <div className="provider-order">
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <button
                  aria-label={`Move ${p.name} up`}
                  disabled={index === 0 || busy}
                  onClick={() => void reorder(index, -1)}
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  aria-label={`Move ${p.name} down`}
                  disabled={index === sorted.length - 1 || busy}
                  onClick={() => void reorder(index, 1)}
                >
                  <ArrowDown size={12} />
                </button>
              </div>
            </div>
            <ProviderIcon id={p.id} />
            <div className="provider-info">
              <h3>
                {p.name}
                {index === 0 && <Badge>First in line</Badge>}
              </h3>
              <p>{p.model || 'Choose your model'}</p>
            </div>
            <span className="provider-timeout">
              {p.timeout / 1000}s timeout · {p.retries} {p.retries === 1 ? 'retry' : 'retries'}
            </span>
            {p.hasKey ? (
              <Badge tone="green">Key saved</Badge>
            ) : (
              <Badge tone="neutral">No key</Badge>
            )}
            <Toggle
              label={`Enable ${p.name}`}
              checked={p.enabled}
              onChange={(enabled) => {
                if (enabled && (!p.hasKey || !p.model || !p.endpoint)) {
                  notify('Configure a model, endpoint and API key first.');
                  setEditing({ ...p });
                  return;
                }
                void run(() =>
                  update('SAVE_PROVIDERS', {
                    providers: state.providers.map((x) => (x.id === p.id ? { ...x, enabled } : x)),
                  }),
                );
              }}
            />
            <Button
              variant="outline"
              onClick={() => {
                setEditing({ ...p });
                setKey('');
                setTest('');
              }}
            >
              Configure <ArrowUpRight size={14} />
            </Button>
          </article>
        ))}
      </div>
      <div className="notice">
        <ShieldCheck size={19} />
        <span>
          Fallback happens on connection errors, timeouts, rate limits, and invalid responses.
          Low-confidence answers go to review—not another model. Requests may incur provider
          charges.
        </span>
      </div>
      {vault && (
        <Modal
          title={state.vaultConfigured ? 'Unlock your API vault' : 'Create your API vault'}
          onClose={() => setVault(false)}
        >
          <div className="vault-illustration">
            <LockKeyhole size={36} />
          </div>
          <p className="muted">
            Keys are encrypted with AES-256-GCM using your passphrase. The unlock key stays in
            trusted extension session storage until you lock the vault or close Chrome.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await update('UNLOCK', { passphrase });
                setPassphrase('');
                setVault(false);
                notify('Vault unlocked.');
              });
            }}
          >
            <label className="field">
              Vault passphrase
              <input
                type="password"
                autoComplete={state.vaultConfigured ? 'current-password' : 'new-password'}
                minLength={12}
                required
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="At least 12 characters"
              />
            </label>
            <p className="form-note">
              Keep it somewhere safe. There is no passphrase recovery. Local encryption does not
              protect against a compromised browser or device.
            </p>
            <div className="modal-actions">
              <Button variant="outline" onClick={() => setVault(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Busy /> : state.vaultConfigured ? 'Unlock vault' : 'Create vault'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {editing && (
        <Modal
          title={`Configure ${editing.name}`}
          onClose={() => {
            setEditing(null);
            setKey('');
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="form-grid">
              <label className="field span-2">
                Model ID
                <input
                  required
                  value={editing.model}
                  onChange={(e) => setEditing({ ...editing, model: e.target.value })}
                  placeholder="Provider model identifier"
                />
              </label>
              <label className="field span-2">
                API base endpoint
                <input
                  type="url"
                  required
                  value={editing.endpoint}
                  onChange={(e) => setEditing({ ...editing, endpoint: e.target.value })}
                  placeholder="https://api.example.com/v1"
                />
              </label>
              <label className="field span-2">
                {editing.hasKey ? 'Replace API key (leave blank to keep)' : 'API key'}
                <input
                  type="password"
                  autoComplete="off"
                  disabled={!state.vaultUnlocked}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder={
                    state.vaultUnlocked ? 'Paste your API key' : 'Unlock your vault to add a key'
                  }
                />
              </label>
              <label className="field">
                Timeout (seconds)
                <input
                  type="number"
                  min={3}
                  max={25}
                  step={1}
                  value={editing.timeout / 1000}
                  onChange={(e) =>
                    setEditing({ ...editing, timeout: Number(e.target.value) * 1000 })
                  }
                />
              </label>
              <label className="field">
                Retries per provider
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={1}
                  value={editing.retries}
                  onChange={(e) => setEditing({ ...editing, retries: Number(e.target.value) })}
                />
              </label>
            </div>
            <div className="setting-row">
              <div>
                <strong>Enable this provider</strong>
                <p>Include in the fallback chain</p>
              </div>
              <Toggle
                label="Enable provider"
                checked={editing.enabled}
                onChange={(enabled) => setEditing({ ...editing, enabled })}
              />
            </div>
            <div className="notice compact">
              <ShieldCheck size={17} />
              <span>
                Your API key is sent to the endpoint above. Use only an endpoint you trust.
                Non-HTTPS endpoints and redirects are rejected.
              </span>
            </div>
            {test && (
              <p className="test-result" role="status">
                {test}
              </p>
            )}
            <div className="modal-actions">
              <Button
                variant="outline"
                disabled={busy || !editing.hasKey || !state.vaultUnlocked}
                onClick={() =>
                  void run(async () => {
                    setTest('Testing…');
                    try {
                      setTest(await request<string>('TEST_PROVIDER', { provider: editing }));
                    } catch (e) {
                      setTest((e as Error).message);
                    }
                  })
                }
              >
                Test connection
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Busy /> : 'Save configuration'}
              </Button>
            </div>
            {editing.hasKey && (
              <button
                type="button"
                className="text-link danger-text"
                disabled={busy || !state.vaultUnlocked}
                onClick={() => {
                  if (confirm('Remove this provider’s API key?'))
                    void run(async () => {
                      await update('SET_KEY', { id: editing.id, key: '' });
                      setEditing({ ...editing, hasKey: false, enabled: false });
                      notify('API key removed.');
                    });
                }}
              >
                Remove saved key
              </button>
            )}
          </form>
        </Modal>
      )}
    </>
  );
}
