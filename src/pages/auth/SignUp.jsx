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
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    try {
      await signUp(name.trim(), email, password);
      navigate('/my-stuff');
    } catch (err) {
      setError(friendlyError(err.code));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError('');
    try {
      await signInGoogle();
      navigate('/my-stuff');
    } catch (err) {
      setError(friendlyError(err.code));
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-logo">
        <div className="auth-logo-icon">📦</div>
        <h1>Inventory</h1>
      </div>

      <div className="auth-card">
        <h2>Create account</h2>
        <p className="sub">Start tracking your stuff</p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Full Name</label>
            <input
              type="text"
              placeholder="Jane Smith"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              autoComplete="name"
            />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              placeholder="Min. 6 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          <div className="form-group">
            <label>Confirm Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>

          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? <span className="spinner" /> : 'Create Account'}
          </button>
        </form>

        <div className="divider">or</div>

        <button className="btn btn-ghost" onClick={handleGoogle}>
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>
      </div>

      <p className="text-center mt-16" style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
        Already have an account?{' '}
        <Link to="/sign-in">Sign in</Link>
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
