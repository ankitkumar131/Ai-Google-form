import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  CircleHelp,
  ShieldCheck,
  WandSparkles,
  Zap,
} from 'lucide-react';
import type { FieldResult, RunReport } from '../shared/types';
import { isExtension, request } from './bridge';
import { Badge, Busy, Button, Modal } from './components';
import type { PageProps } from './types';
export function Help({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="A small setup. A lot less busywork." onClose={onClose}>
      <div className="help-steps">
        {[
          [
            '01',
            'Install FormPilot',
            'Run npm install and npm run build in the repository. Open chrome://extensions, enable Developer mode, choose Load unpacked, and select the dist folder.',
          ],
          [
            '02',
            'Make it yours',
            'Create a profile, then set up a vault and connect at least one AI provider. Profile autofill works without an AI key.',
          ],
          [
            '03',
            'Open a form. Answer all.',
            'Reload websites that were open before installation. Click the extension icon and Answer all. We fill accessible fields and verify them.',
          ],
          [
            '04',
            'Take a final look',
            'Review uncertain answers in the report, check the original form, and submit it yourself when you’re ready. Save only answers you have confirmed.',
          ],
        ].map(([number, title, description]) => (
          <div key={number}>
            <span>{number}</span>
            <section>
              <h3>{title}</h3>
              <p>{description}</p>
            </section>
          </div>
        ))}
      </div>
      <div className="notice compact">
        <CircleHelp size={18} />
        <span>
          The web preview lets you explore settings using local demo storage. Real website access,
          API calls, and encrypted keys require the installed Chrome extension.
        </span>
      </div>
      <Button className="full" onClick={onClose}>
        Got it <Check size={16} />
      </Button>
    </Modal>
  );
}
export function Launch({
  onClose,
  onReport,
}: {
  onClose: () => void;
  onReport: (r: RunReport) => void;
}) {
  const [tabs, setTabs] = useState<chrome.tabs.Tab[]>([]),
    [selected, setSelected] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    if (isExtension)
      chrome.tabs
        .query({ currentWindow: true })
        .then((t) => {
          const sites = t.filter((t) => t.id && t.url && /^https?:/.test(t.url));
          setTabs(sites);
          setSelected(String(sites.find((t) => t.active)?.id || sites[0]?.id || ''));
        })
        .catch((e) => setError(e.message));
  }, []);
  return (
    <Modal
      title={isExtension ? 'Ready for a little less filling?' : 'Your copilot is an extension away'}
      onClose={onClose}
    >
      {isExtension ? (
        <>
          <p className="muted">
            Choose an open website. We’ll match your profile and saved answers first, then ask your
            configured AI. Nothing will be submitted.
          </p>
          <label className="field">
            Website
            <select value={selected} disabled={busy} onChange={(e) => setSelected(e.target.value)}>
              <option value="">Choose a website…</option>
              {tabs.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title || t.url}
                </option>
              ))}
            </select>
          </label>
          {!tabs.length && (
            <p className="form-note">
              Open a website with a form in this window, then return here.
            </p>
          )}
          {error && (
            <div role="alert" className="notice danger">
              {error}
            </div>
          )}
          <Button
            className="full"
            disabled={!selected || busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                onReport(await request<RunReport>('RUN', { tabId: Number(selected) }));
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? (
              <Busy label="Answering and verifying…" />
            ) : (
              <>
                <WandSparkles size={17} /> Answer all
              </>
            )}
          </Button>
          {busy && (
            <p className="form-note">
              Keep the form open. You can view the completed run in Activity if you close this
              dialog.
            </p>
          )}
        </>
      ) : (
        <>
          <div className="launch-art">
            <span className="brand-symbol">
              <Zap size={37} fill="currentColor" />
            </span>
          </div>
          <p className="muted">
            You’re exploring the web preview. To scan and fill other websites securely, build and
            load FormPilot in Chrome.
          </p>
          <div className="install-command">
            <code>
              npm install
              <br />
              npm run build
            </code>
          </div>
          <p className="muted">
            Open <strong>chrome://extensions</strong> → Developer mode → Load unpacked → choose{' '}
            <strong>dist</strong>. Then open a form and click the FormPilot icon.
          </p>
          <div className="notice compact">
            <ShieldCheck size={18} />
            <span>
              The web preview cannot access your tabs and does not send requests to AI providers.
            </span>
          </div>
          <Button className="full" onClick={onClose}>
            Sounds good <ArrowRight size={16} />
          </Button>
        </>
      )}
    </Modal>
  );
}
export function ReportModal({
  report,
  onClose,
  state,
  notify,
  refresh,
}: PageProps & { report: RunReport; onClose: () => void }) {
  const [current, setCurrent] = useState(report);
  const [edits, setEdits] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState('');
  const apply = async (row: FieldResult) => {
    setBusy(row.question.id);
    try {
      const text =
        edits[row.question.id] ??
        (Array.isArray(row.answer?.answer)
          ? row.answer.answer.join('\n')
          : row.answer?.answer || row.question.currentValue);
      const s = await request('APPLY_REVIEW', {
        reportId: current.id,
        questionId: row.question.id,
        answer: row.question.type === 'checkbox' ? text.split('\n').filter(Boolean) : text,
      });
      const updated = s.history.find((r) => r.id === current.id);
      if (updated) setCurrent(updated);
      await refresh();
      notify('Reviewed answer filled and verified.');
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  const save = async (row: FieldResult) => {
    if (!state.settings.activeProfileId) {
      notify('Create an active profile before saving answers.');
      return;
    }
    const text =
      edits[row.question.id] ??
      (Array.isArray(row.answer?.answer)
        ? row.answer.answer.join('\n')
        : row.answer?.answer || row.question.currentValue);
    if (!text.trim()) {
      notify('Enter an answer first.');
      return;
    }
    if (!confirm('Confirm this answer is accurate and save it for your active profile?')) return;
    try {
      await request('BANK_SAVE', {
        answer: {
          id: crypto.randomUUID(),
          profileId: state.settings.activeProfileId,
          question: row.question.text,
          answer: row.question.type === 'checkbox' ? text.split('\n').filter(Boolean) : text,
          type: row.question.type,
          updatedAt: new Date().toISOString(),
        },
      });
      await refresh();
      notify('Confirmed answer saved.');
    } catch (e) {
      notify((e as Error).message);
    }
  };
  return (
    <Modal title={`Completion report · ${current.site}`} onClose={onClose} wide>
      <div className="report-summary">
        <div>
          <strong>{current.results.filter((r) => r.status === 'filled').length}</strong>
          <span>Filled & verified</span>
        </div>
        <div>
          <strong>
            {current.results.filter((r) => r.status === 'review' || r.status === 'failed').length}
          </strong>
          <span>Need your review</span>
        </div>
        <div>
          <strong>{current.results.filter((r) => r.status === 'skipped').length}</strong>
          <span>Preserved</span>
        </div>
      </div>
      <p className="form-note">
        Nothing was submitted. Review the original form before sending. Reports may include personal
        information and are kept on this device.
      </p>
      <div className="report-fields">
        {current.results.map((row) => (
          <section className="report-field" key={row.question.id}>
            <div className="report-field-head">
              <h3>{row.question.text}</h3>
              <Badge
                tone={
                  row.status === 'filled' ? 'green' : row.status === 'skipped' ? 'neutral' : 'amber'
                }
              >
                {row.status}
              </Badge>
            </div>
            <div className="report-meta">
              <span>
                {row.question.type}
                {row.question.required ? ' · Required' : ''}
              </span>
              {row.answer && (
                <span>
                  {row.answer.source} · {Math.round(row.answer.confidence * 100)}% confidence
                </span>
              )}
            </div>
            <p className="muted">{row.reason}</p>
            {!row.question.sensitive && (
              <>
                <label className="field">
                  <span className="sr-only">Review answer for {row.question.text}</span>
                  {row.question.options.length && row.question.type !== 'checkbox' ? (
                    <select
                      value={
                        edits[row.question.id] ??
                        ((row.answer?.answer as string) || row.question.currentValue)
                      }
                      onChange={(e) => setEdits({ ...edits, [row.question.id]: e.target.value })}
                    >
                      <option value="">Choose an answer</option>
                      {row.question.options.map((o) => (
                        <option key={o.id} value={o.label}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <textarea
                      rows={2}
                      value={
                        edits[row.question.id] ??
                        (Array.isArray(row.answer?.answer)
                          ? row.answer.answer.join('\n')
                          : row.answer?.answer || row.question.currentValue)
                      }
                      onChange={(e) => setEdits({ ...edits, [row.question.id]: e.target.value })}
                      placeholder={
                        row.question.type === 'checkbox'
                          ? 'One exact option per line'
                          : 'Your reviewed answer…'
                      }
                    />
                  )}
                </label>
                <div className="report-actions">
                  <Button variant="outline" disabled={!!busy} onClick={() => void save(row)}>
                    <BookOpen size={14} /> Confirm & save
                  </Button>
                  {row.question.type !== 'unknown' && (
                    <Button disabled={!!busy} onClick={() => void apply(row)}>
                      {busy === row.question.id ? (
                        <Busy />
                      ) : (
                        <>
                          <Check size={14} /> Apply reviewed answer
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </>
            )}
          </section>
        ))}
      </div>
    </Modal>
  );
}
