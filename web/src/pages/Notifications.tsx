import { useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { Flame, MessageSquareWarning, PhoneOff, RotateCw, CheckCheck } from 'lucide-react';
import type { AppNotification } from '../domain/types';
import { useLive, useRepo } from '../lib/repo';
import { Card, Empty, Skeleton } from '../components/ui';

const ICON = { streak: Flame, sms_failed: MessageSquareWarning, number_update: PhoneOff };

export function Notifications() {
  const repo = useRepo();
  const [tab, setTab] = useState<'all' | 'streak' | 'sms'>('all');
  const { data } = useLive(async (r) => ({ list: await r.listNotifications(), sms: await r.listSms(500) }));
  if (!data) return <div className="page"><Skeleton h={300} /></div>;

  const list = data.list.filter((n) => tab === 'all' || (tab === 'streak' ? n.kind === 'streak' : n.kind !== 'streak'));
  const failedSms = data.sms.filter((m) => m.status === 'failed');
  const failedFor = (n: AppNotification) => failedSms.find((m) => m.studentId === n.studentId);

  return (
    <div className="page">
      <div className="page-head">
        <div><p className="eyebrow">Streak alerts and SMS problems</p><h1>Notifications</h1></div>
        <button className="btn" onClick={() => repo.markNotificationsRead()}><CheckCheck size={17} /> Mark all read</button>
      </div>
      <div className="chips">
        {([['all', 'All'], ['streak', 'Streaks'], ['sms', 'SMS issues']] as const).map(([k, label]) => (
          <button key={k} className={`fchip ${tab === k ? 'fchip-on' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      <Card>
        {list.length === 0 ? <Empty title="Nothing here" hint="Alerts appear when a child reaches a 3-day streak or an SMS fails." /> : (
          <ul className="notes">
            {list.map((n) => {
              const Icon = ICON[n.kind];
              const failed = n.kind === 'sms_failed' ? failedFor(n) : undefined;
              return (
                <li key={n.id} className={`note ${n.read ? '' : 'unread'}`}>
                  <span className={`note-icon note-${n.kind}`}><Icon size={18} /></span>
                  <div>
                    <strong>{n.title}</strong>
                    <p>{n.body}</p>
                    <span className="muted small">{formatDistanceToNowStrict(new Date(n.createdAt), { addSuffix: true })}</span>
                  </div>
                  {failed && <button className="btn btn-sm" onClick={() => repo.resendSms(failed.id)}><RotateCw size={15} /> Resend</button>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
