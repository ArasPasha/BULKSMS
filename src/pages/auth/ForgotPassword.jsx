import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function ForgotPassword() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault(); setError(''); setMessage(''); setLoading(true);
    try { await forgotPassword(email); setMessage('Check your email for a password reset link.'); }
    catch { setError('Could not send reset email. Check that the address is correct.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-dvh flex flex-col justify-center px-6 pb-10 pt-6 bg-bg">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-11 h-11 rounded-[14px] bg-primary flex items-center justify-center text-2xl">💬</div>
        <h1 className="text-2xl font-extrabold text-primary">SMS Sender</h1>
      </div>

      <div className="bg-white rounded-[20px] p-6 shadow-DEFAULT">
        <h2 className="text-xl font-bold mb-1">Reset password</h2>
        <p className="text-sm text-muted mb-5">We'll send a reset link to your email</p>

        {error && <div className="bg-coral-light text-coral text-sm px-4 py-2.5 rounded-lg mb-4">{error}</div>}
        {message && <div className="bg-teal-light text-teal text-sm px-4 py-2.5 rounded-lg mb-4">{message}</div>}

        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5 mb-4">
            <label className="text-[0.75rem] font-semibold text-muted uppercase tracking-wider">Email</label>
            <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email"
              className="w-full px-3.5 py-3 border-[1.5px] border-border rounded-lg text-[0.95rem] text-ink bg-white outline-none focus:border-primary font-[inherit]" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-lg bg-primary text-white font-semibold disabled:opacity-50">
            {loading ? <span className="spinner" /> : 'Send Reset Link'}
          </button>
        </form>
      </div>

      <p className="text-center mt-6 text-sm">
        <Link to="/sign-in" className="text-primary">← Back to sign in</Link>
      </p>
    </div>
  );
}
