'use client';

import { useState } from 'react';

type Lead = {
  id: string;
  business_name: string;
  phone: string | null;
  city: string | null;
  state: string | null;
  website: string | null;
  call_status: string | null;
  last_called_at: string | null;
  claimed_by: string | null;
};

type Filter = 'new' | 'callback' | 'interested' | 'all';

const STATUS_LABEL: Record<string, string> = {
  new:            'New',
  interested:     'Interested',
  not_interested: 'Not Interested',
  callback:       'Callback',
};

const STATUS_COLOR: Record<string, string> = {
  new:        'text-[#555]',
  interested: 'text-[#c9a84c]',
  callback:   'text-blue-400',
};

function formatPhone(raw: string) {
  const d = raw.replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  if (d.length === 11) return `+${d[0]} (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  return raw;
}

function LeadCard({ lead, contractorId, onStatus }: {
  lead: Lead;
  contractorId: string | null;
  onStatus: (id: string, s: string) => void;
}) {
  const [loading,     setLoading]     = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [copied,      setCopied]      = useState(false);
  const status = lead.call_status ?? 'new';

  async function setStatus(s: string) {
    setLoading(true);
    const res  = await fetch(`/api/clients/${lead.id}/call-status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: s, contractorId }),
    });
    const data = await res.json();
    if (data.checkoutUrl) setCheckoutUrl(data.checkoutUrl);
    onStatus(lead.id, s);
    setLoading(false);
  }

  async function copyLink() {
    if (!checkoutUrl) return;
    await navigator.clipboard.writeText(checkoutUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const borderColor = status === 'interested' ? 'border-[#c9a84c]/40'
    : status === 'callback' ? 'border-blue-900'
    : 'border-[#1a1a1a]';

  return (
    <div className={`border ${borderColor} bg-[#080808] p-4 flex flex-col gap-3`}>
      <div>
        <p className="text-[#f5f2ee] font-medium truncate">{lead.business_name}</p>
        <p className="text-xs text-[#555]">{[lead.city, lead.state].filter(Boolean).join(', ')}</p>
      </div>

      {lead.phone && (
        <a href={`tel:${lead.phone}`}
          className="text-xl text-[#c9a84c] font-mono tracking-wide hover:text-[#e0c070]">
          {formatPhone(lead.phone)}
        </a>
      )}

      {lead.website && (
        <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
          target="_blank" rel="noreferrer"
          className="text-xs text-[#555] hover:text-[#9a9a9a] truncate transition-colors">
          {lead.website.replace(/^https?:\/\//, '')}
        </a>
      )}

      <div className="flex gap-2 mt-1">
        {(['interested', 'not_interested', 'callback'] as const).map(s => (
          <button key={s}
            disabled={loading || status === s}
            onClick={() => setStatus(s)}
            className={`flex-1 text-xs py-2 border transition-colors disabled:opacity-40 ${
              status === s
                ? s === 'interested'   ? 'border-[#c9a84c] text-[#c9a84c] bg-[#c9a84c]/10'
                : s === 'callback'     ? 'border-blue-700 text-blue-400 bg-blue-900/20'
                :                        'border-[#333] text-[#555]'
                : 'border-[#1a1a1a] text-[#9a9a9a] hover:border-[#333]'
            }`}>
            {s === 'interested' ? '✓ Interested' : s === 'not_interested' ? '✗ No' : '↩ Callback'}
          </button>
        ))}
      </div>

      {checkoutUrl && (
        <button onClick={copyLink}
          className="w-full text-sm py-3 border border-[#c9a84c] text-[#c9a84c] bg-[#c9a84c]/10 hover:bg-[#c9a84c]/20 transition-colors font-medium">
          {copied ? '✓ Copied — send to client!' : '📋 Copy Payment Link'}
        </button>
      )}

      {status !== 'new' && !checkoutUrl && (
        <p className={`text-xs ${STATUS_COLOR[status] ?? 'text-[#555]'}`}>
          {STATUS_LABEL[status]}
          {lead.last_called_at && ` — ${new Date(lead.last_called_at).toLocaleDateString()}`}
        </p>
      )}
    </div>
  );
}

export default function LeadsView({
  leads: initial, contractorId, filter, page, perPage, counts,
}: {
  leads: Lead[];
  contractorId: string | null;
  filter: Filter;
  page: number;
  perPage: number;
  counts: { new: number; callback: number; interested: number; all: number };
}) {
  const [leads, setLeads] = useState(initial);

  function updateStatus(id: string, status: string) {
    setLeads(prev => prev.map(l => l.id === id
      ? { ...l, call_status: status, last_called_at: new Date().toISOString() }
      : l
    ));
  }

  // Build server URLs (tabs + pagination drive a fresh, paginated fetch).
  function pageUrl(opts: { status?: Filter; page?: number }) {
    const sp = new URLSearchParams();
    if (contractorId) sp.set('c', contractorId);
    sp.set('status', opts.status ?? filter);
    const pg = opts.page ?? page;
    if (pg > 1) sp.set('page', String(pg));
    return `/leads?${sp.toString()}`;
  }
  const exportSp = new URLSearchParams();
  if (contractorId) exportSp.set('c', contractorId);
  exportSp.set('status', filter);
  const exportUrl = `/api/leads/export?${exportSp.toString()}`;

  const total      = counts[filter];
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const startIdx   = total === 0 ? 0 : (page - 1) * perPage + 1;
  const endIdx     = (page - 1) * perPage + leads.length;

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: 'new',        label: 'New',        count: counts.new },
    { key: 'callback',   label: 'Callbacks',  count: counts.callback },
    { key: 'interested', label: 'Interested', count: counts.interested },
    { key: 'all',        label: 'All',        count: counts.all },
  ];

  return (
    <main className="min-h-screen bg-[#050505] px-4 py-8 max-w-4xl mx-auto">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-[#c9a84c] text-xs font-mono uppercase tracking-widest mb-1">ARIA Capital</p>
          <h1 className="text-2xl text-[#f5f2ee]">Leads Pipeline</h1>
          {contractorId
            ? <p className="text-xs text-[#555] mt-1">Logged in as <span className="text-[#9a9a9a]">{contractorId}</span></p>
            : <p className="text-xs text-red-400 mt-1">No contractor ID — add ?c=yourname to your URL</p>
          }
        </div>
        <a href={exportUrl}
          className="shrink-0 text-xs border border-[#c9a84c]/40 text-[#c9a84c] px-3 py-2 hover:bg-[#c9a84c]/10 transition-colors font-mono uppercase tracking-widest">
          ⬇ Export CSV
        </a>
      </div>

      {/* Filter tabs — each is a server-side navigation to page 1 of that filter */}
      <div className="flex gap-1 mb-6 border-b border-[#1a1a1a]">
        {tabs.map(t => (
          <a key={t.key} href={pageUrl({ status: t.key, page: 1 })}
            className={`px-4 py-2 text-xs font-mono uppercase tracking-widest transition-colors border-b-2 -mb-px ${
              filter === t.key
                ? 'border-[#c9a84c] text-[#c9a84c]'
                : 'border-transparent text-[#555] hover:text-[#9a9a9a]'
            }`}>
            {t.label} {t.count > 0 && <span className="ml-1">({t.count})</span>}
          </a>
        ))}
      </div>

      {leads.length === 0 ? (
        <p className="text-[#555] text-sm text-center py-16">No leads in this category.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {leads.map(l => (
            <LeadCard key={l.id} lead={l} contractorId={contractorId} onStatus={updateStatus} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > perPage && (
        <div className="flex items-center justify-between mt-8 text-xs font-mono text-[#555]">
          <span>{startIdx}–{endIdx} of {total}</span>
          <div className="flex items-center gap-3">
            {page > 1
              ? <a href={pageUrl({ page: page - 1 })} className="text-[#c9a84c] hover:text-[#e0c070]">← Prev</a>
              : <span className="opacity-30">← Prev</span>}
            <span>Page {page} of {totalPages}</span>
            {page < totalPages
              ? <a href={pageUrl({ page: page + 1 })} className="text-[#c9a84c] hover:text-[#e0c070]">Next →</a>
              : <span className="opacity-30">Next →</span>}
          </div>
        </div>
      )}
    </main>
  );
}
