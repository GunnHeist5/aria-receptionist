'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

const CARRIER_OPTIONS = [
  { value: 'verizon',          label: 'Verizon Wireless' },
  { value: 'att',              label: 'AT&T Wireless' },
  { value: 'tmobile',          label: 'T-Mobile / Sprint' },
  { value: 'uscellular',       label: 'US Cellular' },
  { value: 'xfinity',          label: 'Xfinity Voice (Residential)' },
  { value: 'comcast_business', label: 'Comcast Business (VoiceEdge)' },
  { value: 'spectrum',         label: 'Spectrum Business' },
  { value: 'cox',              label: 'Cox Business' },
  { value: 'frontier',         label: 'Frontier' },
  { value: 'ringcentral',      label: 'RingCentral' },
  { value: 'google_voice',     label: 'Google Voice' },
  { value: 'vonage',           label: 'Vonage Business' },
  { value: 'other',            label: 'Other / Landline / VoIP' },
];

const SERVICE_GROUPS = [
  {
    label: 'Plumbing',
    items: ['Drain cleaning', 'Leak repair', 'Water heaters', 'Sewer repair',
            'Pipe installation', 'Emergency plumbing', 'Hydro jetting', 'Camera inspection'],
  },
  {
    label: 'HVAC',
    items: ['AC repair', 'AC installation', 'Heating repair', 'Furnace installation',
            'Duct cleaning', 'Air quality', 'Thermostat install', 'Emergency HVAC'],
  },
];

type F = Record<string, string>;

const DEFAULTS: F = {
  businessName: '', phone: '', email: '', city: '', state: '', zip: '',
  website: '', pricingNotes: '',
  forwardToNumber: '', areaCode: '', tone: 'professional',
  businessHoursPreset: 'mon-fri-8-5', services: '',
  doNotSay: '', escalationKeywords: 'burst pipe, flooding, gas leak, no hot water',
  afterHoursBehavior: 'voicemail', alertPhone: '',
  carrier: '', carrierName: '',
};

const label = 'block text-xs text-[#9a9a9a] uppercase tracking-widest mb-1.5';
const field = 'w-full bg-[#0a0a0a] border border-[#1a1a1a] text-[#f5f2ee] px-3 py-2.5 text-sm focus:outline-none focus:border-[#c9a84c] transition-colors placeholder-[#333]';
const select = field + ' appearance-none cursor-pointer';

export default function IntakeForm({ refSlug }: { refSlug?: string | null }) {
  const router = useRouter();
  const [form, setForm] = useState<F>(DEFAULTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [customInput, setCustomInput] = useState('');

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  function toggleService(svc: string) {
    const curr = form.services.split(',').map(s => s.trim()).filter(Boolean);
    const next = curr.includes(svc) ? curr.filter(s => s !== svc) : [...curr, svc];
    setForm(f => ({ ...f, services: next.join(', ') }));
  }

  function addCustom() {
    const val = customInput.trim();
    if (!val) return;
    toggleService(val);
    setCustomInput('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, ref: refSlug ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Submission failed'); return; }
      const params = new URLSearchParams({ name: form.businessName });
      if (data.checkoutUrl) params.set('checkoutUrl', data.checkoutUrl);
      router.push(`/intake/success?${params.toString()}`);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }

  const active = (svc: string) => form.services.split(',').map(s => s.trim()).includes(svc);


  return (
    <form onSubmit={submit} className="space-y-10">

      {/* Business Info */}
      <section>
        <SectionHeader n="01" title="Business Information" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={label}>Business Name *</label>
            <input className={field} value={form.businessName} onChange={set('businessName')} placeholder="Murphy's Plumbing LLC" required />
          </div>
          <div>
            <label className={label}>Business Phone *</label>
            <input className={field} value={form.phone} onChange={set('phone')} placeholder="+15125550100" required />
          </div>
          <div>
            <label className={label}>Email</label>
            <input className={field} type="email" value={form.email} onChange={set('email')} placeholder="owner@business.com" />
          </div>
          <div>
            <label className={label}>City *</label>
            <input className={field} value={form.city} onChange={set('city')} placeholder="Austin" required />
          </div>
          <div>
            <label className={label}>State *</label>
            <input className={field} value={form.state} onChange={set('state')} placeholder="TX" maxLength={2} required />
          </div>
          <div>
            <label className={label}>ZIP</label>
            <input className={field} value={form.zip} onChange={set('zip')} placeholder="78701" />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Business Website (optional)</label>
            <input className={field} type="url" value={form.website} onChange={set('website')} placeholder="https://murphysplumbing.com" />
            <p className="text-xs text-[#555] mt-1">If provided, the AI will be trained on the site content.</p>
          </div>
        </div>
      </section>

      {/* Call Routing */}
      <section>
        <SectionHeader n="02" title="Call Routing" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={label}>Forward Live Calls To *</label>
            <input className={field} value={form.forwardToNumber} onChange={set('forwardToNumber')} placeholder="+15125550199 — owner's real cell" required />
            <p className="text-xs text-[#555] mt-1">When the AI transfers a caller, it goes here.</p>
          </div>
          <div>
            <label className={label}>Preferred Area Code for AI Number *</label>
            <input className={field} value={form.areaCode} onChange={set('areaCode')} placeholder="512" maxLength={3} required />
          </div>
          <div>
            <label className={label}>Alert SMS (for notifications)</label>
            <input className={field} value={form.alertPhone} onChange={set('alertPhone')} placeholder="+15125550199" />
          </div>
          <div>
            <label className={label}>Phone Carrier</label>
            <select className={select} value={form.carrier} onChange={set('carrier')}>
              <option value="">— select carrier —</option>
              {CARRIER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <p className="text-xs text-[#555] mt-1">Used to generate exact forwarding instructions for the client.</p>
          </div>
          {form.carrier === 'other' && (
            <div>
              <label className={label}>Carrier Name</label>
              <input className={field} value={form.carrierName} onChange={set('carrierName')} placeholder="e.g. Zoom Phone, Nextiva, Grasshopper" />
            </div>
          )}
        </div>
      </section>

      {/* AI Personality */}
      <section>
        <SectionHeader n="03" title="AI Personality" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Tone</label>
            <select className={select} value={form.tone} onChange={set('tone')}>
              <option value="professional">Professional</option>
              <option value="friendly">Friendly</option>
              <option value="casual">Casual</option>
              <option value="formal">Formal</option>
            </select>
          </div>
          <div>
            <label className={label}>Business Hours</label>
            <select className={select} value={form.businessHoursPreset} onChange={set('businessHoursPreset')}>
              <option value="mon-fri-8-5">Mon–Fri  8 AM – 5 PM</option>
              <option value="mon-fri-7-6">Mon–Fri  7 AM – 6 PM</option>
              <option value="mon-sat-8-5">Mon–Sat  8 AM – 5 PM</option>
              <option value="247">24 / 7  Always Open</option>
            </select>
          </div>
          <div>
            <label className={label}>After-Hours Behavior</label>
            <select className={select} value={form.afterHoursBehavior} onChange={set('afterHoursBehavior')}>
              <option value="voicemail">Take a voicemail</option>
              <option value="forward">Forward to owner</option>
              <option value="emergency_only">AI answers emergencies only</option>
              <option value="ai_message">AI handles with a message</option>
            </select>
          </div>
        </div>
      </section>

      {/* Services */}
      <section>
        <SectionHeader n="04" title="Services Offered" />
        {SERVICE_GROUPS.map(group => (
          <div key={group.label} className="mb-4">
            <p className="text-xs text-[#555] uppercase tracking-widest mb-2">{group.label}</p>
            <div className="flex flex-wrap gap-2">
              {group.items.map(svc => (
                <button key={svc} type="button" onClick={() => toggleService(svc)}
                  className={`px-3 py-1.5 text-xs border transition-colors ${active(svc) ? 'border-[#c9a84c] text-[#c9a84c] bg-[#c9a84c]/5' : 'border-[#1a1a1a] text-[#555] hover:border-[#333]'}`}>
                  {svc}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            value={customInput}
            onChange={e => setCustomInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
            placeholder="Add custom service..."
            className="flex-1 bg-[#0a0a0a] border border-[#1a1a1a] text-[#f5f2ee] px-3 py-2 text-xs focus:outline-none focus:border-[#c9a84c] transition-colors placeholder-[#333]"
          />
          <button type="button" onClick={addCustom}
            className="px-4 py-2 text-xs border border-[#1a1a1a] text-[#9a9a9a] hover:border-[#c9a84c] hover:text-[#c9a84c] transition-colors">
            +
          </button>
        </div>
      </section>

      {/* Pricing */}
      <section>
        <SectionHeader n="05" title="Pricing Notes" />
        <div>
          <label className={label}>Service Rates (optional)</label>
          <textarea className={field + ' resize-none'} rows={3} value={form.pricingNotes} onChange={set('pricingNotes')}
            placeholder="e.g. Emergency call fee: $150. Drain cleaning: $95–150. Water heater install: $800–1200." />
          <p className="text-xs text-[#555] mt-1">The AI won&apos;t quote exact prices — it will use this as context and tell callers the team will confirm.</p>
        </div>
      </section>

      {/* Guard Rails */}
      <section>
        <SectionHeader n="06" title="AI Guard Rails" />
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className={label}>Escalation Keywords (comma-separated)</label>
            <input className={field} value={form.escalationKeywords} onChange={set('escalationKeywords')} placeholder="burst pipe, flooding, gas leak" />
            <p className="text-xs text-[#555] mt-1">AI alerts the owner immediately for these.</p>
          </div>
          <div>
            <label className={label}>Do Not Say (comma-separated)</label>
            <input className={field} value={form.doNotSay} onChange={set('doNotSay')} placeholder="cheapest in town, free estimates" />
          </div>
        </div>
      </section>

      {error && (
        <p className="text-red-400 text-sm border border-red-900 px-4 py-2">{error}</p>
      )}

      <motion.button type="submit" disabled={loading}
        whileHover={{ opacity: loading ? 1 : 0.9 }}
        className="w-full bg-[#c9a84c] text-[#050505] py-3.5 text-sm font-medium uppercase tracking-widest disabled:opacity-50">
        {loading ? 'Submitting…' : 'Onboard Client →'}
      </motion.button>
    </form>
  );
}

function SectionHeader({ n, title }: { n: string; title: string }) {
  return (
    <div className="flex items-center gap-4 mb-5">
      <span className="text-[#c9a84c] text-xs font-mono">{n}</span>
      <h2 className="text-sm uppercase tracking-widest text-[#9a9a9a]">{title}</h2>
      <div className="flex-1 h-px bg-[#1a1a1a]" />
    </div>
  );
}
