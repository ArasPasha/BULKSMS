import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function SignUp() {
  const { signUp, signInGoogle } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault(); setError('');
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    try { await signUp(name.trim(), email, password); navigate('/my-stuff'); }
    catch (err) { setError(friendlyError(err.code)); }
    finally { setLoading(false); }
  }

  async function handleGoogle() {
    setError('');
    try { await signInGoogle(); navigate('/my-stuff'); }
    catch (err) { setError(friendlyError(err.code)); }
  }

  return (
    <div className="min-h-dvh flex flex-col justify-center px-6 pb-10 pt-6 bg-bg">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-11 h-11 rounded-[14px] bg-primary flex items-center justify-center text-2xl">📦</div>
        <h1 className="text-2xl font-extrabold text-primary">Inventory</h1>
      </div>

      <div className="bg-white rounded-[20px] p-6 shadow-DEFAULT">
        <h2 className="text-xl font-bold mb-1">Create account</h2>
        <p className="text-sm text-muted mb-5">Start tracking your stuff</p>

        {error && <div className="bg-coral-light text-coral text-sm px-4 py-2.5 rounded-lg mb-4">{error}</div>}

        <form onSubmit={handleSubmit}>
          <Field label="Full Name"><input type="text" placeholder="Jane Smith" value={name} onChange={e => setName(e.target.value)} required autoComplete="name" /></Field>
          <Field label="Email"><input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></Field>
          <Field label="Password"><input type="password" placeholder="Min. 6 characters" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="new-password" /></Field>
          <Field label="Confirm Password"><input type="password" placeholder="••••••••" value={confirm} onChange={e => setConfirm(e.target.value)} required autoComplete="new-password" /></Field>
          <button type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-lg bg-primary text-white font-semibold text-[0.95rem] transition-opacity hover:opacity-90 disabled:opacity-50 active:scale-[.98]">
            {loading ? <span className="spinner" /> : 'Create Account'}
          </button>
        </form>

        <div className="flex items-center gap-2.5 my-4 text-xs text-muted">
          <span className="flex-1 h-px bg-border" />or<span className="flex-1 h-px bg-border" />
        </div>

        <button onClick={handleGoogle}
          className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-lg border-[1.5px] border-border text-muted font-semibold text-sm">
          <GoogleIcon /> Continue with Google
        </button>
      </div>

      <p className="text-center mt-6 text-sm text-muted">
        Already have an account? <Link to="/sign-in" className="text-primary font-semibold">Sign in</Link>
      </p>
    </div>
  );
}

function friendlyError(code) {
  switch (code) {
    case 'auth/email-already-in-use': return 'An account with this email already exists.';
    case 'auth/invalid-email': return 'Invalid email address.';
    case 'auth/weak-password': return 'Password is too weak.';
    default: return 'Something went wrong. Please try again.';
  }
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1.5 mb-3.5">
      <label className="text-[0.75rem] font-semibold text-muted uppercase tracking-wider">{label}</label>
      <div className="[&>input]:w-full [&>input]:px-3.5 [&>input]:py-3 [&>input]:border-[1.5px] [&>input]:border-border [&>input]:rounded-lg [&>input]:text-[0.95rem] [&>input]:text-ink [&>input]:bg-white [&>input]:outline-none [&>input:focus]:border-primary [&>input]:font-[inherit]">
        {children}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}
