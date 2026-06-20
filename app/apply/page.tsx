import ApplyForm from '@/components/apply/ApplyForm';

export const metadata = { title: 'Apply — Reachwell Sales' };

export default function ApplyPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-2xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-10 text-center space-y-3">
          <p className="text-[#c9a84c] text-sm font-medium tracking-widest uppercase">Reachwell</p>
          <h1 className="text-3xl sm:text-4xl font-bold">Join the Sales Team</h1>
          <p className="text-zinc-400 text-lg leading-relaxed">
            We're building a team of commission-based cold callers selling AI phone receptionists to local service businesses.
            No base salary — high upside.
          </p>
        </div>

        {/* What you get */}
        <div className="mb-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Setup commission', value: 'Per client' },
            { label: 'Residual MRR', value: 'Monthly, ongoing' },
            { label: 'Work style', value: 'Remote, 1099' },
          ].map(item => (
            <div key={item.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
              <p className="text-[#c9a84c] font-semibold text-lg">{item.value}</p>
              <p className="text-zinc-500 text-sm mt-1">{item.label}</p>
            </div>
          ))}
        </div>

        {/* What we're looking for */}
        <div className="mb-10 bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-2">
          <h2 className="font-semibold text-white mb-3">What we look for</h2>
          {[
            'You can hold a conversation and stay calm when someone says no',
            'You\'re comfortable making outbound calls to small businesses',
            'You don\'t need hand-holding to get to work',
            'You understand or can learn basic AI / tech concepts',
          ].map(item => (
            <p key={item} className="text-zinc-400 text-sm flex gap-2">
              <span className="text-[#c9a84c] flex-shrink-0">✓</span>{item}
            </p>
          ))}
        </div>

        {/* Form */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-8">
          <h2 className="text-xl font-semibold mb-6">Apply now</h2>
          <ApplyForm />
        </div>

        <p className="text-center text-zinc-700 text-xs mt-8">
          Reachwell · AI-powered phone receptionists for local service businesses
        </p>
      </div>
    </main>
  );
}
