'use client';
import { useState } from 'react';

export default function ApplyForm() {
  const [form, setForm] = useState({
    name: '', email: '', phone: '', application_text: '', submission_url: '',
  });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('submitting');
    setError('');
    try {
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, utm_source: 'upwork' }),
      });
      let data: { ok?: boolean; error?: string; already_exists?: boolean } = {};
      try { data = await res.json(); } catch { /* non-JSON response */ }
      if (!res.ok) throw new Error(data.error ?? `Server error (${res.status}) — please email justin.yi0410@gmail.com directly`);
      setStatus('done');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error — check your connection and try again, or email justin.yi0410@gmail.com';
      setError(msg);
      setStatus('error');
    }
  }

  if (status === 'done') {
    return (
      <div className="text-center py-16 space-y-4">
        <div className="text-5xl">✅</div>
        <h2 className="text-2xl font-semibold text-white">Application received</h2>
        <p className="text-zinc-400 max-w-md mx-auto">
          We review every submission. If your recording stands out, we'll be in touch within 48 hours.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Full name *</label>
          <input
            required
            value={form.name}
            onChange={e => set('name', e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-[#c9a84c]"
          />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Email *</label>
          <input
            required type="email"
            value={form.email}
            onChange={e => set('email', e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-[#c9a84c]"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm text-zinc-400 mb-1">Phone (optional)</label>
        <input
          type="tel"
          value={form.phone}
          onChange={e => set('phone', e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-[#c9a84c]"
        />
      </div>

      <div>
        <label className="block text-sm text-zinc-400 mb-1">
          Audio recording link *
          <span className="ml-2 text-zinc-600 font-normal">(Vocaroo, Loom, Google Drive, or any mp3/m4a link)</span>
        </label>
        <input
          required
          type="url"
          placeholder="https://"
          value={form.submission_url}
          onChange={e => set('submission_url', e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-[#c9a84c]"
        />
        <p className="mt-1 text-xs text-zinc-600">
          Record yourself doing a 60-second cold call pitch for an AI answering service. Include handling one objection.
        </p>
      </div>

      <div>
        <label className="block text-sm text-zinc-400 mb-1">About you (optional)</label>
        <textarea
          rows={3}
          value={form.application_text}
          onChange={e => set('application_text', e.target.value)}
          placeholder="Sales background, why you're interested, etc."
          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-[#c9a84c] resize-none"
        />
      </div>

      {error && (
        <div className="text-sm space-y-1">
          <p className="text-red-400">{error}</p>
          <p className="text-zinc-500">
            Or email directly:{' '}
            <a href="mailto:justin.yi0410@gmail.com?subject=Sales Rep Application" className="text-[#c9a84c] underline">
              justin.yi0410@gmail.com
            </a>
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={status === 'submitting'}
        className="w-full bg-[#c9a84c] hover:bg-[#b8973b] disabled:opacity-50 text-black font-semibold py-3 rounded-lg transition-colors"
      >
        {status === 'submitting' ? 'Submitting…' : 'Submit Application'}
      </button>
    </form>
  );
}
