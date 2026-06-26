'use client';

import { Eyebrow, Reveal, CTAButton } from './primitives';

const included = [
  'Unlimited answered calls, 24/7',
  'Job booking & lead capture',
  'Instant text summaries after every call',
  'Trained on your services & hours',
  'Smart call transfers to your team',
  'Keep your existing phone number',
];

export default function Pricing() {
  return (
    <section id="pricing" className="py-28 px-5 sm:px-8 bg-[#080808] border-y border-[#141414]">
      <div className="max-w-3xl mx-auto text-center">
        <Reveal>
          <Eyebrow>Pricing</Eyebrow>
          <h2 className="text-4xl sm:text-5xl text-[#f5f2ee] leading-tight">
            One flat rate. Every call covered.
          </h2>
          <p className="mt-5 text-[#9a9a9a]">
            No per-minute fees, no setup cost, no contract. Cancel anytime.
          </p>
        </Reveal>
      </div>

      <Reveal className="mt-14 max-w-md mx-auto">
        <div className="relative rounded-3xl border border-[#2c2718] bg-gradient-to-b from-[#0f0e0a] to-[#080808] p-8 shadow-[0_30px_80px_-40px_rgba(201,168,76,0.25)]">
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#c9a84c] px-3 py-1 text-xs font-semibold text-[#050505]">
            Most popular
          </span>

          <p className="text-sm font-medium uppercase tracking-widest text-[#c9a84c]">Reachwell Pro</p>
          <div className="mt-4 flex items-end justify-center gap-1">
            <span className="text-6xl font-semibold text-[#f5f2ee]">$297</span>
            <span className="mb-2 text-[#9a9a9a]">/mo</span>
          </div>
          <p className="mt-2 text-sm text-[#6b6b6b]">Everything you need to stop losing calls.</p>

          <ul className="mt-8 space-y-3 text-left">
            {included.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-[#d4d4d4]">
                <svg viewBox="0 0 16 16" className="mt-0.5 w-4 h-4 flex-shrink-0 text-[#c9a84c]" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 8.5l3.5 3.5L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {item}
              </li>
            ))}
          </ul>

          <CTAButton href="/intake" className="mt-9 w-full">Get started</CTAButton>
          <a href="mailto:sales@reachwellhq.com" className="mt-4 block text-center text-sm text-[#9a9a9a] hover:text-[#f5f2ee] transition-colors">
            or book a demo first →
          </a>
        </div>
      </Reveal>
    </section>
  );
}
