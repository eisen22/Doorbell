import { useState } from 'react';
import { Plus, Pencil, UserX, UserCheck, Info } from 'lucide-react';
import { displayPhMobile, normalizePhMobile } from '../../domain/rules';
import type { TeacherInput } from '../../data/repository';
import { useLive, useRepo } from '../../lib/repo';
import { Avatar, Card, Modal, Skeleton, Toast } from '../../components/ui';

export function Teachers() {
  const repo = useRepo();
  const [edit, setEdit] = useState<TeacherInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; email: string; password: string } | null>(null);
  const { data } = useLive(async (r) => ({ teachers: await r.listTeachers(), sections: await r.listSections() }));
  if (!data) return <div className="page"><Skeleton h={400} /></div>;
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2800); };

  const save = async () => {
    if (!edit) return;
    if (!edit.name.trim()) return setError('Enter the teacher\'s name.');
    if (!/^\S+@\S+\.\S+$/.test(edit.email)) return setError('Enter a valid email address.');
    let mobile = edit.mobile?.trim();
    if (mobile) {
      const n = normalizePhMobile(mobile);
      if (!n) return setError('Mobile must look like 0917 123 4567.');
      mobile = n;
    }
    try {
      const res = await repo.saveTeacher({ ...edit, name: edit.name.trim(), email: edit.email.trim(), mobile });
      if (res.tempPassword) setCreated({ name: res.teacher.name, email: res.teacher.email, password: res.tempPassword }); else flash('Teacher updated');
      setEdit(null);
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div><p className="eyebrow">{data.teachers.filter((t) => t.active !== false).length} active</p><h1>Teachers</h1></div>
        <button className="btn btn-ink" onClick={() => { setEdit({ name: '', email: '', mobile: '' }); setError(null); }}><Plus size={17} /> Add teacher</button>
      </div>
      <Card>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Teacher</th><th>Email</th><th>Mobile</th><th>Section</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data.teachers.map((t) => {
                const sec = data.sections.find((s) => s.teacherId === t.id && !s.archived);
                const active = t.active !== false;
                return (
                  <tr key={t.id} className={active ? '' : 'dim'}>
                    <td><div className="cell-person"><Avatar first={t.name.split(' ')[0]} last={t.name.split(' ').slice(-1)[0]} tone={sec?.color} /><strong>{t.name}</strong></div></td>
                    <td>{t.email}</td>
                    <td className="mono">{t.mobile ? displayPhMobile(t.mobile) : '—'}</td>
                    <td>{sec ? <span className="tag" style={{ background: sec.color }}>{sec.name}</span> : <span className="muted">Unassigned</span>}</td>
                    <td><span className={`tag ${active ? 'tag-ok' : 'tag-off'}`}>{active ? 'Active' : 'Deactivated'}</span></td>
                    <td className="row-actions">
                      <button className="icon-btn sm" onClick={() => { setEdit({ id: t.id, name: t.name, email: t.email, mobile: t.mobile ?? '' }); setError(null); }} aria-label={`Edit ${t.name}`}><Pencil size={15} /></button>
                      <button className="icon-btn sm" onClick={async () => { await repo.setTeacherActive(t.id, !active); flash(active ? `${t.name} deactivated and removed from their section` : `${t.name} reactivated`); }} aria-label={active ? 'Deactivate' : 'Reactivate'}>{active ? <UserX size={15} /> : <UserCheck size={15} />}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="muted small note-row"><Info size={14} /> Assign a teacher to a class on the Sections page. Adding a teacher creates their sign-in account with a temporary password. They can change it with Forgot password.</p>

      {edit && (
        <Modal title={edit.id ? 'Edit teacher' : 'Add teacher'} onClose={() => setEdit(null)} footer={<>
          <button className="btn" onClick={() => setEdit(null)}>Cancel</button>
          <button className="btn btn-ink" onClick={save}>Save</button>
        </>}>
          <label className="field"><span>Full name</span><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus /></label>
          <label className="field"><span>Email (used to sign in)</span><input type="email" className="input" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></label>
          <label className="field"><span>Mobile (optional, for alerts)</span><input className="input" value={edit.mobile} onChange={(e) => setEdit({ ...edit, mobile: e.target.value })} placeholder="0917 123 4567" /></label>
          {error && <p className="error">{error}</p>}
        </Modal>
      )}
      {created && (
        <Modal title={"Account created"} onClose={() => setCreated(null)} footer={<button className="btn btn-ink" onClick={() => setCreated(null)}>Done</button>}>
          <p>Give these to <b>{created.name}</b> privately. They should change the password after signing in.</p>
          <dl className="dl cred"><dt>Email</dt><dd>{created.email}</dd><dt>Temporary password</dt><dd><code>{created.password}</code></dd></dl>
          <button className="btn btn-sm" onClick={() => navigator.clipboard?.writeText(`Doorbell sign-in\nEmail: ${created.email}\nPassword: ${created.password}`)}>Copy</button>
        </Modal>
      )}
      <Toast message={toast} />
    </div>
  );
}
