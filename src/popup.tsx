import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CheckCheck,
  CircleAlert,
  FileCheck2,
  Globe2,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRound,
  WandSparkles,
} from 'lucide-react';
import { Brand, Badge, Busy, Button } from './ui/components';
import { isExtension, request } from './ui/bridge';
import { initialState } from './shared/defaults';
import type { RunReport } from './shared/types';
import './ui/styles.scss';
function Popup() {
  const [state, setState] = useState(initialState),
    [tab, setTab] = useState<chrome.tabs.Tab>(),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(''),
    [error, setError] = useState(''),
    [report, setReport] = useState<RunReport>();
  useEffect(() => {
    request('STATE')
      .then(setState)
      .catch((e) => setError(e.message));
    if (!isExtension) return;
    let listener:
      ((changes: Record<string, chrome.storage.StorageChange>, area: string) => void) | undefined;
    chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
      setTab(tab);
      if (tab?.id === undefined) return;
      const id = tab.id,
        key = `run-${id}`;
      const s = await chrome.storage.session.get(key);
      if (s[key]?.running && Date.now() - s[key].startedAt < 180000) {
        setBusy(true);
        setProgress(s[key].message);
      }
      listener = (changes, area) => {
        if (area === 'session' && changes[key]) {
          const run = changes[key].newValue;
          setBusy(!!run?.running);
          setProgress(run?.message || '');
          if (!run?.running)
            request('STATE')
              .then((s) => {
                setState(s);
                setReport(s.history.find((r) => r.tabId === id));
              })
              .catch((e) => setError(e.message));
        }
      };
      chrome.storage.onChanged.addListener(listener);
    });
    return () => {
      if (listener) chrome.storage.onChanged.removeListener(listener);
    };
  }, []);
  const open = (page = 'overview') => {
    if (isExtension) void chrome.tabs.create({ url: chrome.runtime.getURL(`index.html#${page}`) });
    else location.href = `index.html#${page}`;
  };
  const profile = state.profiles.find((p) => p.id === state.settings.activeProfileId);
  const site = tab?.url && /^https?:/.test(tab.url) ? new URL(tab.url).hostname : '';
  const aiIssue = report?.results.find((r) =>
    /No (?:enabled AI provider|provider succeeded)|Unlock your API key vault/.test(r.reason),
  )?.reason;
  return (
    <div className="popup">
      <header className="popup-header">
        <Brand small />
        <button className="icon-button" aria-label="Open settings" onClick={() => open('settings')}>
          <Settings2 size={19} />
        </button>
      </header>
      <div className="popup-content">
        <Badge tone="green">
          <Sparkles size={12} /> YOUR EVERYDAY COPILOT
        </Badge>
        <h1>
          Let’s get this form
          <br />
          out of your way.
        </h1>
        <p className="muted">Your profile. Your words. A little AI magic.</p>
        <div className="popup-site">
          <Globe2 size={18} />
          <span>{site || 'Open a website with a form'}</span>
          <span className="online-dot" />
        </div>
        <button className="popup-profile" onClick={() => open('profiles')}>
          <span className="soft-icon">
            <UserRound size={20} />
          </span>
          <div>
            <strong>{profile?.name || 'Set up your profile'}</strong>
            <small>{profile ? 'Active autofill profile' : 'Add your details once'}</small>
          </div>
          <ArrowUpRight size={15} />
        </button>
        {!state.vaultUnlocked && state.settings.aiEnabled && (
          <div className="popup-hint">
            <ShieldCheck size={15} />
            <span>
              Profile autofill is ready.{' '}
              <button onClick={() => open('providers')}>Unlock your vault</button> for AI answers.
            </span>
          </div>
        )}
        {error && (
          <div role="alert" className="notice danger">
            <CircleAlert size={17} />
            {error}
          </div>
        )}
        {report && (
          <div className="popup-report" role="status">
            {aiIssue && (
              <div role="alert" className="notice danger">
                {aiIssue}
              </div>
            )}
            <div>
              <FileCheck2 size={21} />
              <strong>
                {report.results.filter((r) => r.status === 'filled').length} filled & verified
              </strong>
            </div>
            <p>
              {report.results.length} questions detected ·{' '}
              {report.provider || 'Local matching only'}
            </p>
            <p>
              {report.results.filter((r) => r.status === 'review' || r.status === 'failed').length}{' '}
              need review · {report.results.filter((r) => r.status === 'skipped').length} preserved
            </p>
            <Button variant="outline" className="full" onClick={() => open('activity')}>
              Review completion report <ArrowUpRight size={14} />
            </Button>
          </div>
        )}
        <div className="popup-links">
          <button onClick={() => open('bank')}>
            <BookOpen size={15} /> Question bank
          </button>
          <button onClick={() => open()}>
            Open dashboard <ArrowUpRight size={14} />
          </button>
        </div>
      </div>
      <div className="popup-action-area">
        <Button
          className="full popup-answer"
          disabled={busy || !site}
          onClick={async () => {
            if (tab?.id === undefined) return;
            setBusy(true);
            setError('');
            setReport(undefined);
            try {
              setReport(await request<RunReport>('RUN', { tabId: tab.id }));
              setState(await request('STATE'));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? (
            <Busy label={progress || 'Finding your form…'} />
          ) : (
            <>
              <WandSparkles size={19} /> Answer all <ArrowRight size={18} />
            </>
          )}
        </Button>
        {busy && (
          <button
            className="text-link popup-cancel"
            onClick={() =>
              void request('CANCEL', { tabId: tab?.id }).catch((e) => setError(e.message))
            }
          >
            Cancel run
          </button>
        )}
        <p className="popup-assurance">
          <CheckCheck size={13} /> Nothing gets submitted. You’re in control.
        </p>
      </div>
      <footer className="popup-footer">
        <ShieldCheck size={12} /> Private by design. Thoughtful by default.
      </footer>
    </div>
  );
}
document.body.classList.add('popup-page');
createRoot(document.getElementById('root')!).render(<Popup />);
