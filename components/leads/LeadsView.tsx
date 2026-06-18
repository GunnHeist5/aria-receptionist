'use client';

import { useState, useMemo } from 'react';

type Lead = {
  id: string;
  business_name: string;
  phone: string | null;
  city: string | null;
  state: string | null;
  website: string | null;
  call_status: string | null;
  last_called_at: string | null;
};

type Filter = 'new' | 'callback' | 'interested' | 'all';

const STATUS_LABEL: Record<string, string> = {
  new:          'New',
  interested:   'Interested',
  not_interested: 'Not Interested',
  callback:     'Callback',
};

const STATUS_COLOR: Record<string, string> = {
  new:         'text-[#555]',
  interested:  'text-[#c9a84c]',
  callback:    'text-blue-400',
};

function formatPhone(raw: string) {
  const d = raw.replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  if (d.length === 11) return `+${d[0]} (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  return raw;
}

function LeadCard({ lead, onStatus }: { lead: Lead; onStatus: (id: string, s: string) => void }) {
  const [loading, setLoading] = useState(false);
  const status = lead.call_status ?? 'new';

  async function setStatus(s: string) {
    setLoading(true);
    await fetch(`/api/clients/${lead.id}/call-status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: s }),
    });
    onStatus(lead.id, s);
    setLoading(false);
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

      {status !== 'new' && (
        <p className={`text-xs ${STATUS_COLOR[status] ?? 'text-[#555]'}`}>
          {STATUS_LABEL[status]}
          {lead.last_called_at && ` — ${new Date(lead.last_called_at).toLocaleDateString()}`}
        </p>
      )}
    </div>
  );
}

export default function LeadsView({ leads: initial }: { leads: Lead[] }) {
  const [leads, setLeads] = useState(initial);
  const [filter, setFilter] = useState<Filter>('new');

  function updateStatus(id: string, status: string) {
    setLeads(prev => prev.map(l => l.id === id
      ? { ...l, call_status: status, last_called_at: new Date().toISOString() }
      : l
    ));
  }

  const counts = useMemo(() => ({
    new:       leads.filter(l => !l.call_status || l.call_status === 'new').length,
    callback:  leads.filter(l => l.call_status === 'callback').length,
    interested: leads.filter(l => l.call_status === 'interested').length,
  }), [leads]);

  const visible = useMemo(() => leads.filter(l => {
    const s = l.call_status ?? 'new';
    if (filter === 'new')        return s === 'new';
    if (filter === 'callback')   return s === 'callback';
    if (filter === 'interested') return s === 'interested';
    return true;
  }), [leads, filter]);

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: 'new',       label: 'New',        count: counts.new },
    { key: 'callback',  label: 'Callbacks',  count: counts.callback },
    { key: 'interested',label: 'Interested', count: counts.interested },
    { key: 'all',       label: 'All',        count: leads.length },
  ];

  return (
    <main className="min-h-screen bg-[#050505] px-4 py-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <p className="text-[#c9a84c] text-xs font-mono uppercase tracking-widest mb-1">ARIA Capital</p>
        <h1 className="text-2xl text-[#f5f2ee]">Leads Pipeline</h1>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 border-b border-[#1a1a1a]">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setFilter(t.key)}
            className={`px-4 py-2 text-xs font-mono uppercase tracking-widest transition-colors border-b-2 -mb-px ${
              filter === t.key
                ? 'border-[#c9a84c] text-[#c9a84c]'
                : 'border-transparent text-[#555] hover:text-[#9a9a9a]'
            }`}>
            {t.label} {t.count > 0 && <span className="ml-1">({t.count})</span>}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-[#555] text-sm text-center py-16">No leads in this category.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map(l => (
            <LeadCard key={l.id} lead={l} onStatus={updateStatus} />
          ))}
        </div>
      )}
    </main>
  );
}
