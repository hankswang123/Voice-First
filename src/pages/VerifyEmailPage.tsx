import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import * as authApi from '../utils/authApi';

export function VerifyEmailPage() {
  const location = useLocation();
  const [email, setEmail] = useState((location.state as any)?.email || '');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const navigate = useNavigate();

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await authApi.verifyEmail(email, code);
      setSuccess('Email verified! Redirecting to login...');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError('');
    try {
      await authApi.resendCode(email);
      setSuccess('New code sent! Check your console (email not configured yet).');
    } catch (err: any) {
      setError(err.message || 'Failed to resend code');
    } finally {
      setResending(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Verify Email</h1>
        <p style={styles.subtitle}>Enter the 6-digit code sent to your email</p>
        {error && <div style={styles.error}>{error}</div>}
        {success && <div style={styles.success}>{success}</div>}
        <form onSubmit={handleVerify}>
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={styles.input}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Verification Code</label>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value)}
              required
              maxLength={6}
              style={{ ...styles.input, textAlign: 'center', fontSize: 24, letterSpacing: 8 }}
              placeholder="000000"
            />
          </div>
          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? 'Verifying...' : 'Verify'}
          </button>
        </form>
        <div style={styles.links}>
          <button onClick={handleResend} disabled={resending} style={styles.textButton}>
            {resending ? 'Sending...' : 'Resend code'}
          </button>
          <Link to="/login" style={styles.link}>Back to login</Link>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  card: { background: '#fff', borderRadius: 12, padding: 40, width: '100%', maxWidth: 400, boxShadow: '0 2px 12px rgba(0,0,0,0.1)' },
  title: { fontSize: 28, fontWeight: 700, textAlign: 'center', marginBottom: 4, color: '#1a1a1a' },
  subtitle: { textAlign: 'center', color: '#666', marginBottom: 24 },
  error: { background: '#fee', color: '#c00', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 14 },
  success: { background: '#efe', color: '#060', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 14 },
  field: { marginBottom: 16 },
  label: { display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6, color: '#333' },
  input: { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #ddd', fontSize: 16, outline: 'none', boxSizing: 'border-box' },
  button: { width: '100%', padding: '12px 0', borderRadius: 8, border: 'none', background: '#1a1a1a', color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer', marginTop: 8 },
  links: { display: 'flex', justifyContent: 'space-between', marginTop: 16 },
  textButton: { background: 'none', border: 'none', color: '#1a1a1a', fontSize: 14, textDecoration: 'underline', cursor: 'pointer', padding: 0 },
  link: { color: '#1a1a1a', fontSize: 14, textDecoration: 'underline' },
};
