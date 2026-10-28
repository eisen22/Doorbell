import { useState } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Phone, MessageSquareText, MessageSquareOff } from 'lucide-react';
import { describeStreak, displayPhMobile } from '../../domain/rules';
import type { AttentionRow } from '../../data/repository';
import { useLive } from '../../lib/repo';
import { Avatar, Card, Empty, Skeleton, StreakChip } from '../../components/ui';

/** Students absent or late several school days in a row, across all sections. */
export function AbsenceWatch() {
  const [kind, setKind] = useState<'all' | 'absent' | 'late' | 'mixed'>('all');
  const { data } = useLive(async (r) => ({ rows: await r.listAttention(2), settings: await r.getSettings(), today: await r.getToday() }));
  if (!data) return <div className="page"><Skeleton h={400} /></div>;
  const t = data.settings.streakDays;
  const match = (r: AttentionRow) => kind === 'all' || (kind === 'absent' ? r.streak.late === 0 : kind === 'late' ? r.streak.absent === 0 : r.streak.absent > 0 && r.streak.late > 0);
  const hot = data.rows.filter((r) => r.streak.count >= t && match(r));
  const watch = data.rows.filter((r) => r.streak.count < t && match(r));

  const table = (rows: AttentionRow[]) => (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Learner</th><th>Section</th><th>What happened</th><th>Days</th><th>Guardian</th><th>Parent SMS</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.student.id}>
              <td><Link to={`/admin/students?q=${encodeURIComponent(r.student.lastName)}`} className="cell-person"><Avatar first={r.student.firstName} last={r.student.lastName} tone={r.section.color} /><strong>{r.student.lastName}, {r.student.firstName}</strong></Link></td>
              <td><span className="tag" style={{ background: r.section.color }}>{r.section.name}</span></td>
              <td><StreakChip s={r.streak} threshold={t} /><span className="muted small block">{describeStreak(r.streak)}</span></td>
              <td className="small">{[...r.streak.dates].reverse().map((d) => format(parseISO(d), 'MMM d')).join(', ')}</td>
              <td>{r.guardian ? <>{r.guardian.name}<a className="link block small" href={`tel:${r.guardian.mobile}`}><Phone size={13} /> {displayPhMobile(r.guardian.mobile)}</a></> : '—'}</td>
              <td>{r.smsSent ? <span className="tag tag-ok"><MessageSquareText size={13} /> Texted</span>
                : !r.guardian?.smsConsent ? <span className="tag tag-bad"><MessageSquareOff size={13} /> No consent: call</span>
                : <span className="tag tag-off">At {t} days</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="page">
      <div className="page-head">
        <div><p className="eyebrow">As of {format(parseISO(data.today.date), 'EEEE, MMMM d')} · school days only</p><h1>Absence Watch</h1></div>
      </div>
      <div className="chips">
        {([['all', 'All'], ['absent', 'Absent'], ['late', 'Late'], ['mixed', 'Absent and late']] as const).map(([k, l]) => (
          <button key={k} className={`fchip ${kind === k ? 'fchip-on' : ''}`} onClick={() => setKind(k)}>{l}</button>
        ))}
      </div>
      <Card title={`${t} or more school days in a row (${hot.length})`}>
        {hot.length ? table(hot) : <Empty title="No one right now" hint={`Children reach this list after ${t} school days absent or late in a row.`} />}
      </Card>
      <Card title={`Watch list: ${t - 1} days in a row (${watch.length})`}>
        {watch.length ? table(watch) : <Empty title="No one on the watch list" />}
      </Card>
      <p className="muted small">Excused days, weekends, holidays and suspensions do not count. A day present ends the streak.</p>
    </div>
  );
}
