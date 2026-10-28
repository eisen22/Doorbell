import { useState } from 'react';
import { ScanLine, Shuffle, Smartphone, Keyboard } from 'lucide-react';
import { to12h } from '../domain/rules';
import type { ScanResult } from '../data/repository';
import { useLive, useRepo } from '../lib/repo';
import { Card, Skeleton } from '../components/ui';

function describe(r: ScanResult): { tone: 'ok' | 'warn' | 'bad'; title: string; sub: string } {
  switch (r.kind) {
    case 'recorded': return { tone: r.status === 'late' ? 'warn' : 'ok', title: `${r.student.firstName} ${r.student.lastName}`, sub: `${r.status === 'late' ? 'Late' : 'On time'} · ${to12h(r.time)} · parent texted` };
    case 'duplicate': return { tone: 'warn', title: `${r.student.firstName} already scanned`, sub: `First scan at ${to12h(r.firstScanAt)}. No new SMS sent.` };
    case 'ignore': return { tone: 'warn', title: 'Repeat scan ignored', sub: 'Same card within 10 seconds, or everyone has arrived.' };
    case 'unknown': return { tone: 'bad', title: 'Unknown card', sub: 'This code is not registered. Use manual search.' };
    case 'revoked': return { tone: 'bad', title: 'Card revoked', sub: `${r.student.firstName}'s old card was replaced. Ask the admin for the new one.` };
    case 'wrong_section': return { tone: 'bad', title: 'Different section', sub: `${r.student.firstName} is not in this class.` };
    case 'not_school_day': return { tone: 'bad', title: 'No class today', sub: 'Holiday, weekend or suspension.' };
  }
}

export function Scanner() {
  const repo = useRepo();
  const [token, setToken] = useState('');
  const [last, setLast] = useState<ScanResult | null>(null);
  const { data } = useLive(async (r) => {
    const s = (await r.getSession())!;
    const section = await r.getSection(s.sectionId!);
    const today = await r.getToday();
    const roster = await r.getRoster(section.id, today.date);
    return { section, roster };
  });
  if (!data) return <div className="page"><Skeleton h={300} /></div>;
  const run = async (p: Promise<ScanResult>) => {
    const res = await p;
    setLast(res);
    if ('vibrate' in navigator) navigator.vibrate?.(res.kind === 'recorded' ? 80 : [60, 60, 60]);
  };
  const d = last ? describe(last) : null;
  const sample = data.roster.find((r) => !r.record?.scannedAt)?.student.qrToken;

  return (
    <div className="page">
      <div className="page-head">
        <div><p className="eyebrow">{data.section.name}</p><h1>Scanner</h1></div>
      </div>
      <div className="grid-2">
        <Card title="Test a scan">
          <div className={`scan-banner ${d ? `scan-${d.tone}` : ''}`} aria-live="polite">
            <ScanLine size={30} />
            <div><strong>{d ? d.title : 'Ready to scan'}</strong><span>{d ? d.sub : 'Simulate a card, or paste a QR token below.'}</span></div>
          </div>
          <button className="btn btn-ink wide" onClick={() => run(repo.simulateScan(data.section.id))}>
            <Shuffle size={18} /> Simulate a child arriving
          </button>
          <form className="token-form" onSubmit={(e) => { e.preventDefault(); if (token) run(repo.recordScan({ qrToken: token, sectionId: data.section.id })); }}>
            <label className="field">
              <span><Keyboard size={14} /> QR token (what the card encodes)</span>
              <input className="input mono" value={token} onChange={(e) => setToken(e.target.value)} placeholder={sample ?? 'SA-XXXXXXXXXXXX'} />
            </label>
            <button className="btn" type="submit">Scan token</button>
          </form>
          <p className="muted small">Tip: scan the same token twice to see duplicate protection. Open the SMS Simulator to watch parents get texted.</p>
        </Card>
        <Card title="Phone scanner">
          <div className="phone-promo">
            <Smartphone size={40} />
            <p>The camera scanner for phones is built in the app step. It uses the same scan rules you are testing here, so results will match.</p>
            <ul className="checklist">
              <li>Classroom mode and gate mode</li>
              <li>Green, amber and red banners with sound and vibration</li>
              <li>Offline queue that syncs when back online</li>
              <li>Same endpoint a future hardware scanner will use</li>
            </ul>
          </div>
        </Card>
      </div>
    </div>
  );
}
