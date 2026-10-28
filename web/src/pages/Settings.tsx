import { renderTemplate, smsSegments, to12h, autoFinalizeTime, fromMinutes, toMinutes } from '../domain/rules';
import { useLive } from '../lib/repo';
import { Card, Skeleton } from '../components/ui';

export function SettingsPage() {
  const { data } = useLive(async (r) => {
    const session = await r.getSession();
    return { session, settings: await r.getSettings(), section: await r.getSection(session.sectionId!) };
  });
  if (!data) return <div className="page"><Skeleton h={300} /></div>;
  const { session, settings, section } = data;
  const s = section.schedule;
  const vars = { child: 'Juan', time: '7:42 AM', school: settings.schoolName, contact: settings.contactNumber };

  return (
    <div className="page">
      <div className="page-head"><div><p className="eyebrow">Your account and class rules</p><h1>Settings</h1></div></div>
      <div className="grid-2">
        <Card title="Profile">
          <dl className="dl">
            <dt>Name</dt><dd>{session.name}</dd>
            <dt>Role</dt><dd>Teacher</dd>
            <dt>Section</dt><dd>{section.name}</dd>
          </dl>
          <button className="btn" disabled title="Available once accounts move to the cloud">Change password</button>
          <p className="muted small">Password changes are enabled when sign-in moves to the cloud.</p>
        </Card>
        <Card title="Class schedule (set by admin)">
          <dl className="dl">
            <dt>Class starts</dt><dd>{to12h(s.startTime)}</dd>
            <dt>Scanning opens</dt><dd>{to12h(fromMinutes(toMinutes(s.startTime) - s.scanWindowMins))}</dd>
            <dt>Late after</dt><dd>{to12h(fromMinutes(toMinutes(s.startTime) + s.lateCutoffMins))}</dd>
            <dt>Auto-confirm</dt><dd>{to12h(autoFinalizeTime(s))}</dd>
            <dt>Parents texted after</dt><dd>{settings.streakDays} school days late or absent in a row</dd>
            <dt>Arrival SMS</dt><dd>{settings.arrivalSmsEnabled ? 'On' : 'Off'}</dd>
          </dl>
        </Card>
      </div>
      <Card title="SMS messages parents receive">
        <div className="templates">
          {(['en', 'fil'] as const).map((lang) => (
            <div key={lang}>
              <h3>{lang === 'en' ? 'English' : 'Filipino'}</h3>
              {(['arrival', 'late', 'streak'] as const).map((k) => {
                const text = renderTemplate(settings.templates[lang][k], vars);
                return (
                  <div key={k} className="tpl">
                    <span className={`kind kind-${k}`}>{k}</span>
                    <p>{text}</p>
                    <span className={`muted small ${text.length > 160 ? 'over' : ''}`}>{text.length}/160 · {smsSegments(text)} SMS</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
