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
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      await forgotPassword(email);
      setMessage('Check your email for a password reset link.');
    } catch (err) {
      setError('Could not send reset email. Check that the address is correct.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-logo">
        <div className="auth-logo-icon">📦</div>
        <h1>Inventory</h1>
      </div>

      <div className="auth-card">
        <h2>Reset password</h2>
        <p className="sub">We'll send a reset link to your email</p>

        {error && <div className="alert alert-error">{error}</div>}
        {message && <div className="alert alert-success">{message}</div>}

        <form onSubmit={handleSubmit}>
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
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? <span className="spinner" /> : 'Send Reset Link'}
          </button>
        </form>
      </div>

      <p className="text-center mt-16" style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
        <Link to="/sign-in">← Back to sign in</Link>
      </p>
    </div>
  );
}
