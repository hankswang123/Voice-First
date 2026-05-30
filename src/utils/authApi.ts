const API_BASE = '/api/auth';

interface AuthResponse {
  accessToken?: string;
  refreshToken?: string;
  user?: { id: string; email: string; displayName: string; role: string };
  message?: string;
  error?: string;
}

async function request(path: string, options: RequestInit = {}): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export async function register(email: string, password: string, displayName?: string) {
  return request('/register', { method: 'POST', body: JSON.stringify({ email, password, displayName }) });
}

export async function verifyEmail(email: string, code: string) {
  return request('/verify-email', { method: 'POST', body: JSON.stringify({ email, code }) });
}

export async function resendCode(email: string) {
  return request('/resend-code', { method: 'POST', body: JSON.stringify({ email }) });
}

export async function login(email: string, password: string) {
  return request('/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export async function refresh(refreshToken: string) {
  return request('/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) });
}

export async function logout(accessToken: string) {
  return request('/logout', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } });
}

export async function forgotPassword(email: string) {
  return request('/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
}

export async function resetPassword(email: string, code: string, newPassword: string) {
  return request('/reset-password', { method: 'POST', body: JSON.stringify({ email, code, newPassword }) });
}

export async function getMe(accessToken: string) {
  const res = await fetch(`${API_BASE}/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error('Not authenticated');
  return res.json();
}

export async function getPreferences(accessToken: string) {
  const res = await fetch(`${API_BASE}/preferences`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to get preferences');
  return res.json();
}

export async function setPreference(accessToken: string, key: string, value: string) {
  const res = await fetch(`${API_BASE}/preferences`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ key, value }),
  });
  if (!res.ok) throw new Error('Failed to save preference');
  return res.json();
}
