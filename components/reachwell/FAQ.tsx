'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Eyebrow, Reveal } from './primitives';

const faqs = [
  {
    q: 'Does it sound like a robot?',
    a: 'No. Reachwell uses a natural, conversational voice and is trained on your business, so callers get a warm, professional experience — most don’t realize it’s AI.',
  },
  {
    q: 'Can I keep my current phone number?',
    a: 'Yes. You can forward your existing number to Reachwell or use a new one we provision for you. Your number, your choice.',
  },
  {
    q: 'What happens on complex or urgent calls?',
    a: 'Reachwell gathers the key details and transfers the caller to you (or the right person) when a call needs a human — so nothing important is missed.',
  },
  {
    q: 'How long does setup take?',
    a: 'Most businesses are live within a couple of minutes of finishing the sign-up form. There’s no hardware and nothing to install.',
  },
  {
    q: 'Is there a contract?',
    a: 'No contracts. It’s a flat $297/mo and you can cancel anytime.',
  },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="py-28 px-5 sm:px-8">
      <div className="max-w-3xl mx-auto">
        <Reveal className="text-center mb-12">
          <Eyebrow>FAQ</Eyebrow>
          <h2 className="text-4xl sm:text-5xl text-[#f5f2ee] leading-tight">Questions, answered.</h2>
        </Reveal>

        <div className="divide-y divide-[#161616] border-y border-[#161616]">
          {faqs.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={f.q}>
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 py-5 text-left min-h-[56px]"
                >
                  <span className="text-base sm:text-lg text-[#f5f2ee] font-medium">{f.q}</span>
                  <span className={`flex-shrink-0 text-[#c9a84c] transition-transform duration-300 ${isOpen ? 'rotate-45' : ''}`}>
                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="pb-6 pr-10 text-sm sm:text-base text-[#9a9a9a] leading-relaxed">{f.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
