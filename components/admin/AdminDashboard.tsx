'use client';

import { useState } from 'react';

type Client = {
  id: string;
  business_name: string;
  city: string | null;
  state: string | null;
  status: string;
  billing_status: string;
  provisioned_number: string | null;
  mrr: string;
  activated_at: string | null;
  created_at: string;
  forward_to_number: string | null;
  number_verified: boolean;
};

type Event = {
  client_id: string;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

type Stats = {
  live_count: string;
  total_mrr: string;
  pending_payment: string;
  past_due_count: string;
  lead_count: string;
  interested_count: string;
};

const STATUS_COLORS: Record<string, string> = {
  live:         'text-emerald-400 border-emerald-800',
  won:          'text-[#c9a84c] border-[#c9a84c]/30',
  provisioning: 'text-blue-400 border-blue-800',
  past_due:     'text-orange-400 border-orange-800',
  churned:      'text-[#555] border-[#333]',
  lead:         'text-[#9a9a9a] border-[#333]',
};

const BILLING_COLORS: Record<string, string> = {
  active:   'text-emerald-400',
  pending:  'text-yellow-400',
  past_due: 'text-orange-400',
  canceled: 'text-[#555]',
  none:     'text-[#555]',
};

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-[#1a1a1a] p-5">
      <p className="text-xs text-[#555] uppercase tracking-widest mb-1 font-mono">{label}</p>
      <p className="text-2xl text-[#f5f2ee]">{value}</p>
      {sub && <p className="text-xs text-[#555] mt-1">{sub}</p>}
    </div>
  );
}

function Badge({ status, map }: { status: string; map: Record<string, string> }) {
  const cls = map[status] ?? 'text-[#9a9a9a] border-[#333]';
  return (
    <span className={`text-xs border px-2 py-0.5 font-mono ${cls}`}>
      {status}
    </span>
  );
}

type TableFilter = 'all' | 'leads' | 'active' | 'interested';

export default function AdminDashboard({
  stats, clients, events, baseUrl,
}: {
  stats: Stats;
  clients: Client[];
  events: Event[];
  baseUrl: string;
}) {
  const [expanded,    setExpanded]    = useState<string | null>(null);
  const [copied,      setCopied]      = useState<string | null>(null);
  const [tableFilter, setTableFilter] = useState<TableFilter>('all');
  const [verifiedIds, setVerifiedIds] = useState<Set<string>>(new Set());
  const [fixing,      setFixing]      = useState<string | null>(null);

  const eventsByClient = events.reduce<Record<string, Event[]>>((acc, e) => {
    (acc[e.client_id] ??= []).push(e);
    return acc;
  }, {});

  async function markFixed(clientId: string) {
    setFixing(clientId);
    await fetch(`/api/clients/${clientId}/verify-number`, { method: 'PATCH' });
    setVerifiedIds(prev => new Set([...prev, clientId]));
    setFixing(null);
  }

  async function copyPaymentLink(clientId: string) {
    const res = await fetch('/api/billing/generate-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    });
    const data = await res.json();
    if (data.checkoutUrl) {
      await navigator.clipboard.writeText(data.checkoutUrl);
      setCopied(clientId);
      setTimeout(() => setCopied(null), 2500);
    }
  }

  const mrr = parseFloat(stats.total_mrr || '0');

  // Clients with an active bot whose number hasn't been swapped yet
  const fixRequired = clients.filter(c =>
    (c.status === 'live' || c.status === 'provisioning') &&
    !c.number_verified &&
    !verifiedIds.has(c.id)
  );

  const visibleClients = clients.filter(c => {
    if (tableFilter === 'leads')     return c.status === 'lead';
    if (tableFilter === 'active')    return c.status === 'live' || c.status === 'won' || c.status === 'provisioning';
    if (tableFilter === 'interested') return c.status === 'won';
    return true;
  });

  return (
    <main className="min-h-screen bg-[#050505] px-6 py-10 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <div>
          <p className="text-[#c9a84c] text-xs font-mono uppercase tracking-widest mb-1">ARIA Capital</p>
          <h1 className="text-2xl text-[#f5f2ee]">Admin Dashboard</h1>
        </div>
        <a href="/intake"
          className="text-xs text-[#9a9a9a] uppercase tracking-widest hover:text-[#c9a84c] transition-colors border border-[#1a1a1a] px-4 py-2">
          + New Client
        </a>
      </div>

      {/* Fix Required checklist */}
      {fixRequired.length > 0 && (
        <div className="mb-8 border border-yellow-900/60 bg-yellow-950/20 p-5">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-yellow-400 text-xs font-mono uppercase tracking-widest">
              ⚠ Number Fix Required — {fixRequired.length} bot{fixRequired.length > 1 ? 's' : ''}
            </span>
            <a
              href="https://app.trillet.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-xs text-[#555] hover:text-[#c9a84c] transition-colors border border-[#1a1a1a] px-3 py-1">
              Open Trillet ↗
            </a>
          </div>
          <p className="text-xs text-[#555] mb-4 leading-relaxed">
            API-provisioned numbers lack a LiveKit inbound trunk.
            For each bot below: go to Trillet → Phone Numbers → release the number → re-purchase through the UI, then link it to the agent. Check off when done.
          </p>
          <div className="space-y-2">
            {fixRequired.map(c => (
              <div key={c.id}
                className="flex items-center gap-4 text-sm border border-[#1a1a1a] px-4 py-3 hover:bg-[#0a0a0a] transition-colors">
                <div className="flex-1 min-w-0">
                  <span className="text-[#f5f2ee]">{c.business_name}</span>
                  {c.provisioned_number && (
                    <span className="ml-3 text-xs font-mono text-[#555]">{c.provisioned_number}</span>
                  )}
                  <span className="ml-2 text-xs text-[#333]">
                    {[c.city, c.state].filter(Boolean).join(', ')}
                  </span>
                </div>
                <span className="text-xs font-mono text-yellow-600">needs swap</span>
                <button
                  onClick={() => markFixed(c.id)}
                  disabled={fixing === c.id}
                  className="text-xs border border-emerald-900 text-emerald-400 px-3 py-1 hover:bg-emerald-950/40 transition-colors disabled:opacity-50">
                  {fixing === c.id ? 'Saving…' : 'Mark Fixed ✓'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-10">
        <StatCard label="Monthly Revenue" value={`$${mrr.toLocaleString('en-US', { minimumFractionDigits: 0 })}`} sub="MRR" />
        <StatCard label="Live Clients"    value={stats.live_count        ?? '0'} />
        <StatCard label="Leads"           value={stats.lead_count        ?? '0'} />
        <StatCard label="Interested"      value={stats.interested_count  ?? '0'} sub="needs follow-up" />
        <StatCard label="Pending Payment" value={stats.pending_payment   ?? '0'} />
        <StatCard label="Past Due"        value={stats.past_due_count    ?? '0'} />
      </div>

      {/* Table filter tabs */}
      <div className="flex gap-1 mb-4 border-b border-[#1a1a1a]">
        {([
          { key: 'all',        label: 'All',        count: clients.length },
          { key: 'leads',      label: 'Leads',      count: parseInt(stats.lead_count ?? '0') },
          { key: 'interested', label: 'Interested', count: parseInt(stats.interested_count ?? '0') },
          { key: 'active',     label: 'Active',     count: parseInt(stats.live_count ?? '0') },
        ] as { key: TableFilter; label: string; count: number }[]).map(t => (
          <button key={t.key} onClick={() => setTableFilter(t.key)}
            className={`px-4 py-2 text-xs font-mono uppercase tracking-widest transition-colors border-b-2 -mb-px ${
              tableFilter === t.key
                ? 'border-[#c9a84c] text-[#c9a84c]'
                : 'border-transparent text-[#555] hover:text-[#9a9a9a]'
            }`}>
            {t.label}{t.count > 0 ? ` (${t.count})` : ''}
          </button>
        ))}
        <a href="/leads" target="_blank"
          className="ml-auto px-4 py-2 text-xs font-mono text-[#555] hover:text-[#c9a84c] transition-colors">
          Contractor View ↗
        </a>
      </div>

      {/* Client Table */}
      <div className="border border-[#1a1a1a]">
        <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-[#1a1a1a] text-xs text-[#555] uppercase tracking-widest font-mono">
          <span className="col-span-3">Business</span>
          <span className="col-span-2">Status</span>
          <span className="col-span-2">Billing</span>
          <span className="col-span-2">Number</span>
          <span className="col-span-1">MRR</span>
          <span className="col-span-2">Actions</span>
        </div>

        {visibleClients.length === 0 && (
          <p className="text-[#555] text-sm text-center py-12">Nothing here yet.</p>
        )}

        {visibleClients.map(c => {
          const clientEvents = eventsByClient[c.id] || [];
          const isExpanded   = expanded === c.id;

          return (
            <div key={c.id} className="border-b border-[#0f0f0f] last:border-0">
              {/* Row */}
              <div className="grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-[#0a0a0a] transition-colors">
                <div className="col-span-3">
                  <p className="text-sm text-[#f5f2ee] truncate">{c.business_name}</p>
                  <p className="text-xs text-[#555]">{[c.city, c.state].filter(Boolean).join(', ')}</p>
                </div>
                <div className="col-span-2">
                  <Badge status={c.status} map={STATUS_COLORS} />
                </div>
                <div className="col-span-2">
                  <Badge status={c.billing_status} map={BILLING_COLORS} />
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-[#9a9a9a] font-mono">
                    {c.provisioned_number ?? '—'}
                  </p>
                </div>
                <div className="col-span-1">
                  <p className="text-xs text-[#9a9a9a]">
                    {parseFloat(c.mrr) > 0 ? `$${parseFloat(c.mrr).toFixed(0)}` : '—'}
                  </p>
                </div>
                <div className="col-span-2 flex gap-2">
                  {(c.billing_status === 'pending' || c.billing_status === 'none') && (
                    <button
                      onClick={() => copyPaymentLink(c.id)}
                      className="text-xs border border-[#c9a84c]/40 text-[#c9a84c] px-2 py-1 hover:bg-[#c9a84c]/10 transition-colors">
                      {copied === c.id ? 'Copied!' : 'Copy Link'}
                    </button>
                  )}
                  {clientEvents.length > 0 && (
                    <button
                      onClick={() => setExpanded(isExpanded ? null : c.id)}
                      className="text-xs border border-[#1a1a1a] text-[#9a9a9a] px-2 py-1 hover:border-[#333] transition-colors">
                      {isExpanded ? 'Hide' : `Events (${clientEvents.length})`}
                    </button>
                  )}
                </div>
              </div>

              {/* Events drawer */}
              {isExpanded && (
                <div className="bg-[#080808] border-t border-[#1a1a1a] px-6 py-4">
                  <p className="text-xs text-[#555] uppercase tracking-widest mb-3 font-mono">Recent Events</p>
                  <div className="space-y-2">
                    {clientEvents.map((ev, i) => (
                      <div key={i} className="flex gap-4 text-xs">
                        <span className="text-[#555] font-mono whitespace-nowrap">
                          {new Date(ev.created_at).toLocaleString()}
                        </span>
                        <span className="text-[#c9a84c] font-mono">{ev.type}</span>
                        <span className="text-[#9a9a9a] truncate">
                          {ev.payload?.step
                            ? String(ev.payload.step)
                            : ev.payload?.event
                            ? String(ev.payload.event)
                            : JSON.stringify(ev.payload).slice(0, 80)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
