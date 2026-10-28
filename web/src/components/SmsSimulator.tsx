import { MessageSquareText, X } from 'lucide-react';
import { smsSegments, displayPhMobile } from '../domain/rules';
import { useLive } from '../lib/repo';

/** Phone-style preview of every SMS the mock driver "sent". Lets you demo without load. */
export function SmsSimulator({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: sms } = useLive((r) => r.listSms(40));
  return (
    <aside className={`sim ${open ? 'sim-open' : ''}`} aria-hidden={!open} aria-label="SMS simulator">
      <header className="sim-head">
        <div>
          <strong>SMS Simulator</strong>
          <span>Mock driver. Nothing is actually sent.</span>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close simulator"><X size={18} /></button>
      </header>
      <div className="phone">
        <div className="phone-notch" />
        <div className="phone-screen">
          {(sms ?? []).length === 0 && <p className="sim-empty"><MessageSquareText size={20} /> No messages yet</p>}
          {(sms ?? []).map((m) => (
            <div key={m.id} className={`bubble ${m.status === 'failed' ? 'bubble-failed' : ''}`}>
              <div className="bubble-meta">
                <span>To {displayPhMobile(m.to)}</span>
                <span>{new Date(m.createdAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</span>
              </div>
              <p>{m.body}</p>
              <div className="bubble-meta">
                <span className={`kind kind-${m.kind}`}>{m.kind}</span>
                <span>{m.status === 'failed' ? 'Failed' : 'Delivered'} · {m.body.length} chars · {smsSegments(m.body)} SMS</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
