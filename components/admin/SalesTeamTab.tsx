'use client';

import { useState } from 'react';

type Rep = {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  commission_setup: string;
  commission_residual_pct: string;
  client_count: string;
  attributed_mrr: string;
  owed: string;
  paid_total: string;
};

export default function SalesTeamTab({
  reps: initial,
  baseUrl,
}: {
  reps: Rep[];
  baseUrl: string;
}) {
  const [reps, setReps]       = useState(initial);
  const [paying, setPaying]   = useState<string | null>(null);
  const [copied, setCopied]   = useState<string | null>(null);
  const [adding, setAdding]   = useState(false);
  const [newRep, setNewRep]   = useState({ name: '', slug: '', email: '', setup: '150', pct: '0' });

  async function markPaid(id: string) {
    setPaying(id);
    await fetch(`/api/salespeople/${id}/mark-paid`, { method: 'POST' });
    setReps(prev => prev.map(r => r.id === id ? { ...r, owed: '0' } : r));
    setPaying(null);
  }

  async function addRep() {
    if (!newRep.name.trim() || !newRep.slug.trim()) return;
    const res = await fetch('/api/salespeople', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newRep.name, slug: newRep.slug, email: newRep.email,
        commissionSetup: newRep.setup, commissionResidualPct: newRep.pct,
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setReps(prev => [...prev, {
        id: created.id, name: newRep.name, slug: newRep.slug, email: newRep.email || null,
        commission_setup: newRep.setup, commission_residual_pct: newRep.pct,
        client_count: '0', attributed_mrr: '0', owed: '0', paid_total: '0',
      }]);
      setNewRep({ name: '', slug: '', email: '', setup: '150', pct: '0' });
      setAdding(false);
    }
  }

  function copyLink(slug: string) {
    navigator.clipboard.writeText(`${baseUrl}/intake?ref=${slug}`);
    setCopied(slug);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-xs text-[#555] font-mono uppercase tracking-widest">Sales Reps — commission fires on Stripe payment</p>
        <button onClick={() => setAdding(v => !v)}
          className="text-xs border border-[#c9a84c]/40 text-[#c9a84c] px-3 py-1.5 hover:bg-[#c9a84c]/10 transition-colors">
          + Add Rep
        </button>
      </div>

      {adding && (
        <div className="border border-[#1a1a1a] p-5 mb-6 grid grid-cols-2 gap-3">
          <input placeholder="Name *" value={newRep.name} onChange={e => setNewRep(p => ({ ...p, name: e.target.value }))}
            className="bg-[#0a0a0a] border border-[#1a1a1a] text-[#f5f2ee] px-3 py-2 text-xs focus:outline-none focus:border-[#c9a84c]" />
          <input placeholder="Slug * (e.g. john)" value={newRep.slug} onChange={e => setNewRep(p => ({ ...p, slug: e.target.value.toLowerCase() }))}
            className="bg-[#0a0a0a] border border-[#1a1a1a] text-[#f5f2ee] px-3 py-2 text-xs focus:outline-none focus:border-[#c9a84c]" />
          <input placeholder="Email (optional)" value={newRep.email} onChange={e => setNewRep(p => ({ ...p, email: e.target.value }))}
            className="bg-[#0a0a0a] border border-[#1a1a1a] text-[#f5f2ee] px-3 py-2 text-xs focus:outline-none focus:border-[#c9a84c]" />
          <div className="flex gap-2">
            <input placeholder="Setup $ (e.g. 150)" value={newRep.setup} onChange={e => setNewRep(p => ({ ...p, setup: e.target.value }))}
              className="w-1/2 bg-[#0a0a0a] border border-[#1a1a1a] text-[#f5f2ee] px-3 py-2 text-xs focus:outline-none focus:border-[#c9a84c]" />
            <input placeholder="Residual % (e.g. 0)" value={newRep.pct} onChange={e => setNewRep(p => ({ ...p, pct: e.target.value }))}
              className="w-1/2 bg-[#0a0a0a] border border-[#1a1a1a] text-[#f5f2ee] px-3 py-2 text-xs focus:outline-none focus:border-[#c9a84c]" />
          </div>
          <button onClick={addRep}
            className="col-span-2 bg-[#c9a84c] text-[#050505] py-2 text-xs font-medium uppercase tracking-widest hover:opacity-90 transition-opacity">
            Create Rep
          </button>
        </div>
      )}

      {reps.length === 0 && !adding && (
        <p className="text-[#555] text-sm text-center py-12">No reps yet. Add one above.</p>
      )}

      <div className="border border-[#1a1a1a]">
        {reps.length > 0 && (
          <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-[#1a1a1a] text-xs text-[#555] uppercase tracking-widest font-mono">
            <span className="col-span-2">Rep</span>
            <span className="col-span-3">Intake Link</span>
            <span className="col-span-1">Clients</span>
            <span className="col-span-2">Attr. MRR</span>
            <span className="col-span-1">Commission</span>
            <span className="col-span-1">Owed</span>
            <span className="col-span-2">Actions</span>
          </div>
        )}

        {reps.map(r => {
          const owed = parseFloat(r.owed);
          return (
            <div key={r.id} className="grid grid-cols-12 gap-2 px-4 py-3 items-center border-b border-[#0f0f0f] last:border-0 hover:bg-[#0a0a0a] transition-colors">
              <div className="col-span-2">
                <p className="text-sm text-[#f5f2ee]">{r.name}</p>
                {r.email && <p className="text-xs text-[#555]">{r.email}</p>}
              </div>
              <div className="col-span-3">
                <button onClick={() => copyLink(r.slug)}
                  className="text-xs text-[#555] font-mono hover:text-[#c9a84c] transition-colors truncate block max-w-full text-left">
                  {copied === r.slug ? 'Copied!' : `…/intake?ref=${r.slug}`}
                </button>
              </div>
              <div className="col-span-1">
                <p className="text-sm text-[#f5f2ee]">{r.client_count}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-[#9a9a9a]">${parseFloat(r.attributed_mrr).toFixed(0)}/mo</p>
              </div>
              <div className="col-span-1">
                <p className="text-xs text-[#555] font-mono">
                  ${parseFloat(r.commission_setup).toFixed(0)} + {parseFloat(r.commission_residual_pct).toFixed(0)}%
                </p>
              </div>
              <div className="col-span-1">
                <p className={`text-xs font-mono ${owed > 0 ? 'text-yellow-400' : 'text-[#555]'}`}>
                  {owed > 0 ? `$${owed.toFixed(0)}` : '—'}
                </p>
              </div>
              <div className="col-span-2 flex gap-1">
                {owed > 0 && (
                  <button onClick={() => markPaid(r.id)} disabled={paying === r.id}
                    className="text-xs border border-emerald-900 text-emerald-400 px-2 py-1 hover:bg-emerald-950/40 transition-colors disabled:opacity-50">
                    {paying === r.id ? '…' : 'Mark Paid'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-[#333] mt-4 font-mono">
        Commissions accrue when Stripe payment clears — not on intake form submission.
      </p>
    </div>
  );
}
