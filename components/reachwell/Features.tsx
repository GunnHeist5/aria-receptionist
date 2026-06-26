'use client';

import { motion } from 'framer-motion';
import { Eyebrow, Reveal, stagger, fadeUp } from './primitives';
import type { ReactNode } from 'react';

const features: { title: string; body: string; icon: ReactNode; wide?: boolean }[] = [
  {
    title: 'Answers every call, instantly',
    body: 'No rings to voicemail, no hold music. Reachwell picks up on the first ring, 24 hours a day, even when five calls come in at once.',
    icon: <PhoneIcon />,
    wide: true,
  },
  {
    title: 'Books jobs on the spot',
    body: 'Captures the customer’s name, address, and the problem — then schedules the appointment.',
    icon: <CalendarIcon />,
  },
  {
    title: 'Texts you the details',
    body: 'You get a clean summary by text the second a call ends. Nothing slips through.',
    icon: <ChatIcon />,
  },
  {
    title: 'Knows your business',
    body: 'Trained on your services, pricing, and hours — so it answers like a seasoned front-desk pro.',
    icon: <BrainIcon />,
  },
  {
    title: 'Transfers when it matters',
    body: 'Urgent or high-value calls get routed straight to you, with the context already gathered.',
    icon: <RouteIcon />,
    wide: true,
  },
];

export default function Features() {
  return (
    <section id="features" className="py-28 px-5 sm:px-8 bg-[#080808] border-y border-[#141414]">
      <div className="max-w-7xl mx-auto">
        <Reveal className="max-w-2xl">
          <Eyebrow>What it does</Eyebrow>
          <h2 className="text-4xl sm:text-5xl text-[#f5f2ee] leading-tight">
            A full-time receptionist that never sleeps.
          </h2>
        </Reveal>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {features.map((f) => (
            <motion.div
              key={f.title}
              variants={fadeUp}
              className={`rounded-2xl border border-[#1a1a1a] bg-[#0b0b0b] p-7 transition-colors hover:border-[#2e2818] ${
                f.wide ? 'lg:col-span-2' : ''
              }`}
            >
              <span className="grid place-items-center w-11 h-11 rounded-xl bg-[#c9a84c]/12 text-[#c9a84c]">
                {f.icon}
              </span>
              <h3 className="mt-5 text-lg font-semibold text-[#f5f2ee]">{f.title}</h3>
              <p className="mt-2.5 text-sm text-[#9a9a9a] leading-relaxed">{f.body}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

const ic = 'w-5 h-5';
function PhoneIcon() {
  return <svg viewBox="0 0 24 24" className={ic} fill="currentColor"><path d="M6.6 10.8a15 15 0 006.6 6.6l2.2-2.2a1 1 0 011-.24 11.4 11.4 0 003.6.58 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.4 11.4 0 00.58 3.6 1 1 0 01-.24 1z" /></svg>;
}
function CalendarIcon() {
  return <svg viewBox="0 0 24 24" className={ic} fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v3M16 3v3" strokeLinecap="round" /></svg>;
}
function ChatIcon() {
  return <svg viewBox="0 0 24 24" className={ic} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 5h16v11H8l-4 3z" strokeLinejoin="round" /></svg>;
}
function BrainIcon() {
  return <svg viewBox="0 0 24 24" className={ic} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 4a3 3 0 00-3 3v.5A3 3 0 007 13a3 3 0 003 3v1M12 4a3 3 0 013 3v.5A3 3 0 0117 13a3 3 0 01-3 3v1" strokeLinecap="round" /></svg>;
}
function RouteIcon() {
  return <svg viewBox="0 0 24 24" className={ic} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 19V8a3 3 0 013-3h6m0 0l-2.5-2.5M14 5l-2.5 2.5" strokeLinecap="round" strokeLinejoin="round" /><circle cx="5" cy="19" r="1.6" fill="currentColor" stroke="none" /></svg>;
}
