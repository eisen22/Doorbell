import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { Printer, Info } from 'lucide-react';
import type { StudentRow } from '../../data/repository';
import { useLive, useRepo, textOn } from '../../lib/repo';
import { Card, Empty, Skeleton } from '../../components/ui';
import { Logo } from '../../components/ui';

type Layout = 'card' | 'sticker';
type Format = 'qr' | 'code128';

/** Printable ID cards / stickers. Codes hold only a random token, never personal data. */
export function QrCards() {
  const repo = useRepo();
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [layout, setLayout] = useState<Layout>('card');
  const [format, setFormat] = useState<Format>('qr');
  const { data } = useLive(async (r) => ({ rows: await r.listStudentRows(), sections: (await r.listSections()).filter((s) => !s.archived), settings: await r.getSettings() }));
  if (!data) return <div className="page"><Skeleton h={400} /></div>;
  const sec = data.sections.find((s) => s.id === (sectionId ?? data.sections[0]?.id));
  const rows = data.rows.filter((r) => r.enrollment?.status === 'active' && r.enrollment.sectionId === sec?.id);

  return (
    <div className="page">
      <div className="page-head no-print">
        <div><p className="eyebrow">Codes are created automatically for every student</p><h1>ID Cards</h1></div>
        <button className="btn btn-ink" onClick={async () => { await repo.logAudit('cards.print', sec?.name ?? '', `${rows.length} ${layout}s`); window.print(); }} disabled={!rows.length}><Printer size={17} /> Print {rows.length}</button>
      </div>
      <Card className="no-print">
        <div className="chips">
          {data.sections.map((s) => (
            <button key={s.id} className={`fchip ${s.id === sec?.id ? 'fchip-on' : ''}`} onClick={() => setSectionId(s.id)}><span className="sec-dot sm" style={{ background: s.color }} />{s.name}</button>
          ))}
        </div>
        <div className="form-row">
          <div className="field"><span>Layout</span>
            <div className="chips">
              <button className={`fchip ${layout === 'card' ? 'fchip-on' : ''}`} onClick={() => setLayout('card')}>ID card (85.6 x 54 mm)</button>
              <button className={`fchip ${layout === 'sticker' ? 'fchip-on' : ''}`} onClick={() => setLayout('sticker')}>A4 stickers (3 x 8)</button>
            </div>
          </div>
          <div className="field"><span>Code type</span>
            <div className="chips">
              <button className={`fchip ${format === 'qr' ? 'fchip-on' : ''}`} onClick={() => setFormat('qr')}>QR code</button>
              <button className={`fchip ${format === 'code128' ? 'fchip-on' : ''}`} onClick={() => setFormat('code128')}>Barcode (Code 128)</button>
            </div>
          </div>
        </div>
        <p className="muted small note-row"><Info size={14} /> Print at 100% scale (not "fit to page"), black on white, and use matte lamination. Lost card? Use "Reissue" on the Students page, then print it here.</p>
      </Card>
      {rows.length === 0 ? <Card><Empty title="No students in this section" /></Card> : (
        <div className={`print-sheet sheet-${layout}`}>
          {rows.map((r) => <IdCard key={r.student.id} row={r} layout={layout} format={format} color={sec!.color} school={data.settings.schoolName} />)}
        </div>
      )}
    </div>
  );
}

function IdCard({ row, layout, format, color, school }: { row: StudentRow; layout: Layout; format: Format; color: string; school: string }) {
  const [qr, setQr] = useState('');
  const svg = useRef<SVGSVGElement>(null);
  const token = row.student.qrToken;
  useEffect(() => {
    if (format === 'qr') QRCode.toDataURL(token, { margin: 1, width: 240, errorCorrectionLevel: 'M' }).then(setQr);
    else if (svg.current) JsBarcode(svg.current, token, { format: 'CODE128', displayValue: false, margin: 4, height: 50, width: 1.6 });
  }, [token, format]);
  const code = format === 'qr' ? <img src={qr} alt="" className="code-qr" /> : <svg ref={svg} className="code-bar" />;

  if (layout === 'sticker') {
    return (
      <div className="sticker" style={{ borderColor: color }}>
        {code}
        <strong>{row.student.firstName} {row.student.lastName[0]}.</strong>
      </div>
    );
  }
  return (
    <div className="idcard">
      <div className="idcard-band" style={{ background: color, color: textOn(color) }}><Logo size={18} /> {school}</div>
      <div className="idcard-body">
        <div className="idcard-text">
          <strong>{row.student.firstName}</strong>
          <span>{row.student.lastName}</span>
          <em style={{ background: color, color: textOn(color) }}>{row.section?.name.replace('Kindergarten', 'Kinder')}</em>
        </div>
        {code}
      </div>
    </div>
  );
}
