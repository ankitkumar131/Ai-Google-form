import { Activity, ArrowUpRight, Globe2, Trash2 } from 'lucide-react';
import type { RunReport } from '../../shared/types';
import { Badge, Button, Empty, SectionHead } from '../components';
import type { PageProps } from '../types';
export function ActivityRow({ report, onClick }: { report: RunReport; onClick: () => void }) {
  const filled = report.results.filter((r) => r.status === 'filled').length;
  return (
    <button className="activity-row" onClick={onClick}>
      <span className="site-icon">
        <Globe2 size={20} />
      </span>
      <div>
        <strong>{report.site}</strong>
        <small>{new Date(report.date).toLocaleString()}</small>
      </div>
      <span className="activity-provider">{report.provider || 'Local matching'}</span>
      <Badge tone="green">{filled} filled</Badge>
      <Badge
        tone={
          report.results.some((r) => r.status === 'review' || r.status === 'failed') ? 'amber' : ''
        }
      >
        {report.results.filter((r) => r.status === 'review' || r.status === 'failed').length} to
        review
      </Badge>
      <ArrowUpRight size={17} />
    </button>
  );
}
export function ActivityPage({ state, update, notify, setReport }: PageProps) {
  return (
    <>
      <div className="toolbar">
        <p className="muted">Last {state.history.length} runs · stored locally · maximum 20 runs</p>
        <Button
          variant="outline"
          disabled={!state.history.length && !state.failures.length}
          onClick={async () => {
            if (confirm('Clear all activity and provider failure logs?'))
              try {
                await update('CLEAR_HISTORY', {}, 'Activity cleared.');
              } catch (e) {
                notify((e as Error).message);
              }
          }}
        >
          <Trash2 size={15} /> Clear activity
        </Button>
      </div>
      <section className="panel">
        {state.history.length ? (
          state.history.map((r) => (
            <ActivityRow key={r.id} report={r} onClick={() => setReport(r)} />
          ))
        ) : (
          <Empty
            icon={<Activity size={29} />}
            title="A clear paper trail, without the paper"
            description="Run Answer all on a website to see filled fields, answer sources, and anything that needs a second look."
          />
        )}
      </section>
      {state.failures.length > 0 && (
        <section className="panel failure-panel">
          <SectionHead
            title="Provider connection log"
            description="Sanitized failure details. API keys and provider response bodies are never logged."
          />
          {state.failures.map((f, i) => (
            <div className="failure-row" key={i}>
              <Badge tone="amber">{f.provider}</Badge>
              <span>{f.message}</span>
              <small>{new Date(f.date).toLocaleString()}</small>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
