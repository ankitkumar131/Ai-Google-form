import { useState } from 'react';
import { Check, FileText, Pencil, Plus, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import type { Profile } from '../../shared/types';
import { profileGroups } from '../../shared/defaults';
import { profileSchema } from '../../shared/schema';
import { Badge, Busy, Button, Empty, Modal } from '../components';
import type { PageProps } from '../types';
export function Profiles({ state, update, notify }: PageProps) {
  const [editing, setEditing] = useState<Profile | null>(null),
    [saving, setSaving] = useState(false);
  const [resumeBusy, setResumeBusy] = useState(false);
  const save = async () => {
    if (!editing) return;
    try {
      setSaving(true);
      profileSchema.parse(editing);
      for (const key of editing.mandatory)
        if (!editing[key])
          throw new Error(
            `Complete the required field: ${
              Object.values(profileGroups)
                .flat()
                .find(([k]) => k === key)?.[1] || key
            }`,
          );
      await update(
        'SAVE_PROFILE',
        { profile: editing },
        'Profile saved. You’re ready for your next form.',
      );
      setEditing(null);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Check the profile fields.');
    } finally {
      setSaving(false);
    }
  };
  const change = (key: string, value: string) =>
    setEditing((p) => (p ? { ...p, [key]: value } : p));
  const resume = async (file?: File) => {
    if (!file || !editing) return;
    if (file.size > 1000000) {
      notify('Please use a text resume smaller than 1 MB.');
      return;
    }
    setResumeBusy(true);
    try {
      const text = await file.text();
      if (text.includes('\u0000')) throw new Error('Please upload a plain .txt or .md resume.');
      setEditing((p) =>
        p ? { ...p, resumeText: text.slice(0, 100000), resumeName: file.name } : p,
      );
      notify('Resume stored locally. Add verified facts to your profile to use them for autofill.');
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setResumeBusy(false);
    }
  };
  return (
    <>
      <div className="toolbar">
        <span className="muted">
          {state.profiles.length} {state.profiles.length === 1 ? 'profile' : 'profiles'} · Switch
          profiles for different workflows
        </span>
        <Button
          onClick={() =>
            setEditing({ id: crypto.randomUUID(), name: 'Personal profile', mandatory: [] })
          }
        >
          <Plus size={16} /> New profile
        </Button>
      </div>
      {state.profiles.length ? (
        <div className="profile-cards">
          {state.profiles.map((p) => (
            <article className="panel profile-summary" key={p.id}>
              <div className="profile-card-top">
                <span className="profile-avatar">{String(p.firstName || p.name).slice(0, 1)}</span>
                {state.settings.activeProfileId === p.id ? (
                  <Badge tone="green">Active profile</Badge>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() =>
                      void update(
                        'SAVE_SETTINGS',
                        { settings: { ...state.settings, activeProfileId: p.id } },
                        'Active profile changed.',
                      ).catch((e) => notify(e.message))
                    }
                  >
                    Use profile
                  </Button>
                )}
              </div>
              <h3>{p.name}</h3>
              <p>
                {(p.fullName as string) ||
                  [p.firstName, p.lastName].filter(Boolean).join(' ') ||
                  'Add your name'}
              </p>
              <div className="muted">{(p.email as string) || 'No email added'}</div>
              <div className="profile-card-actions">
                <Button variant="outline" onClick={() => setEditing(structuredClone(p))}>
                  <Pencil size={14} /> Edit profile
                </Button>
                <button
                  className="icon-button danger-text"
                  aria-label={`Delete ${p.name}`}
                  onClick={async () => {
                    if (confirm('Delete this profile and its saved answers?'))
                      try {
                        await update('DELETE_PROFILE', { id: p.id }, 'Profile deleted.');
                      } catch (e) {
                        notify((e as Error).message);
                      }
                  }}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="panel">
          <Empty
            icon={<UserRound size={29} />}
            title="Every good copilot gets to know you"
            description="Add only what you’re comfortable sharing. All fields are optional, and your profile stays on your device."
            action={
              <Button
                onClick={() =>
                  setEditing({ id: crypto.randomUUID(), name: 'Personal profile', mandatory: [] })
                }
              >
                <Plus size={16} /> Create your first profile
              </Button>
            }
          />
        </section>
      )}
      <div className="notice">
        <ShieldCheck size={19} />
        <span>
          Profile matches are filled locally. Only relevant facts are shared when AI is needed.
          Sensitive fields and consent always require your input.
        </span>
      </div>
      {editing && (
        <Modal
          title={
            state.profiles.some((p) => p.id === editing.id)
              ? 'Edit your profile'
              : 'Create your profile'
          }
          onClose={() => setEditing(null)}
          wide
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label className="field">
              Profile name
              <input
                value={editing.name}
                maxLength={100}
                required
                onChange={(e) => change('name', e.target.value)}
                placeholder="e.g. Personal, Job applications"
              />
            </label>
            <p className="form-note">
              Everything below is optional. Use the star to require a field in this profile before
              saving.
            </p>
            {Object.entries(profileGroups).map(([group, fields]) => (
              <section className="form-section" key={group}>
                <h3>{group}</h3>
                <div className="form-grid">
                  {fields.map(([key, label]) => (
                    <label
                      className={`field ${key === 'professionalSummary' ? 'span-2' : ''}`}
                      key={key}
                    >
                      <span>
                        {label}
                        <button
                          type="button"
                          className={`required-star ${editing.mandatory.includes(key) ? 'selected' : ''}`}
                          title="Require this field in your profile"
                          aria-label={`Make ${label} ${editing.mandatory.includes(key) ? 'optional' : 'required'}`}
                          aria-pressed={editing.mandatory.includes(key)}
                          onClick={() =>
                            setEditing((p) =>
                              p
                                ? {
                                    ...p,
                                    mandatory: p.mandatory.includes(key)
                                      ? p.mandatory.filter((k) => k !== key)
                                      : [...p.mandatory, key],
                                  }
                                : p,
                            )
                          }
                        >
                          ★
                        </button>
                      </span>
                      {key === 'professionalSummary' ? (
                        <textarea
                          aria-label={label}
                          rows={4}
                          value={(editing[key] as string) || ''}
                          onChange={(e) => change(key, e.target.value)}
                          placeholder="Your experience, in your own words…"
                        />
                      ) : (
                        <input
                          aria-label={label}
                          type={
                            key.toLowerCase().includes('email')
                              ? 'email'
                              : key.endsWith('Url')
                                ? 'url'
                                : key === 'dateOfBirth'
                                  ? 'date'
                                  : 'text'
                          }
                          required={editing.mandatory.includes(key)}
                          value={(editing[key] as string) || ''}
                          onChange={(e) => change(key, e.target.value)}
                          placeholder={label}
                        />
                      )}
                    </label>
                  ))}
                </div>
              </section>
            ))}
            <section className="form-section">
              <h3>Resume</h3>
              <p className="muted">
                Attach a plain text resume (.txt or .md, up to 1 MB). Stored locally for reference;
                never uploaded to websites or automatically sent to AI. Copy verified facts into the
                fields above.
              </p>
              <label className="file-drop">
                <FileText size={24} />
                <strong>
                  {resumeBusy ? 'Reading resume…' : editing.resumeName || 'Choose a text resume'}
                </strong>
                <input
                  type="file"
                  accept=".txt,.md,text/plain,text/markdown"
                  onChange={(e) => void resume(e.target.files?.[0])}
                />
              </label>
              {editing.resumeName && (
                <button
                  type="button"
                  className="text-link danger-text"
                  onClick={() =>
                    setEditing((p) =>
                      p ? { ...p, resumeName: undefined, resumeText: undefined } : p,
                    )
                  }
                >
                  Remove resume
                </button>
              )}
            </section>
            <div className="modal-actions">
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || resumeBusy}>
                {saving ? (
                  <Busy label="Saving…" />
                ) : (
                  <>
                    <Check size={16} /> Save profile
                  </>
                )}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
