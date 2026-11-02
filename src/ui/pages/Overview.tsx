import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  Clock3,
  FileCheck2,
  FileText,
  Fingerprint,
  FolderOpen,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  Sparkles,
  UserRound,
  WandSparkles,
  Zap,
} from 'lucide-react';
import { Badge, Button, ProviderIcon, SectionHead } from '../components';
import type React from 'react';
import type { PageProps } from '../types';
import { ActivityRow } from './Activity';
export function Overview({
  state,
  bank,
  go,
  onLaunch,
  setReport,
}: PageProps & { onLaunch: () => void }) {
  const profile = state.profiles.find((p) => p.id === state.settings.activeProfileId);
  const providers = state.providers.filter((p) => p.enabled && p.hasKey);
  const filled = state.history.reduce(
    (n, r) => n + r.results.filter((f) => f.status === 'filled').length,
    0,
  );
  const reviewed = state.history.reduce(
    (n, r) => n + r.results.filter((f) => f.status === 'review' || f.status === 'failed').length,
    0,
  );
  const basics = ['firstName', 'lastName', 'email', 'mobileNumber', 'city', 'currentJobTitle'];
  const completed = basics.filter((f) => profile?.[f]).length;
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <div className="hero-tag">
            <span /> MEET YOUR FORM-FILLING COPILOT
          </div>
          <h2>
            Less busywork.
            <br />
            More <span>you-time.</span>
          </h2>
          <p>
            From applications to everyday forms, let your
            <br className="desktop-break" /> profile and AI take care of the repetitive stuff.
          </p>
          <div className="hero-actions">
            <Button variant="light" onClick={onLaunch}>
              <WandSparkles size={18} /> Answer all <ArrowRight size={17} />
            </Button>
            <span>You review. You’re in control.</span>
          </div>
          <div className="hero-foot">
            <CheckCheck size={15} /> Never submits forms automatically
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit one" />
          <div className="orbit two" />
          <span className="art-spark s1">✦</span>
          <span className="art-spark s2">✧</span>
          <div className="floating-chip top">
            <span className="mini-check">
              <Check size={12} />
            </span>{' '}
            Profile matched
          </div>
          <div className="illustration-card">
            <div className="illustration-top">
              <span className="tiny-document">
                <FileText size={17} />
              </span>
              <span>A little introduction</span>
              <MoreHorizontal size={17} />
            </div>
            <p>What’s your superpower?</p>
            <div className="illustration-input">
              Making busywork disappear.
              <span />
            </div>
            <div className="illustration-lines">
              <span />
              <span />
            </div>
            <div className="illustration-bottom">
              <span>
                <Sparkles size={12} /> Powered by your profile + AI
              </span>
              <span className="round-check">
                <Check size={15} />
              </span>
            </div>
          </div>
          <div className="floating-chip bottom">
            <Sparkles size={15} />
            <span>Thoughtfully answered</span>
            <Check size={13} />
          </div>
          <span className="illustration-caption">A glimpse of your next form</span>
        </div>
      </section>
      <section className="stats-grid" aria-label="Your local activity">
        <Stat
          icon={<FileCheck2 size={20} />}
          label="Fields filled"
          value={filled}
          foot="Verified, not just entered"
        />
        <Stat
          icon={<FolderOpen size={20} />}
          label="Forms assisted"
          value={state.history.length}
          foot="One less thing on your list"
        />
        <Stat
          icon={<BookOpen size={20} />}
          label="Saved answers"
          value={bank.length}
          foot="Your words, ready to reuse"
        />
        <Stat
          icon={<Fingerprint size={20} />}
          label="Needs your review"
          value={reviewed}
          foot="Because your input matters"
        />
      </section>
      <div className="dashboard-grid">
        <section className="panel profile-panel">
          <SectionHead
            title="Your profile, your head start"
            action={
              <button className="text-link" onClick={() => go('profiles')}>
                Manage profile <ArrowUpRight size={15} />
              </button>
            }
          />
          <div className="profile-intro">
            <div className="profile-avatar">
              {profile ? (
                String(profile.firstName || profile.name)
                  .slice(0, 1)
                  .toUpperCase()
              ) : (
                <UserRound size={27} />
              )}
              {profile && (
                <span>
                  <Check size={10} />
                </span>
              )}
            </div>
            <div>
              <h3>{(profile?.fullName as string) || profile?.name || 'Let’s make it personal'}</h3>
              <p>
                {profile
                  ? 'Your active autofill profile'
                  : 'Add your details once. Skip the repetition.'}
              </p>
            </div>
            <Badge tone={profile ? 'green' : 'neutral'}>
              {profile ? 'Active profile' : 'Not set up'}
            </Badge>
          </div>
          <div className="completion-row">
            <span>Essentials completed</span>
            <strong>
              {completed} of {basics.length}
            </strong>
          </div>
          <div className="progress-track">
            <span style={{ width: `${(completed / basics.length) * 100}%` }} />
          </div>
          <div className="profile-checks">
            {[
              ['firstName', 'Personal details'],
              ['email', 'Contact information'],
              ['currentJobTitle', 'Professional background'],
              ['city', 'Location & links'],
            ].map(([key, label]) => (
              <div key={key}>
                <span className={profile?.[key] ? 'check-dot done' : 'check-dot'}>
                  {profile?.[key] ? <Check size={11} /> : <Plus size={11} />}
                </span>
                {label}
              </div>
            ))}
          </div>
          <div className="panel-bottom">
            <span>
              <LockKeyhole size={13} /> Stored on your device
            </span>
            <button className="text-link" onClick={() => go('profiles')}>
              {profile ? 'Update details' : 'Create your profile'} <ArrowRight size={14} />
            </button>
          </div>
        </section>
        <section className="panel providers-panel">
          <SectionHead title="Your AI crew" action={<Badge>{providers.length} active</Badge>} />
          <p className="panel-subtitle">A reliable answer starts with the right model.</p>
          <div className="provider-mini-list">
            {[...state.providers]
              .sort((a, b) => a.priority - b.priority)
              .slice(0, 3)
              .map((p) => (
                <div className="provider-mini" key={p.id}>
                  <ProviderIcon id={p.id} />
                  <div>
                    <strong>{p.name}</strong>
                    <small>{p.model}</small>
                  </div>
                  {p.enabled && p.hasKey ? (
                    <Badge tone="green">Connected</Badge>
                  ) : (
                    <span className="not-connected">Not connected</span>
                  )}
                </div>
              ))}
          </div>
          <div className="panel-bottom">
            <span>
              <Zap size={13} /> Automatic provider fallback
            </span>
            <button className="text-link" onClick={() => go('providers')}>
              Configure <ArrowRight size={14} />
            </button>
          </div>
        </section>
      </div>
      <section className="panel recent-panel">
        <SectionHead
          title="Recent activity"
          description="A clear view of what your copilot has been up to."
          action={
            <button className="text-link" onClick={() => go('activity')}>
              View all activity <ArrowUpRight size={15} />
            </button>
          }
        />
        {state.history.length ? (
          <div className="activity-list">
            {state.history.slice(0, 3).map((r) => (
              <ActivityRow key={r.id} report={r} onClick={() => setReport(r)} />
            ))}
          </div>
        ) : (
          <div className="activity-empty">
            <span className="soft-icon">
              <Clock3 size={23} />
            </span>
            <div>
              <strong>A fresh start. A little more free time ahead.</strong>
              <p>Your completed runs will appear here. Open a form and let’s get started.</p>
            </div>
            <Button variant="outline" onClick={onLaunch}>
              Try your first form <ArrowRight size={15} />
            </Button>
          </div>
        )}
      </section>
      <div className="tip-strip">
        <span className="tip-icon">
          <Sparkles size={19} />
        </span>
        <p>
          <strong>A good answer is worth keeping.</strong> Save answers you’ve reviewed to your
          Question bank. Your future self will thank you.
        </p>
        <button className="text-link" onClick={() => go('bank')}>
          Explore question bank <ArrowUpRight size={15} />
        </button>
      </div>
    </>
  );
}
function Stat({
  icon,
  label,
  value,
  foot,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  foot: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-label">
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong>
        {value.toLocaleString()}
        <span>{label === 'Needs your review' && value === 0 ? 'All clear' : ''}</span>
      </strong>
      <small>{foot}</small>
    </div>
  );
}
