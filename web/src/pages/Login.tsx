import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn, KeyRound, Info } from 'lucide-react';
import { useRepo } from '../lib/repo';
import { Logo } from '../components/ui';

/** One sign-in page for teachers and admins; the account's role decides which portal opens. */
export function Login() {
  const repo = useRepo();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const demo = repo.demoAccounts();

  useEffect(() => {
    repo.getSession().then((s) => { if (s) navigate(s.role === 'admin' ? '/admin' : '/', { replace: true }); });
  }, [repo, navigate]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null); setNotice(null);
    if (!email || !password) return setError('Enter your email and password.');
    setBusy(true);
    try {
      const s = await repo.signIn(email, password);
      navigate(s.role === 'admin' ? '/admin' : '/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally { setBusy(false); }
  };

  const forgot = async () => {
    setError(null); setNotice(null);
    if (!email) return setError('Type your email first, then press "Forgot password?".');
    try { await repo.sendPasswordReset(email); setNotice(`A reset link was sent to ${email}.`); }
    catch (err) { setError((err as Error).message); }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <section className="login-art" aria-hidden="true">
          <div className="login-brand"><Logo size={40} /><span>Doorbell</span></div>
          <div className="art-bubbles">
            <div className="art-bubble b1"><b>Doorbell:</b> Juan arrived at school at 7:42 AM.</div>
            <div className="art-bubble b2"><b>Doorbell:</b> Nakarating na si Bea sa paaralan ng 7:45 AM.</div>
            <div className="art-bubble b3">Attendance confirmed for Kinder I - Apple</div>
          </div>
          <p>Scan the ID. Parents know right away.</p>
        </section>
        <section className="login-form">
          <h1>Sign in</h1>
          <p className="muted">For teachers and school admins. Use the account given by your school.</p>
          <form onSubmit={submit}>
            <label className="field"><span>Email</span>
              <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            </label>
            <label className="field"><span>Password</span>
              <div className="pw">
                <input className="input" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" className="icon-btn sm" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
              </div>
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            {notice && <p className="ok-text" role="status">{notice}</p>}
            <button className="btn btn-ink wide" disabled={busy} type="submit"><LogIn size={18} /> {busy ? 'Signing in…' : 'Sign in'}</button>
            <button type="button" className="link-btn center" onClick={forgot}><KeyRound size={14} /> Forgot password?</button>
          </form>
          {demo.length > 0 && (
            <div className="demo-box">
              <p><Info size={14} /> <b>Demo mode.</b> The cloud is not connected yet, so data is sample data and resets when you close the tab. Try an account:</p>
              {demo.map((a) => (
                <button key={a.email} className="demo-acc" onClick={() => { setEmail(a.email); setPassword(a.password); }}>
                  <strong>{a.label}</strong><span>{a.email}</span>
                </button>
              ))}
              <p className="muted small">Password for all demo accounts: <code>{demo[0].password}</code></p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
