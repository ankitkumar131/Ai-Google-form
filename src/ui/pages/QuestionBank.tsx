import { useState } from 'react';
import { BookOpen, Check, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { SavedAnswer } from '../../shared/types';
import { similarity } from '../../services/profile';
import { request } from '../bridge';
import { Badge, Busy, Button, Empty, Modal } from '../components';
import type { PageProps } from '../types';
export function QuestionBank({ state, bank, notify, refresh }: PageProps) {
  const [query, setQuery] = useState(''),
    [editing, setEditing] = useState<SavedAnswer | null>(null),
    [saving, setSaving] = useState(false);
  const filtered = bank
    .filter(
      (a) =>
        (a.question + ' ' + a.answer).toLowerCase().includes(query.toLowerCase()) ||
        similarity(query, a.question) > 0.4,
    )
    .filter((a) => a.profileId === state.settings.activeProfileId);
  return (
    <>
      <div className="toolbar">
        <label className="search-input">
          <Search size={17} />
          <input
            aria-label="Search saved answers"
            placeholder="Search your questions and answers…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <Button
          onClick={() => {
            if (!state.settings.activeProfileId) {
              notify('Create a profile first so answers stay with the right person.');
              return;
            }
            setEditing({
              id: crypto.randomUUID(),
              question: '',
              answer: '',
              type: 'text',
              updatedAt: new Date().toISOString(),
              profileId: state.settings.activeProfileId,
            });
          }}
        >
          <Plus size={16} /> Save an answer
        </Button>
      </div>
      <div className="notice compact">
        <BookOpen size={18} />
        <span>
          Showing answers for your active profile. Only confirmed, near-exact question matches are
          reused automatically; similar wording is suggested through search.
        </span>
      </div>
      {filtered.length ? (
        <div className="answer-grid">
          {filtered.map((a) => (
            <article className="panel answer-card" key={a.id}>
              <div className="answer-card-meta">
                <Badge tone="green">
                  <Check size={12} /> Confirmed by you
                </Badge>
                <span>{a.type}</span>
              </div>
              <h3>{a.question}</h3>
              <p>{Array.isArray(a.answer) ? a.answer.join(', ') : a.answer}</p>
              <div className="answer-footer">
                <span>
                  {new Date(a.updatedAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
                <div>
                  <button
                    className="icon-button"
                    aria-label={`Edit ${a.question}`}
                    onClick={() => setEditing({ ...a })}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="icon-button danger-text"
                    aria-label={`Delete ${a.question}`}
                    onClick={async () => {
                      if (!confirm('Delete this saved answer?')) return;
                      try {
                        await request('BANK_DELETE', { id: a.id });
                        await refresh();
                        notify('Saved answer deleted.');
                      } catch (e) {
                        notify((e as Error).message);
                      }
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="panel">
          <Empty
            icon={<BookOpen size={28} />}
            title={query ? 'No matching answers' : 'Your words, ready for next time'}
            description={
              query
                ? 'Try another phrase or clear your search.'
                : 'Save a response you trust. FormPilot can reuse it for matching questions, without asking AI again.'
            }
            action={
              query ? (
                <Button variant="outline" onClick={() => setQuery('')}>
                  Clear search
                </Button>
              ) : undefined
            }
          />
        </section>
      )}
      {editing && (
        <Modal
          title={
            bank.some((a) => a.id === editing.id) ? 'Edit saved answer' : 'Save a confirmed answer'
          }
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              try {
                await request('BANK_SAVE', {
                  answer: { ...editing, updatedAt: new Date().toISOString() },
                });
                await refresh();
                setEditing(null);
                notify('Your answer is saved for next time.');
              } catch (e) {
                notify((e as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            <label className="field">
              Question
              <textarea
                required
                rows={3}
                maxLength={4000}
                value={editing.question}
                onChange={(e) => setEditing({ ...editing, question: e.target.value })}
                placeholder="What does the form ask?"
              />
            </label>
            <label className="field">
              Question type
              <select
                value={editing.type}
                onChange={(e) =>
                  setEditing({ ...editing, type: e.target.value as SavedAnswer['type'] })
                }
              >
                {[
                  'text',
                  'textarea',
                  'email',
                  'tel',
                  'number',
                  'date',
                  'url',
                  'radio',
                  'checkbox',
                  'select',
                  'contenteditable',
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Your confirmed answer
              <textarea
                required
                rows={5}
                maxLength={12000}
                value={Array.isArray(editing.answer) ? editing.answer.join('\n') : editing.answer}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    answer:
                      editing.type === 'checkbox'
                        ? e.target.value.split('\n').filter(Boolean)
                        : e.target.value,
                  })
                }
                placeholder={
                  editing.type === 'checkbox'
                    ? 'One exact option label per line'
                    : 'Your answer, in your own words…'
                }
              />
            </label>
            <p className="form-note">
              Saving confirms that this answer is accurate for your active profile. Use exact option
              labels for choice questions.
            </p>
            <div className="modal-actions">
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <Busy />
                ) : (
                  <>
                    <Check size={15} /> Confirm & save
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
