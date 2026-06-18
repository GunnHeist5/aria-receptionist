'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLogin() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.push('/admin');
    } else {
      setError('Incorrect password.');
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#050505] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <p className="text-[#c9a84c] text-xs font-mono uppercase tracking-widest text-center mb-8">
          ARIA Capital — Admin
        </p>
        <form onSubmit={submit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            className="w-full bg-[#0a0a0a] border border-[#1a1a1a] text-[#f5f2ee] px-4 py-3 text-sm focus:outline-none focus:border-[#c9a84c] transition-colors placeholder-[#333]"
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#c9a84c] text-[#050505] py-3 text-sm font-medium uppercase tracking-widest disabled:opacity-50">
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </main>
  );
}
