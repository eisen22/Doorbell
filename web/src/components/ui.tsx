import { useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, Clock3, XCircle, FileCheck2, CircleDashed, X } from 'lucide-react';
import type { AttendanceStatus } from '../domain/types';
import { initials } from '../lib/repo';

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect x="2" y="2" width="36" height="36" rx="11" fill="#D8F5A2" />
      {/* bell */}
      <path d="M20 9.5c-4.6 0-7.6 3.3-7.6 7.8v4.9l-2.3 3.6c-.4.6 0 1.4.8 1.4h18.2c.8 0 1.2-.8.8-1.4l-2.3-3.6v-4.9c0-4.5-3-7.8-7.6-7.8z" fill="#111" />
      <path d="M16.6 29.4a3.5 3.5 0 0 0 6.8 0" fill="none" stroke="#111" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="28.6" cy="11.4" r="3.6" fill="#FFB65C" stroke="#D8F5A2" strokeWidth="1.6" />
    </svg>
  );
}

const STATUS_META: Record<AttendanceStatus | 'waiting', { label: string; Icon: typeof CheckCircle2 }> = {
  present: { label: 'Present', Icon: CheckCircle2 },
  late: { label: 'Late', Icon: Clock3 },
  absent: { label: 'Absent', Icon: XCircle },
  excused: { label: 'Excused', Icon: FileCheck2 },
  waiting: { label: 'Not yet', Icon: CircleDashed },
};

/** Status is always icon + word, never color alone. */
export function StatusChip({ status }: { status: AttendanceStatus | 'waiting' }) {
  const { label, Icon } = STATUS_META[status];
  return (
    <span className={`chip chip-${status}`}>
      <Icon size={14} strokeWidth={2.2} aria-hidden="true" />
      {label}
    </span>
  );
}

export function Avatar({ first, last, tone }: { first: string; last: string; tone?: string }) {
  return (
    <span className="avatar" style={tone ? { background: tone } : undefined} aria-hidden="true">
      {initials(first, last)}
    </span>
  );
}

export function Card({ title, action, children, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="card-head">
          {title && <h2 className="card-title">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty">
      <svg width="88" height="60" viewBox="0 0 88 60" aria-hidden="true">
        <rect x="6" y="14" width="44" height="40" rx="10" fill="#CDE8F7" />
        <circle cx="62" cy="24" r="16" fill="#D8F5A2" />
        <rect x="30" y="6" width="30" height="20" rx="8" fill="#FFD9A8" />
      </svg>
      <strong>{title}</strong>
      {hint && <span>{hint}</span>}
    </div>
  );
}

export function Skeleton({ h = 18, w = '100%' }: { h?: number; w?: number | string }) {
  return <span className="skeleton" style={{ height: h, width: w }} />;
}

/** Number that counts up when it first appears. */
export function CountUp({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let frame = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 600);
      setShown(Math.round(value * (1 - (1 - p) ** 3)));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{shown}{suffix}</>;
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

/** Short streak label, always specific: "Absent 3 days", "Late 3 days", "Absent 2 · Late 1". */
export function streakShort(s: { count: number; absent: number; late: number }): string {
  if (s.late === 0) return `Absent ${s.count} day${s.count === 1 ? '' : 's'}`;
  if (s.absent === 0) return `Late ${s.count} day${s.count === 1 ? '' : 's'}`;
  return `Absent ${s.absent} · Late ${s.late}`;
}

export function StreakChip({ s, threshold = 3 }: { s: { count: number; absent: number; late: number }; threshold?: number }) {
  if (s.count < 2) return null;
  return <span className={`streak ${s.count >= threshold ? 'streak-hot' : ''}`}>{streakShort(s)}</span>;
}

export function Toast({ message, tone = 'ok' }: { message: string | null; tone?: 'ok' | 'warn' | 'bad' }) {
  if (!message) return null;
  return <div className={`toast toast-${tone}`} role="status">{message}</div>;
}
