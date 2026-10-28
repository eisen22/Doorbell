import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Lock, ShieldCheck, MessageSquareOff, ChevronLeft, ChevronRight } from 'lucide-react';
import { autoFinalizeTime, emptyCounts, recentSchoolDays, addDays, isSchoolDay, to12h } from '../domain/rules';
import type { AttendanceStatus, ISODate, RosterRow } from '../domain/types';
import { useLive, useRepo } from '../lib/repo';
import { Avatar, Card, Empty, Modal, Skeleton, StatusChip, StreakChip, Toast } from '../components/ui';

const OPTIONS: AttendanceStatus[] = ['present', 'late', 'absent', 'excused'];

interface Pending { row: RosterRow; status: AttendanceStatus }

export function Attendance() {
  const repo = useRepo();
  const [params, setParams] = useSearchParams();
  const date = params.get('date');
  const statusFilter = params.get('status');
  const setDate = (d: ISODate) => { const p = new URLSearchParams(params); p.set('date', d); setParams(p); };
  const clearFilter = () => { const p = new URLSearchParams(params); p.delete('status'); setParams(p); };
  const [pending, setPending] = useState<Pending | null>(null);
  const [text, setText] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data } = useLive(async (r) => {
    const session = (await r.getSession())!;
    const today = await r.getToday();
    const section = await r.getSection(session.sectionId!);
    const calendar = await r.getCalendar();
    const day = date ?? today.date;
    const roster = await r.getRoster(section.id, day);
    const confirmation = await r.getConfirmation(section.id, day);
    return { session, today, section, calendar, day, roster, confirmation };
  }, [date]);

  if (!data) return <div className="page"><Skeleton h={44} w={240} /><div className="card"><Skeleton h={400} /></div></div>;
  const { today, section, calendar, day, roster, confirmation } = data;
  const schoolDay = isSchoolDay(day, section.schedule, calendar);
  const counts = emptyCounts();
  let waiting = 0;
  roster.forEach((r) => (r.record ? counts[r.record.status]++ : waiting++));

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const step = (dir: -1 | 1) => {
    const next = dir === -1
      ? recentSchoolDays(addDays(day, -1), 1, section.schedule, calendar)[0]
      : (() => { let d = addDays(day, 1); while (d <= today.date && !isSchoolDay(d, section.schedule, calendar)) d = addDays(d, 1); return d; })();
    if (next && next <= today.date) setDate(next);
  };

  const choose = async (row: RosterRow, status: AttendanceStatus) => {
    if (row.record?.status === status) return;
    if (confirmation || status === 'excused') { setPending({ row, status }); setText(''); setError(null); return; }
    await repo.setStatus({ sectionId: section.id, date: day, studentId: row.student.id, status });
    flash(`${row.student.firstName} marked ${status}`);
  };

  const savePending = async () => {
    if (!pending) return;
    try {
      await repo.setStatus({
        sectionId: section.id, date: day, studentId: pending.row.student.id, status: pending.status,
        note: pending.status === 'excused' ? text : undefined,
        reason: confirmation ? text : undefined,
      });
      setPending(null);
      flash(`${pending.row.student.firstName} updated`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const confirm = async () => {
    await repo.confirmDay(section.id, day);
    setConfirmOpen(false);
    flash('Attendance confirmed and locked');
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">{section.name}</p>
          <h1>Attendance</h1>
        </div>
        <div className="date-nav">
          <button className="icon-btn" onClick={() => step(-1)} aria-label="Previous school day"><ChevronLeft size={18} /></button>
          <input type="date" value={day} max={today.date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Date" />
          <button className="icon-btn" onClick={() => step(1)} disabled={day >= today.date} aria-label="Next school day"><ChevronRight size={18} /></button>
        </div>
      </div>

      <div className="summary-bar">
        <div className="summary-counts">
          <span><StatusChip status="present" /> {counts.present}</span>
          <span><StatusChip status="late" /> {counts.late}</span>
          <span><StatusChip status="absent" /> {counts.absent}</span>
          <span><StatusChip status="excused" /> {counts.excused}</span>
          {!confirmation && <span><StatusChip status="waiting" /> {waiting}</span>}
        </div>
        {confirmation ? (
          <div className="locked-note"><Lock size={16} /> Confirmed by {confirmation.confirmedBy} at {format(new Date(confirmation.confirmedAt), 'h:mm a')}. Changes need a reason.</div>
        ) : schoolDay ? (
          <button className="btn btn-ink" onClick={() => setConfirmOpen(true)}>
            <ShieldCheck size={18} /> Confirm attendance
          </button>
        ) : null}
      </div>

      {!schoolDay ? (
        <Card><Empty title="No class on this day" hint="Weekends, holidays and suspensions are skipped in streaks." /></Card>
      ) : (
        <Card>
          {!confirmation && day === today.date && (
            <p className="hint">Auto-confirms at {to12h(autoFinalizeTime(section.schedule))} if you do not confirm. Children not scanned by then are marked absent.</p>
          )}
          <ul className="roster">
            {statusFilter && (
              <div className="filter-note"><span>Showing <b>{statusFilter === 'waiting' ? 'not yet scanned' : statusFilter}</b> only</span><button className="link-btn" onClick={clearFilter}>Show everyone</button></div>
            )}
            {roster.filter((row) => !statusFilter || (statusFilter === 'waiting' ? !row.record : row.record?.status === statusFilter)).map((row) => {
              const st = row.record?.status;
              return (
                <li key={row.student.id} className="roster-row">
                  <Avatar first={row.student.firstName} last={row.student.lastName} tone={section.color} />
                  <div className="roster-name">
                    <strong>{row.student.lastName}, {row.student.firstName}</strong>
                    <span className="muted small">
                      {row.record?.scannedAt ? `Scanned ${to12h(row.record.scannedAt)}` : row.record ? (row.record.source === 'auto' ? 'Not scanned' : 'Set manually') : 'Not yet scanned'}
                      {row.record?.excusedNote && ` · ${row.record.excusedNote}`}
                      {row.streak.count >= 2 && <> <StreakChip s={row.streak} /></>}
                      {row.guardian && !row.guardian.smsConsent && <span className="no-sms" title="No SMS consent"><MessageSquareOff size={13} /> No SMS</span>}
                    </span>
                  </div>
                  <div className="seg" role="radiogroup" aria-label={`Status for ${row.student.firstName}`}>
                    {OPTIONS.map((o) => (
                      <button key={o} role="radio" aria-checked={st === o} className={`seg-btn seg-${o} ${st === o ? 'on' : ''}`} onClick={() => choose(row, o)}>
                        {o[0].toUpperCase() + o.slice(1)}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {pending && (
        <Modal
          title={pending.status === 'excused' && !confirmation ? `Excuse ${pending.row.student.firstName}` : `Change ${pending.row.student.firstName} to ${pending.status}`}
          onClose={() => setPending(null)}
          footer={<>
            <button className="btn" onClick={() => setPending(null)}>Cancel</button>
            <button className="btn btn-ink" onClick={savePending} disabled={!!confirmation && !text.trim()}>Save</button>
          </>}
        >
          <label className="field">
            <span>{confirmation ? 'Reason for the change (required, saved in the audit log)' : 'Note (optional), e.g. "Parent called, fever"'}</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} autoFocus />
          </label>
          {error && <p className="error">{error}</p>}
        </Modal>
      )}

      {confirmOpen && (
        <Modal title="Confirm today's attendance?" onClose={() => setConfirmOpen(false)} footer={<>
          <button className="btn" onClick={() => setConfirmOpen(false)}>Not yet</button>
          <button className="btn btn-ink" onClick={confirm}><Lock size={16} /> Confirm and lock</button>
        </>}>
          <p>{waiting} {waiting === 1 ? 'child has' : 'children have'} not been scanned and will be marked <b>absent</b>. Children who reach a 3-school-day late or absent streak will trigger an SMS to their guardian.</p>
          <p className="muted small">Date: {format(parseISO(day), 'EEEE, MMMM d')}. A child who arrives later can still be scanned and will be recorded as late.</p>
        </Modal>
      )}
      <Toast message={toast} />
    </div>
  );
}
