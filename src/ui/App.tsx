import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  LayoutDashboard,
  Menu,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';
import type { AppState, RunReport, SavedAnswer } from '../shared/types';
import { initialState } from '../shared/defaults';
import { isExtension, request } from './bridge';
import { Brand, Busy, Button } from './components';
import type { Page } from './types';
import { Overview } from './pages/Overview';
import { Profiles } from './pages/Profiles';
import { Providers } from './pages/Providers';
import { QuestionBank } from './pages/QuestionBank';
import { ActivityPage } from './pages/Activity';
import { SettingsPage } from './pages/Settings';
import { Help, Launch, ReportModal } from './dialogs';
const nav = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'profiles', label: 'My profiles', icon: UserRound },
  { id: 'providers', label: 'AI providers', icon: Sparkles },
  { id: 'bank', label: 'Question bank', icon: BookOpen },
  { id: 'activity', label: 'Activity', icon: Activity },
] as const;
const pageNames: Record<Page, string> = {
  overview: 'Overview',
  profiles: 'My profiles',
  providers: 'AI providers',
  bank: 'Question bank',
  activity: 'Activity',
  settings: 'Settings',
};
function route(): Page {
  const p = location.hash.slice(1);
  return ['overview', 'profiles', 'providers', 'bank', 'activity', 'settings'].includes(p)
    ? (p as Page)
    : 'overview';
}
export function App() {
  const [page, setPage] = useState<Page>(route),
    [state, setState] = useState<AppState>(initialState),
    [bank, setBank] = useState<SavedAnswer[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [toast, setToast] = useState(''),
    [help, setHelp] = useState(false),
    [menu, setMenu] = useState(false),
    [launch, setLaunch] = useState(false),
    [report, setReport] = useState<RunReport | null>(null);
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    const handler = () => {
      setPage(route());
      setMenu(false);
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  const go = (p: Page) => {
    location.hash = p;
    setPage(p);
    setMenu(false);
  };
  const refresh = useCallback(async () => {
    try {
      const [s, b] = await Promise.all([request('STATE'), request<SavedAnswer[]>('BANK_LIST')]);
      setState(s);
      setBank(b);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    if (!isExtension) return;
    const listener = () => void refresh();
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const update = async (type: string, payload: Record<string, unknown>, success?: string) => {
    const s = await request(type, payload);
    setState(s);
    if (success) notify(success);
    return s;
  };
  const props = { state, bank, go, update, notify, refresh, setReport };
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? 'visible' : ''}`}>
        <a href="#overview" className="brand-link" aria-label="FormPilot AI home">
          <Brand />
        </a>
        <div className="workspace">
          <span className="workspace-avatar">
            P<span />
          </span>
          <div>
            <strong>Personal workspace</strong>
            <small>Your everyday copilot</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <p className="nav-heading">WORKSPACE</p>
        <nav>
          {nav.map((item) => (
            <a key={item.id} href={`#${item.id}`} className={page === item.id ? 'active' : ''}>
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.id === 'providers' && <span className="nav-count">7</span>}
              {item.id === 'bank' && bank.length > 0 && (
                <span className="nav-count">{bank.length}</span>
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="private-note">
            <span className="shield-icon">
              <ShieldCheck size={21} />
            </span>
            <strong>Private by design.</strong>
            <p>
              Your profile stays here.
              <br />
              You decide what AI sees.
            </p>
            <button onClick={() => go('settings')}>
              Your privacy controls <ArrowUpRight size={13} />
            </button>
          </div>
          <a
            href="#settings"
            className={page === 'settings' ? 'bottom-link active' : 'bottom-link'}
          >
            <Settings2 size={18} /> Settings
          </a>
          <button className="bottom-link" onClick={() => setHelp(true)}>
            <CircleHelp size={18} /> Help & getting started <ArrowUpRight size={14} />
          </button>
          <div className="sidebar-footer">
            <span className="avatar">
              {String(
                state.profiles.find((p) => p.id === state.settings.activeProfileId)?.firstName ||
                  'Y',
              )
                .slice(0, 1)
                .toUpperCase()}
            </span>
            <div>
              <strong>
                {state.profiles.find((p) => p.id === state.settings.activeProfileId)?.name ||
                  'Your workspace'}
              </strong>
              <small>Local account · v1.0</small>
            </div>
            <span className="online-dot" />
          </div>
        </div>
      </aside>
      {menu && <div className="mobile-shade" onClick={() => setMenu(false)} />}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <span className="slash">/</span>
            <strong>{pageNames[page]}</strong>
          </div>
          <div className="topbar-actions">
            <span className="local-status">
              <span />
              {isExtension ? 'Stored locally' : 'Web preview'}
            </span>
            <span className="topbar-divider" />
            <button
              className="icon-button"
              aria-label="Help and setup"
              onClick={() => setHelp(true)}
            >
              <CircleHelp size={19} />
            </button>
            <button className="avatar" aria-label="Open profiles" onClick={() => go('profiles')}>
              Y
            </button>
          </div>
        </header>
        <main>
          <div className="page-title">
            <div>
              <p className="eyebrow">YOUR FORMS. LESS FRICTION.</p>
              <h1>
                {page === 'overview'
                  ? 'A little less filling. A lot more living.'
                  : pageNames[page]}
              </h1>
              <p className="muted">
                {
                  {
                    overview: 'Your personal command center for getting forms out of the way.',
                    profiles: 'The details that make every answer feel like you.',
                    providers: 'Your favorite models. One reliable copilot.',
                    bank: 'Good answers deserve to be remembered.',
                    activity: 'Every filled field, with a clear paper trail.',
                    settings: 'Make FormPilot work your way.',
                  }[page]
                }
              </p>
            </div>
            {page === 'overview' && (
              <Button variant="outline" onClick={() => setHelp(true)}>
                <CircleHelp size={16} /> Quick guide <ArrowUpRight size={14} />
              </Button>
            )}
          </div>
          {error && (
            <div role="alert" className="notice danger">
              {error}
              <button
                onClick={() => {
                  setError('');
                  void refresh();
                }}
              >
                Retry
              </button>
            </div>
          )}
          {loading ? (
            <div className="loading-panel">
              <Busy label="Opening your workspace…" />
            </div>
          ) : (
            <>
              {page === 'overview' && <Overview {...props} onLaunch={() => setLaunch(true)} />}
              {page === 'profiles' && <Profiles {...props} />}
              {page === 'providers' && <Providers {...props} />}
              {page === 'bank' && <QuestionBank {...props} />}
              {page === 'activity' && <ActivityPage {...props} />}
              {page === 'settings' && <SettingsPage {...props} />}
            </>
          )}
          <footer className="page-footer">
            <span>
              <ShieldCheck size={13} /> Made for your workflow. Built around your privacy.
            </span>
            <span>
              FormPilot AI <span className="footer-dot">•</span> v1.0.0
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div role="status" className="toast">
          <Check size={17} />
          {toast}
          <button aria-label="Dismiss notification" onClick={() => setToast('')}>
            <X size={15} />
          </button>
        </div>
      )}
      {help && <Help onClose={() => setHelp(false)} />}
      {launch && (
        <Launch
          onClose={() => setLaunch(false)}
          onReport={(r) => {
            setReport(r);
            setLaunch(false);
            void refresh();
          }}
        />
      )}
      {report && <ReportModal report={report} onClose={() => setReport(null)} {...props} />}
    </div>
  );
}
