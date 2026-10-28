import { useState } from 'react';
import { MessageSquareText, RotateCw, Smartphone } from 'lucide-react';
import { format } from 'date-fns';
import { displayPhMobile, smsSegments } from '../domain/rules';
import type { SmsKind } from '../domain/types';
import { useLive, useRepo } from '../lib/repo';
import { Card, Empty, Skeleton } from '../components/ui';

const KINDS: { k: SmsKind | 'all' | 'failed'; label: string }[] = [
  { k: 'all', label: 'All' }, { k: 'arrival', label: 'Arrived' }, { k: 'late', label: 'Arrived late' },
  { k: 'streak', label: '3-day alerts' }, { k: 'failed', label: 'Failed' }, { k: 'test', label: 'Tests' },
];

/** Every text Doorbell sent to parents, with a phone-style preview. */
export function SmsMessages() {
  const repo = useRepo();
  const [kind, setKind] = useState<(typeof KINDS)[number]['k']>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const { data } = useLive(async (r) => ({ sms: await r.listSms(400), students: await r.listStudentRows().catch(() => []) }));
  if (!data) return <div className="page"><Skeleton h={400} /></div>;
  const list = data.sms.filter((m) => kind === 'all' || (kind === 'failed' ? m.status === 'failed' : m.kind === kind));
  const pick = list.find((m) => m.id === selected) ?? list[0];
  const name = (id?: string) => { const s = data.students.find((x) => x.student.id === id)?.student; return s ? `${s.firstName} ${s.lastName}` : ''; };

  return (
    <div className="page">
      <div className="page-head">
        <div><p className="eyebrow">{repo.mode === 'demo' ? 'Demo: messages are simulated, nothing is actually sent' : 'Messages sent to parents and guardians'}</p><h1>SMS Messages</h1></div>
      </div>
      <div className="chips">
        {KINDS.map(({ k, label }) => (
          <button key={k} className={`fchip ${kind === k ? 'fchip-on' : ''}`} onClick={() => setKind(k)}>{label}<b className="count">{k === 'all' ? data.sms.length : data.sms.filter((m) => (k === 'failed' ? m.status === 'failed' : m.kind === k)).length}</b></button>
        ))}
      </div>
      <div className="sms-layout">
        <Card>
          {list.length === 0 ? <Empty title="No messages here" /> : (
            <ul className="sms-list">
              {list.map((m) => (
                <li key={m.id}>
                  <button className={`sms-row ${pick?.id === m.id ? 'on' : ''} ${m.status === 'failed' ? 'bad' : ''}`} onClick={() => setSelected(m.id)}>
                    <span className={`kind kind-${m.kind}`}>{m.kind === 'streak' ? '3-day' : m.kind}</span>
                    <span className="sms-to"><strong>{name(m.studentId) || displayPhMobile(m.to)}</strong><span className="muted small">{displayPhMobile(m.to)} · {format(new Date(m.createdAt), 'MMM d, h:mm a')}</span></span>
                    <span className={`tag ${m.status === 'failed' ? 'tag-bad' : 'tag-ok'}`}>{m.status === 'failed' ? 'Failed' : 'Sent'}</span>
                  </button>
                </li>
              ))}
            </ul>
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
