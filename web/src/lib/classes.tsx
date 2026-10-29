// Teachers can handle several classes. Pages show one class at a time: the one picked in the
// switcher (?class=...), or else the class in session right now.
import { useSearchParams } from 'react-router-dom';
import { classNow, classPhase, shortClassName, sortByStart } from '../domain/classes';
import { to12h } from '../domain/rules';
import type { Section } from '../domain/types';
import type { Repository } from '../data/repository';

export async function loadMyClasses(r: Repository, requested?: string | null) {
  const session = (await r.getSession())!;
  const today = await r.getToday();
  const classes = sortByStart(await Promise.all(session.sectionIds.map((id) => r.getSection(id))));
  const current = classNow(classes, today.time, today.actualDate);
  const section = classes.find((c) => c.id === requested) ?? current ?? classes[0];
  return { session, today, classes, current, section };
}

export function useClassParam(): [string | null, (id: string) => void] {
  const [params, setParams] = useSearchParams();
  const set = (id: string) => { const p = new URLSearchParams(params); p.set('class', id); setParams(p, { replace: true }); };
  return [params.get('class'), set];
}

const PHASE_LABEL = { now: 'Now', next: 'Later', done: 'Done', off: 'No class' } as const;

/** Pill buttons to switch between a teacher's classes. Hidden when there is only one. */
export function ClassSwitch({ classes, value, onChange, time, date }: { classes: Section[]; value: string; onChange: (id: string) => void; time?: string; date?: string }) {
  if (classes.length < 2) return null;
  return (
    <div className="class-switch" role="tablist" aria-label="Choose a class">
      {classes.map((c) => {
        const phase = time ? classPhase(c, time, date) : null;
        return (
          <button key={c.id} role="tab" aria-selected={c.id === value} className={`class-pill ${c.id === value ? 'on' : ''}`} onClick={() => onChange(c.id)}>
            <span className="sec-dot" style={{ background: c.color }} aria-hidden="true" />
            <span className="class-pill-name">{shortClassName(c.name)}</span>
            <span className="class-pill-time">{to12h(c.schedule.startTime)}</span>
            {phase === 'now' && <span className="now-tag">{PHASE_LABEL.now}</span>}
          </button>
        );
      })}
    </div>
  );
}
