import { useState } from 'react';
import { Plus, Pencil, Archive, ArchiveRestore, Clock, Users, LogOut, GraduationCap, ChevronRight } from 'lucide-react';
import { fromMinutes, to12h, toMinutes } from '../../domain/rules';
import type { Section, Teacher } from '../../domain/types';
import type { SectionInput, StudentInput, StudentRow, TeacherInput } from '../../data/repository';
import { useLive, useRepo, textOn } from '../../lib/repo';
import { Avatar, Empty, Modal, Skeleton, Toast } from '../../components/ui';
import { LeaveModal, StudentModal, toStudentInput } from './AdminStudents';
import { TeacherModal, toTeacherInput } from './Teachers';
import { displayPhMobile } from '../../domain/rules';

export const SECTION_COLORS = ['#FFD9A8', '#D8F5A2', '#E4D6FA', '#CDE8F7', '#FBD3E0', '#FFF0A8', '#C9F0E4', '#F2D9C4'];

const blank = (): SectionInput => ({
  name: 'Kindergarten I - ', color: SECTION_COLORS[3], capacity: 25, teacherId: null,
  schedule: { classDays: [1, 2, 3, 4, 5], startTime: '08:00', endTime: '11:30', scanWindowMins: 30, lateCutoffMins: 15, autoFinalizeMins: 45 },
});

export function Sections() {
  const repo = useRepo();
  const [edit, setEdit] = useState<SectionInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data } = useLive(async (r) => {
    const [sections, teachers, rows] = await Promise.all([r.listSections(), r.listTeachers(), r.listStudentRows()]);
    const count = (id: string) => rows.filter((x) => x.enrollment?.sectionId === id && x.enrollment.status === 'active').length;
    return { sections, teachers, rows, count };
  });
  if (!data) return <div className="page"><Skeleton h={400} /></div>;
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const list = data.sections.filter((s) => showArchived || !s.archived);
  const teacherName = (id: string | null) => data.teachers.find((t) => t.id === id)?.name;

  const save = async () => {
    if (!edit) return;
    if (!edit.name.trim()) { setError('Give the section a name.'); return; }
    if (edit.schedule.endTime <= edit.schedule.startTime) { setError('End of classes must be after the start.'); return; }
    try {
      await repo.saveSection({ ...edit, name: edit.name.trim() });
      setEdit(null);
      flash('Section saved');
    } catch (e) { setError((e as Error).message); }
  };

  const toggleArchive = async (s: Section) => {
    try { await repo.archiveSection(s.id, !s.archived); flash(s.archived ? 'Section restored' : 'Section archived'); }
    catch (e) { flash((e as Error).message); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div><p className="eyebrow">Click a section to see its teacher and students</p><h1>Sections</h1></div>
        <div className="head-actions">
          <label className="check"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>
          <button className="btn btn-ink" onClick={() => { setEdit(blank()); setError(null); }}><Plus size={17} /> Add section</button>
        </div>
      </div>
      <div className="section-grid">
        {list.map((s) => {
          const n = data.count(s.id);
          return (
            <article key={s.id} className={`section-card clickable ${s.archived ? 'archived' : ''}`} style={{ background: s.color, color: textOn(s.color) }}
              onClick={() => setOpenId(s.id)} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpenId(s.id); } }}
              tabIndex={0} role="button" aria-label={`Open ${s.name}`}>
              <header>
                <h3>{s.name}</h3>
                <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="icon-btn sm glass" onClick={() => { setEdit({ id: s.id, name: s.name, color: s.color, capacity: s.capacity, teacherId: s.teacherId, schedule: { ...s.schedule } }); setError(null); }} aria-label={`Edit ${s.name}`}><Pencil size={15} /></button>
                  <button className="icon-btn sm glass" onClick={() => toggleArchive(s)} aria-label={s.archived ? 'Restore' : 'Archive'}>{s.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}</button>
                </div>
              </header>
              <p className="sec-teacher">{teacherName(s.teacherId) ?? <i>No teacher assigned</i>}</p>
              <div className="sec-meta">
                <span><Clock size={14} /> {to12h(s.schedule.startTime)} to {to12h(s.schedule.endTime)} · late after {to12h(fromMinutes(toMinutes(s.schedule.startTime) + s.schedule.lateCutoffMins))}</span>
                <span><Users size={14} /> {n} / {s.capacity} learners</span>
              </div>
              <div className="progress"><div className="progress-track"><div className="progress-fill" style={{ width: `${Math.min(100, (n / s.capacity) * 100)}%` }} /></div><span>{Math.round((n / s.capacity) * 100)}%</span></div>
              {s.archived && <span className="date-chip">Archived</span>}
              <span className="sec-open">View teacher and students <ChevronRight size={15} /></span>
            </article>
          );
        })}
      </div>

      {openId && data.sections.find((s) => s.id === openId) && (
        <SectionDetail section={data.sections.find((s) => s.id === openId)!} sections={data.sections} teachers={data.teachers} rows={data.rows}
          onClose={() => setOpenId(null)} flash={flash}
          onEditSection={(s) => { setOpenId(null); setEdit({ id: s.id, name: s.name, color: s.color, capacity: s.capacity, teacherId: s.teacherId, schedule: { ...s.schedule } }); setError(null); }} />
      )}

      {edit && (
        <Modal title={edit.id ? 'Edit section' : 'New section'} onClose={() => setEdit(null)} footer={<>
          <button className="btn" onClick={() => setEdit(null)}>Cancel</button>
          <button className="btn btn-ink" onClick={save}>Save section</button>
        </>}>
          <label className="field"><span>Section name</span><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus /></label>
          <div className="field"><span>Color</span>
            <div className="swatches">
              {SECTION_COLORS.map((c) => (
                <button key={c} className={`color-swatch ${edit.color.toLowerCase() === c.toLowerCase() ? 'on' : ''}`} style={{ background: c }} onClick={() => setEdit({ ...edit, color: c })} aria-label={`Color ${c}`} />
              ))}
              <label className="color-custom" title="Custom color"><input type="color" value={edit.color} onChange={(e) => setEdit({ ...edit, color: e.target.value })} aria-label="Custom color" /></label>
            </div>
          </div>
          <label className="field"><span>Teacher</span>
            <select className="input" value={edit.teacherId ?? ''} onChange={(e) => setEdit({ ...edit, teacherId: e.target.value || null })}>
              <option value="">No teacher yet</option>
              {data.teachers.filter((t) => t.active !== false).map((t) => {
                const other = data.sections.filter((s) => s.teacherId === t.id && s.id !== edit.id && !s.archived);
                return <option key={t.id} value={t.id}>{t.name}{other.length ? ` (also ${other.map((o) => o.name.split(' - ').slice(-1)[0]).join(', ')})` : ''}</option>;
              })}
            </select>
          </label>
          <div className="form-row">
            <label className="field"><span>Class starts</span><input type="time" className="input" value={edit.schedule.startTime} onChange={(e) => setEdit({ ...edit, schedule: { ...edit.schedule, startTime: e.target.value } })} /></label>
            <label className="field"><span>End of classes</span><input type="time" className="input" value={edit.schedule.endTime} onChange={(e) => setEdit({ ...edit, schedule: { ...edit.schedule, endTime: e.target.value } })} /></label>
          </div>
          <div className="form-row">
            <label className="field"><span>Late after (minutes)</span><input type="number" min={0} max={120} className="input" value={edit.schedule.lateCutoffMins} onChange={(e) => setEdit({ ...edit, schedule: { ...edit.schedule, lateCutoffMins: Number(e.target.value) } })} /></label>
          </div>
          <div className="form-row">
            <label className="field"><span>Scanning opens (min before)</span><input type="number" min={0} max={120} className="input" value={edit.schedule.scanWindowMins} onChange={(e) => setEdit({ ...edit, schedule: { ...edit.schedule, scanWindowMins: Number(e.target.value) } })} /></label>
            <label className="field"><span>Auto-confirm (min after start)</span><input type="number" min={15} max={240} className="input" value={edit.schedule.autoFinalizeMins} onChange={(e) => setEdit({ ...edit, schedule: { ...edit.schedule, autoFinalizeMins: Number(e.target.value) } })} /></label>
          </div>
          <label className="field"><span>Capacity</span><input type="number" min={1} max={60} className="input" value={edit.capacity} onChange={(e) => setEdit({ ...edit, capacity: Number(e.target.value) })} /></label>
          {error && <p className="error">{error}</p>}
        </Modal>
      )}
      <Toast message={toast} />
    </div>
  );
}

/** One section: its teacher and class list, with quick edits. */
function SectionDetail({ section, sections, teachers, rows, onClose, onEditSection, flash }: {
  section: Section; sections: Section[]; teachers: Teacher[]; rows: StudentRow[];
  onClose: () => void; onEditSection: (s: Section) => void; flash: (m: string) => void;
}) {
  const [student, setStudent] = useState<StudentInput | null>(null);
  const [leaving, setLeaving] = useState<StudentRow | null>(null);
  const [teacher, setTeacher] = useState<TeacherInput | null>(null);
  const [q, setQ] = useState('');
  const t = teachers.find((x) => x.id === section.teacherId);
  const list = rows.filter((r) => r.enrollment?.status === 'active' && r.enrollment.sectionId === section.id);
  const shown = list.filter((r) => !q || `${r.student.firstName} ${r.student.lastName} ${r.guardian?.name ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  const live = sections.filter((s) => !s.archived);
  const also = t ? live.filter((s) => s.teacherId === t.id && s.id !== section.id) : [];
  const busy = !!(student || leaving || teacher);

  return (
    <>
      {!busy && (
        <Modal wide title={section.name} onClose={onClose} footer={<>
          <button className="btn" onClick={() => onEditSection(section)}><Pencil size={16} /> Edit section</button>
          <button className="btn btn-ink" onClick={onClose}>Done</button>
        </>}>
          <div className="sd-head" style={{ background: section.color, color: textOn(section.color) }}>
            <span><Clock size={14} /> {to12h(section.schedule.startTime)} to {to12h(section.schedule.endTime)}</span>
            <span><Users size={14} /> {list.length} / {section.capacity} learners</span>
          </div>

          <h4 className="form-sub"><GraduationCap size={16} /> Teacher</h4>
          {t ? (
            <div className="sd-teacher">
              <Avatar first={t.name.split(' ')[0]} last={t.name.split(' ').slice(-1)[0]} tone={section.color} />
              <div>
                <button className="name-link" onClick={() => setTeacher(toTeacherInput(t))} title="Edit teacher">{t.name}</button>
                <span className="muted small block">{t.email}{t.mobile ? ` · ${displayPhMobile(t.mobile)}` : ''}</span>
                {also.length > 0 && <span className="muted small block">Also handles {also.map((s) => s.name).join(', ')}</span>}
              </div>
            </div>
          ) : (
            <p className="muted">No teacher yet. <button className="link-btn" onClick={() => onEditSection(section)}>Assign one</button></p>
          )}

          <div className="sd-students-head">
            <h4 className="form-sub"><Users size={16} /> Students</h4>
            <input className="input" placeholder="Find a student" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a student in this section" />
          </div>
          {shown.length === 0 ? <Empty title={list.length ? 'No match' : 'No students yet'} hint={list.length ? 'Try another name.' : 'Assign students on the Students page.'} /> : (
            <ul className="sd-list">
              {shown.map((r) => (
                <li key={r.student.id}>
                  <Avatar first={r.student.firstName} last={r.student.lastName} tone={section.color} />
                  <div className="sd-name">
                    <button className="name-link" onClick={() => setStudent(toStudentInput(r))} title="Edit student">{r.student.lastName}, {r.student.firstName}</button>
                    <span className="muted small">{r.guardian ? `${r.guardian.relationship}: ${r.guardian.name} · ${displayPhMobile(r.guardian.mobile)}` : 'No guardian on file'}</span>
                  </div>
                  <button className="btn btn-sm" onClick={() => setLeaving(r)}><LogOut size={15} /> Transfer or drop</button>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
      {student && <StudentModal input={student} sections={live} onClose={() => setStudent(null)} onSaved={(m) => { setStudent(null); flash(m); }} />}
      {leaving && <LeaveModal row={leaving} sections={live} onClose={() => setLeaving(null)} onDone={(m) => { setLeaving(null); flash(m); }} />}
      {teacher && <TeacherModal input={teacher} sections={sections} teachers={teachers} onClose={() => setTeacher(null)} onSaved={() => { setTeacher(null); flash('Teacher updated'); }} />}
    </>
  );
}
