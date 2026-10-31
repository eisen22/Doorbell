import { useEffect, useState } from 'react';
import { Save, Send } from 'lucide-react';
import { describeStreak, normalizePhMobile, renderTemplate, smsSegments, isGsmPlain } from '../../domain/rules';
import type { Lang, SchoolSettings, SmsTemplates } from '../../domain/types';
import { useLive, useRepo } from '../../lib/repo';
import { Card, Skeleton, Toast } from '../../components/ui';

export function AdminSettings() {
  const repo = useRepo();
  const { data } = useLive((r) => r.getSettings());
  const [s, setS] = useState<SchoolSettings | null>(null);
  const [testTo, setTestTo] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { if (data && !s) setS(structuredClone(data)); }, [data, s]);
  if (!s) return <div className="page"><Skeleton h={400} /></div>;
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const varsFor = (lang: Lang) => ({ child: 'Juan', time: '7:42 AM', school: s.schoolName, contact: s.contactNumber, streak: describeStreak({ count: 3, absent: 2, late: 1 }, lang) });
  const setTpl = (lang: Lang, k: keyof SmsTemplates, v: string) => setS({ ...s, templates: { ...s.templates, [lang]: { ...s.templates[lang], [k]: v } } });

  return (
    <div className="page">
      <div className="page-head">
        <div><p className="eyebrow">School-wide</p><h1>Settings &amp; SMS</h1></div>
        <button className="btn btn-ink" onClick={async () => { await repo.updateSettings(s); flash('Settings saved'); }}><Save size={17} /> Save changes</button>
      </div>
      <div className="grid-2">
        <Card title="School">
          <label className="field"><span>School name (appears in every SMS)</span><input className="input" value={s.schoolName} onChange={(e) => setS({ ...s, schoolName: e.target.value })} /></label>
          <label className="field"><span>Contact number for parents</span><input className="input" value={s.contactNumber} onChange={(e) => setS({ ...s, contactNumber: e.target.value })} /></label>
        </Card>
        <Card title="When parents get a text">
          <label className="check"><input type="checkbox" checked={s.arrivalSmsEnabled} onChange={(e) => setS({ ...s, arrivalSmsEnabled: e.target.checked })} /> Text parents when their child arrives (and when late)</label>
          <label className="field"><span>Text parents after this many school days late or absent in a row</span>
            <input type="number" className="input" min={2} max={10} value={s.streakDays} onChange={(e) => setS({ ...s, streakDays: Number(e.target.value) })} />
          </label>
          <div className="form-row">
            <label className="field"><span>Send a test SMS to</span><input className="input" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="0917 123 4567" /></label>
            <button className="btn align-end" onClick={async () => {
              const n = normalizePhMobile(testTo);
              if (!n) return flash('Enter a valid mobile number');
              await repo.sendTestSms(n);
              flash('Test SMS sent (see the SMS Simulator)');
            }}><Send size={16} /> Send test</button>
          </div>
          <p className="muted small">{repo.mode === 'demo' ? <>Demo mode: texts are simulated.</> : <>Texts are recorded in the SMS Messages page. A real SMS provider (e.g. Semaphore) plugs in with the SMS sender service.</>}</p>
        </Card>
      </div>
      <Card title="Message templates">
        <p className="muted small">Variables: {'{child}'} first name, {'{time}'}, {'{school}'}, {'{contact}'}, and in the 3-day alert {'{streak}'}, which becomes the exact pattern, e.g. "absent for 3 school days in a row" or "absent 2 days and late 1 day". Keep each under 160 plain characters (no emoji or curly quotes) so it costs one SMS.</p>
        <div className="templates">
          {(['en', 'fil'] as const).map((lang) => (
            <div key={lang}>
              <h3>{lang === 'en' ? 'English' : 'Filipino'}</h3>
              {(['arrival', 'late', 'streak'] as const).map((k) => {
                const preview = renderTemplate(s.templates[lang][k], varsFor(lang));
                const plain = isGsmPlain(preview);
                return (
                  <label key={k} className="tpl">
                    <span className={`kind kind-${k}`}>{k}</span>
                    <textarea rows={3} value={s.templates[lang][k]} onChange={(e) => setTpl(lang, k, e.target.value)} />
                    <span className="muted small">Preview: {preview}</span>
                    <span className={`small ${preview.length > 160 || !plain ? 'over' : 'muted'}`}>{preview.length}/160 · {smsSegments(preview)} SMS{!plain ? ' · special characters make it cost more' : ''}</span>
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      </Card>
      <Toast message={toast} />
    </div>
  );
}
