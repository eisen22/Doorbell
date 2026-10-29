// An easier date picker than the browser's: big tap targets, month and year dropdowns,
// quick buttons, and the school calendar's no-class days marked right in the grid.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { addDays, isoWeekday } from '../domain/rules';
import type { CalendarDay, ISODate } from '../domain/types';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** "Thu, Oct 29, 2026" */
export function longDate(d: ISODate) {
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function todayIso() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

const NO_CLASS = new Set(['holiday', 'suspension', 'break']);

export interface DatePickerProps {
  value: ISODate | '';
  onChange: (d: ISODate) => void;
  min?: ISODate;
  max?: ISODate;
  /** School calendar entries to mark in the grid. */
  calendar?: CalendarDay[];
  /** Quick-pick buttons under the grid, e.g. [['Today', '2026-10-29']]. Defaults to Today. */
  quick?: [string, ISODate][];
  placeholder?: string;
  ariaLabel?: string;
  /** Opens on a decade-friendly view, for birthdates. */
  birthdate?: boolean;
  className?: string;
  compact?: boolean;
}

export function DatePicker({ value, onChange, min, max, calendar, quick, placeholder = 'Pick a date', ariaLabel, birthdate, className = '', compact }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const start = value || (max && todayIso() > max ? max : todayIso());
  const [view, setView] = useState({ y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) - 1 });
  const [focus, setFocus] = useState<ISODate>(start);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const marks = useMemo(() => new Map((calendar ?? []).map((c) => [c.date, c])), [calendar]);

  useEffect(() => {
    if (!open) return;
    const s = value || start;
    setView({ y: Number(s.slice(0, 4)), m: Number(s.slice(5, 7)) - 1 });
    setFocus(s);
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    // Fixed position so the calendar is never cut off inside dialogs or scrolling cards.
    const place = () => {
      const r = trigger.current?.getBoundingClientRect();
      if (!r) return;
      const w = 316;
      const h = pop.current?.offsetHeight ?? 400;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
      const below = r.bottom + 6;
      const top = below + h > window.innerHeight - 8 && r.top - h - 6 > 8 ? r.top - h - 6 : Math.min(below, Math.max(8, window.innerHeight - h - 8));
      setPos({ top, left });
    };
    place();
    const raf = requestAnimationFrame(place);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc, true);
      window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    grid.current?.querySelector<HTMLButtonElement>(`[data-date="${focus}"]`)?.focus();
  }, [focus, open, view]);

  const allowed = (d: ISODate) => (!min || d >= min) && (!max || d <= max);
  const pick = (d: ISODate) => { if (!allowed(d)) return; onChange(d); setOpen(false); };
  const moveMonth = (delta: number) => setView((v) => { const m = v.m + delta; return { y: v.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 }; });

  const first = iso(view.y, view.m, 1);
  const lead = isoWeekday(first) % 7; // Sunday first
  const daysIn = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (ISODate | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => iso(view.y, view.m, i + 1))];
  while (cells.length % 7) cells.push(null);

  const thisYear = Number(todayIso().slice(0, 4));
  const minY = min ? Number(min.slice(0, 4)) : birthdate ? thisYear - 15 : thisYear - 5;
  const maxY = max ? Number(max.slice(0, 4)) : thisYear + 2;
  const years = Array.from({ length: Math.max(1, maxY - minY + 1) }, (_, i) => minY + i);
  if (!years.includes(view.y)) years.push(view.y);
  years.sort((a, b) => a - b);

  const onKey = (e: ReactKeyboardEvent) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in step) {
      e.preventDefault();
      const next = addDays(focus, step[e.key]);
      setFocus(next);
      setView({ y: Number(next.slice(0, 4)), m: Number(next.slice(5, 7)) - 1 });
    } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(focus); }
  };

  const quickList = quick ?? (allowed(todayIso()) ? [['Today', todayIso()] as [string, ISODate]] : []);
  const mark = (d: ISODate) => marks.get(d);

  return (
    <div className={`dp ${className}`} ref={box}>
      <button type="button" ref={trigger} className={`dp-trigger ${compact ? 'dp-compact' : ''}`} onClick={() => setOpen((v) => !v)} aria-haspopup="dialog" aria-expanded={open} aria-label={ariaLabel ? `${ariaLabel}: ${value ? longDate(value) : 'not set'}` : undefined}>
        <CalendarDays size={17} aria-hidden="true" />
        <span className={value ? '' : 'dp-placeholder'}>{value ? longDate(value) : placeholder}</span>
      </button>
      {open && (
        <div className="dp-pop" ref={pop} role="dialog" aria-label={ariaLabel ?? 'Choose a date'} style={pos ? { position: 'fixed', top: pos.top, left: pos.left } : { visibility: 'hidden' }}>
          <div className="dp-head">
            <button type="button" className="icon-btn sm" onClick={() => moveMonth(-1)} aria-label="Previous month"><ChevronLeft size={18} /></button>
            <select value={view.m} onChange={(e) => setView({ ...view, m: Number(e.target.value) })} aria-label="Month">
              {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
            <select value={view.y} onChange={(e) => setView({ ...view, y: Number(e.target.value) })} aria-label="Year">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button type="button" className="icon-btn sm" onClick={() => moveMonth(1)} aria-label="Next month"><ChevronRight size={18} /></button>
            <button type="button" className="icon-btn sm dp-close" onClick={() => setOpen(false)} aria-label="Close"><X size={16} /></button>
          </div>
          <div className="dp-week" aria-hidden="true">{WEEK.map((w) => <span key={w}>{w}</span>)}</div>
          <div className="dp-grid" role="grid" ref={grid} onKeyDown={onKey}>
            {cells.map((d, i) => {
              if (!d) return <span key={`e${i}`} />;
              const m = mark(d);
              const wd = isoWeekday(d);
              const cls = [
                'dp-day',
                d === value ? 'on' : '',
                d === todayIso() ? 'today' : '',
                wd >= 6 ? 'weekend' : '',
                m && NO_CLASS.has(m.type) ? 'noclass' : '',
              ].join(' ');
              return (
                <button key={d} type="button" data-date={d} className={cls} disabled={!allowed(d)} tabIndex={d === focus ? 0 : -1}
                  onClick={() => pick(d)} title={m ? m.label : undefined} aria-label={`${longDate(d)}${m ? `, ${m.label}` : ''}`} aria-selected={d === value}>
                  {Number(d.slice(8))}
                  {m && <i className={`dp-dot k-${m.type}`} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          {calendar && <p className="dp-legend"><i className="dp-dot k-holiday" /> No class <i className="dp-dot k-exam" /> Exam or event</p>}
          {quickList.length > 0 && (
            <div className="dp-foot">
              {quickList.map(([label, d]) => (
                <button key={label} type="button" className="fchip sm" disabled={!allowed(d)} onClick={() => pick(d)}>{label}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
