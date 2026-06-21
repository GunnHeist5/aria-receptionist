import ApplyForm from '@/components/apply/ApplyForm';

export const metadata = { title: 'Sales Rep — Reachwell' };

export default function ApplyPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-2xl mx-auto px-6 py-16">

        {/* Header */}
        <div className="mb-10 text-center space-y-3">
          <p className="text-[#c9a84c] text-sm font-medium tracking-widest uppercase">Reachwell · Remote · 1099</p>
          <h1 className="text-3xl sm:text-4xl font-bold">Commission-Based Sales Rep</h1>
          <p className="text-zinc-400 text-lg leading-relaxed max-w-lg mx-auto">
            Cold call local service businesses. Sell AI phone receptionists. $100/mo base + commission on every client you bring in.
          </p>
        </div>

        {/* Earnings potential */}
        <div className="mb-10 grid grid-cols-3 gap-3">
          {[
            { value: '$400', label: 'Per close (setup)' },
            { value: '$100/mo', label: 'Base pay' },
            { value: '10%', label: 'Residual MRR (18-mo cap)' },
          ].map(item => (
            <div key={item.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
              <p className="text-[#c9a84c] font-bold text-xl">{item.value}</p>
              <p className="text-zinc-500 text-xs mt-1">{item.label}</p>
            </div>
          ))}
        </div>

        {/* Math example */}
        <div className="mb-10 bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <p className="text-zinc-400 text-sm font-medium mb-3 uppercase tracking-wide">What 5 closes looks like</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-400">5 × $400 setup commissions</span>
              <span className="text-white font-semibold">$2,000</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">$100/mo base pay</span>
              <span className="text-white font-semibold">$100/mo</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">5 clients × $297/mo × 10% residual</span>
              <span className="text-white font-semibold">$148/mo</span>
            </div>
            <div className="border-t border-zinc-800 pt-2 mt-2 flex justify-between">
              <span className="text-zinc-400">After 6 months (if all stay)</span>
              <span className="text-[#c9a84c] font-bold">$3,488 total</span>
            </div>
            <p className="text-zinc-600 text-xs pt-1">Residual capped at 18 months per client.</p>
          </div>
        </div>

        {/* What you'll be doing */}
        <div className="mb-10 bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <h2 className="font-semibold text-white mb-4">What the job looks like</h2>
          <div className="space-y-3 text-sm text-zinc-400">
            <p>• Cold call HVAC companies, plumbers, electricians, roofers — any local service business</p>
            <p>• Pitch is simple: "When you miss a call, you lose a lead. We fix that for $297/mo."</p>
            <p>• When they say yes, send them your link. They fill it out, pay, system sets up automatically</p>
            <p>• Your AI manager coaches you daily, gives you your numbers, and answers product questions</p>
            <p>• No cold email, no account management, no quota. Just dials and closes.</p>
          </div>
        </div>

        {/* What we're looking for */}
        <div className="mb-10 bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <h2 className="font-semibold text-white mb-4">Who we want</h2>
          <div className="space-y-2 text-sm">
            {[
              'You can stay calm and keep a conversation going when someone pushes back',
              'You don\'t need someone to manage you — you dial, you figure it out, you close',
              'You\'ve done outbound calls before (door-to-door, phone sales, anything counts)',
              'You want a residual income stream, not just a one-time payout',
            ].map(item => (
              <p key={item} className="text-zinc-400 flex gap-2">
                <span className="text-[#c9a84c] flex-shrink-0 mt-0.5">✓</span>{item}
              </p>
            ))}
          </div>
        </div>

        {/* How to apply */}
        <div className="mb-6 bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <h2 className="font-semibold text-white mb-2">How to apply</h2>
          <p className="text-zinc-400 text-sm mb-4">
            Record a 60-second audio pitch as if you're cold calling an HVAC company. Handle one objection. Upload the link below.
            We screen every submission and reply within 48 hours if you're moving forward.
          </p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              { step: '1', text: 'Record your 60-second pitch (Loom, Voice Memo, anything)' },
              { step: '2', text: 'Submit the link below with your name and email' },
              { step: '3', text: 'We score it and reach out within 48h if it\'s a fit' },
              { step: '4', text: 'Sign contract → you\'re live same day' },
            ].map(item => (
              <div key={item.step} className="flex gap-3">
                <span className="text-[#c9a84c] font-bold flex-shrink-0">{item.step}.</span>
                <span className="text-zinc-400">{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Form */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-8">
          <h2 className="text-xl font-semibold mb-1">Submit your application</h2>
          <p className="text-zinc-500 text-sm mb-6">Takes 2 minutes. The recording is everything — make it count.</p>
          <ApplyForm />
        </div>

        <p className="text-center text-zinc-700 text-xs mt-8">
          Reachwell · AI phone receptionists for local service businesses · Remote · 1099
        </p>
      </div>
    </main>
  );
}
