import { useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, Clock3, XCircle, FileCheck2, CircleDashed, X } from 'lucide-react';
import type { AttendanceStatus } from '../domain/types';
import { initials } from '../lib/repo';

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect x="2" y="2" width="36" height="36" rx="11" fill="#D8F5A2" />
      <path d="M10 21 L20 12 L30 21" fill="none" stroke="#111" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 25.5 L19 29 L26 22" fill="none" stroke="#111" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
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

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
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

export function Toast({ message, tone = 'ok' }: { message: string | null; tone?: 'ok' | 'warn' | 'bad' }) {
  if (!message) return null;
  return <div className={`toast toast-${tone}`} role="status">{message}</div>;
}
