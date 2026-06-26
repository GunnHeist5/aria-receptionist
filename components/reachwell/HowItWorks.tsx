'use client';

import { motion } from 'framer-motion';
import { Eyebrow, Reveal, stagger, fadeUp } from './primitives';

const steps = [
  {
    n: '01',
    title: 'Tell us about your business',
    body: 'Answer a few questions — your hours, services, and how you want calls handled. Takes about two minutes.',
  },
  {
    n: '02',
    title: 'We build your receptionist',
    body: 'Reachwell configures an AI trained on your business and gives you a number — or forwards your existing one.',
  },
  {
    n: '03',
    title: 'It answers, you get the jobs',
    body: 'Every call is answered, qualified, and booked. You get a text with the details the moment a call wraps.',
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-28 px-5 sm:px-8">
      <div className="max-w-7xl mx-auto">
        <Reveal className="max-w-2xl">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="text-4xl sm:text-5xl text-[#f5f2ee] leading-tight">
            Live in minutes, not weeks.
          </h2>
          <p className="mt-5 text-[#9a9a9a] leading-relaxed">
            No hardware, no contracts, no IT project. Reachwell sets itself up and
            starts answering the same day.
          </p>
        </Reveal>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          className="mt-16 grid md:grid-cols-3 gap-6"
        >
          {steps.map((s) => (
            <motion.div
              key={s.n}
              variants={fadeUp}
              className="group relative rounded-2xl border border-[#1a1a1a] bg-[#0a0a0a] p-8 transition-colors hover:border-[#2e2818]"
            >
              <span className="font-mono text-sm text-[#c9a84c]/70">{s.n}</span>
              <h3 className="mt-4 text-xl font-semibold text-[#f5f2ee]">{s.title}</h3>
              <p className="mt-3 text-sm text-[#9a9a9a] leading-relaxed">{s.body}</p>
              <div className="mt-6 h-px w-full bg-gradient-to-r from-[#c9a84c]/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
