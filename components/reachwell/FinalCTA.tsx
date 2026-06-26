'use client';

import { CTAButton, Reveal } from './primitives';

export default function FinalCTA() {
  return (
    <section className="relative py-32 px-5 sm:px-8 overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[44rem] h-[44rem] rounded-full bg-[#c9a84c]/[0.08] blur-[130px]" />
      </div>

      <Reveal className="relative max-w-3xl mx-auto text-center">
        <h2 className="text-4xl sm:text-6xl text-[#f5f2ee] leading-[1.08]">
          Stop letting calls
          <br />
          go to <span className="text-[#c9a84c]">voicemail.</span>
        </h2>
        <p className="mt-6 text-[#9a9a9a] text-lg max-w-xl mx-auto">
          Every missed call is a customer who called someone else. Put Reachwell on
          the phones today.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <CTAButton href="/intake">Get started</CTAButton>
          <CTAButton href="mailto:sales@reachwellhq.com" variant="ghost">Book a demo</CTAButton>
        </div>
      </Reveal>
    </section>
  );
}
