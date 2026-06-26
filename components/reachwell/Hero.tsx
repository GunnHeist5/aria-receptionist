'use client';

import { motion } from 'framer-motion';
import { CTAButton, Reveal, fadeUp, stagger } from './primitives';

export default function Hero() {
  return (
    <section id="top" className="relative min-h-screen flex items-center overflow-hidden pt-28 pb-20">
      {/* Ambient gold glow */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[60rem] h-[60rem] rounded-full bg-[#c9a84c]/[0.07] blur-[140px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(201,168,76,0.06),transparent_60%)]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-5 sm:px-8 grid lg:grid-cols-[1.1fr_0.9fr] gap-16 items-center w-full">
        {/* Copy */}
        <motion.div variants={stagger} initial="hidden" animate="visible">
          <motion.div variants={fadeUp}>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#2a2519] bg-[#0c0b08] px-3.5 py-1.5 text-xs text-[#c9a84c]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#c9a84c] opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#c9a84c]" />
              </span>
              Answering calls 24/7
            </span>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            className="mt-6 text-5xl sm:text-6xl lg:text-7xl leading-[1.04] text-[#f5f2ee]"
          >
            Never miss
            <br />
            another <span className="text-[#c9a84c]">call.</span>
          </motion.h1>

          <motion.p variants={fadeUp} className="mt-6 max-w-md text-base sm:text-lg text-[#9a9a9a] leading-relaxed">
            Reachwell is the AI receptionist for local service businesses. It answers
            every call, books the job, and texts you the details — day or night.
          </motion.p>

          <motion.div variants={fadeUp} className="mt-9 flex flex-wrap gap-4">
            <CTAButton href="/intake">Get started</CTAButton>
            <CTAButton href="mailto:sales@reachwellhq.com" variant="ghost">Book a demo</CTAButton>
          </motion.div>

          <motion.div variants={fadeUp} className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[#6b6b6b]">
            <span className="flex items-center gap-2"><Check /> Live in minutes</span>
            <span className="flex items-center gap-2"><Check /> No app to install</span>
            <span className="flex items-center gap-2"><Check /> Keeps your number</span>
          </motion.div>
        </motion.div>

        {/* Call card visual */}
        <Reveal variants={fadeUp} className="hidden lg:block">
          <CallCard />
        </Reveal>
      </div>
    </section>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-[#c9a84c]" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 8.5l3.5 3.5L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CallCard() {
  const lines = [
    { who: 'caller', text: 'Hi, my AC stopped working this morning.' },
    { who: 'aria', text: 'I’m sorry to hear that — I can get a tech out today. What’s the address?' },
    { who: 'caller', text: '412 Oak Street.' },
    { who: 'aria', text: 'Booked for 2pm. You’ll get a text confirmation now. 👍' },
  ];
  return (
    <div className="relative mx-auto max-w-sm rounded-3xl border border-[#1b1b1b] bg-gradient-to-b from-[#0c0c0c] to-[#070707] p-5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]">
      <div className="flex items-center justify-between border-b border-[#161616] pb-4">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-10 h-10 rounded-full bg-[#c9a84c]/15 text-[#c9a84c]">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M6.6 10.8a15 15 0 006.6 6.6l2.2-2.2a1 1 0 011-.24 11.4 11.4 0 003.6.58 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.4 11.4 0 00.58 3.6 1 1 0 01-.24 1z" /></svg>
          </span>
          <div>
            <p className="text-sm font-semibold text-[#f5f2ee]">Incoming call</p>
            <p className="text-xs text-[#6b6b6b]">Reachwell AI · answering</p>
          </div>
        </div>
        <span className="font-mono text-xs text-[#c9a84c]">00:18</span>
      </div>

      <div className="space-y-3 py-5">
        {lines.map((l, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 + i * 0.5, duration: 0.4 }}
            className={`flex ${l.who === 'aria' ? 'justify-end' : 'justify-start'}`}
          >
            <p
              className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-snug ${
                l.who === 'aria'
                  ? 'bg-[#c9a84c] text-[#050505] rounded-br-sm'
                  : 'bg-[#161616] text-[#d8d8d8] rounded-bl-sm'
              }`}
            >
              {l.text}
            </p>
          </motion.div>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-2xl bg-[#0f0e0b] border border-[#1f1c14] px-4 py-3">
        <div>
          <p className="text-xs text-[#6b6b6b]">Job booked</p>
          <p className="text-sm font-semibold text-[#f5f2ee]">AC repair · 2:00 PM</p>
        </div>
        <span className="text-xs font-medium text-[#c9a84c]">Texted to you ✓</span>
      </div>
    </div>
  );
}
