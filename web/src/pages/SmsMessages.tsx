import { useState } from 'react';
import { MessageSquareText, RotateCw, Smartphone, ArrowDownUp, CalendarDays, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { displayPhMobile, manilaToday, smsSegments } from '../domain/rules';
import type { SmsKind, SmsMessage } from '../domain/types';
import { useLive, useRepo } from '../lib/repo';
import { Card, Empty, Skeleton } from '../components/ui';

const KINDS: { k: SmsKind | 'all' | 'failed'; label: string }[] = [
  { k: 'all', label: 'All' }, { k: 'arrival', label: 'Arrived' }, { k: 'late', label: 'Arrived late' },
  { k: 'streak', label: '3-day alerts' }, { k: 'failed', label: 'Failed' }, { k: 'test', label: 'Tests' },
];

const dayOf = (m: SmsMessage) => m.createdAt.slice(0, 10);

/** Every text Doorbell sent to parents, grouped by day, with a phone-style preview. */
export function SmsMessages() {
  const repo = useRepo();
  const [kind, setKind] = useState<(typeof KINDS)[number]['k']>('all');
  const [day, setDay] = useState<string>(''); // '' = all days
  const [newestFirst, setNewestFirst] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const { data } = useLive(async (r) => ({ sms: await r.listSms(1000), students: await r.listStudentRows().catch(() => []) }));
  if (!data) return <div className="page"><Skeleton h={400} /></div>;

  const byKind = data.sms.filter((m) => kind === 'all' || (kind === 'failed' ? m.status === 'failed' : m.kind === kind));
  const list = byKind
    .filter((m) => !day || dayOf(m) === day)
    .sort((a, b) => (newestFirst ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt)));
  const groups: { date: string; items: SmsMessage[] }[] = [];
  for (const m of list) {
    const d = dayOf(m);
    if (groups[groups.length - 1]?.date !== d) groups.push({ date: d, items: [] });
    groups[groups.length - 1].items.push(m);
  }
  const days = [...new Set(byKind.map(dayOf))].sort().reverse();
  const pick = list.find((m) => m.id === selected) ?? list[0];
  const name = (id?: string) => { const s = data.students.find((x) => x.student.id === id)?.student; return s ? `${s.firstName} ${s.lastName}` : ''; };
  const today = manilaToday();
  const dayTitle = (d: string) => (d === today ? `Today, ${format(parseISO(d), 'MMMM d')}` : format(parseISO(d), 'EEEE, MMMM d'));

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>SMS Messages</h1><p className="page-sub">{repo.mode === 'demo' ? 'Demo: messages are simulated, nothing is actually sent' : 'Messages sent to parents and guardians'}</p></div>
        <div className="head-actions">
          <label className="sort-pick"><CalendarDays size={16} />
            <select className="input" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Day">
              <option value="">All days</option>
              {days.map((d) => <option key={d} value={d}>{dayTitle(d)} ({byKind.filter((m) => dayOf(m) === d).length})</option>)}
            </select>
          </label>
          {day && <button className="icon-btn sm" onClick={() => setDay('')} aria-label="Show all days"><X size={15} /></button>}
          <button className="btn" onClick={() => setNewestFirst((v) => !v)}><ArrowDownUp size={16} /> {newestFirst ? 'Newest day first' : 'Oldest day first'}</button>
        </div>
      </div>
      <div className="chips">
        {KINDS.map(({ k, label }) => (
          <button key={k} className={`fchip ${kind === k ? 'fchip-on' : ''}`} onClick={() => setKind(k)}>{label}<b className="count">{k === 'all' ? data.sms.length : data.sms.filter((m) => (k === 'failed' ? m.status === 'failed' : m.kind === k)).length}</b></button>
        ))}
      </div>
      <div className="sms-layout">
        <Card>
          {list.length === 0 ? <Empty title="No messages here" hint={day ? 'Try another day.' : undefined} /> : (
            <div className="sms-list">
              {groups.map((g) => (
                <section key={g.date} className="sms-day">
                  <h3 className="sms-day-head"><span>{dayTitle(g.date)}</span><b>{g.items.length} {g.items.length === 1 ? 'text' : 'texts'}</b></h3>
                  <ul>
                    {g.items.map((m) => (
                      <li key={m.id}>
                        <button className={`sms-row ${pick?.id === m.id ? 'on' : ''} ${m.status === 'failed' ? 'bad' : ''}`} onClick={() => setSelected(m.id)}>
                          <span className={`kind kind-${m.kind}`}>{m.kind === 'streak' ? '3-day' : m.kind}</span>
                          <span className="sms-to"><strong>{name(m.studentId) || displayPhMobile(m.to)}</strong><span className="muted small">{displayPhMobile(m.to)} · {format(new Date(m.createdAt), 'h:mm a')}</span></span>
                          <span className={`tag ${m.status === 'failed' ? 'tag-bad' : 'tag-ok'}`}>{m.status === 'failed' ? 'Failed' : 'Sent'}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </Card>
        <div className="phone-col">
          <div className="phone">
            <div className="phone-notch" />
            <div className="phone-screen">
              {!pick ? <p className="sim-empty"><MessageSquareText size={20} /> No message selected</p> : (
                <>
                  <p className="phone-from"><Smartphone size={14} /> {displayPhMobile(pick.to)}</p>
                  <div className={`bubble ${pick.status === 'failed' ? 'bubble-failed' : ''}`}>
                    <p>{pick.body}</p>
                    <div className="bubble-meta"><span>{format(new Date(pick.createdAt), 'MMM d, h:mm a')}</span><span>{pick.body.length} chars · {smsSegments(pick.body)} SMS</span></div>
                  </div>
                  {pick.status === 'failed' && <button className="btn btn-sm" onClick={() => repo.resendSms(pick.id)}><RotateCw size={15} /> Resend</button>}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
