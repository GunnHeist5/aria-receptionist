'use client';

import { Reveal, stagger, fadeUp } from './primitives';
import { motion } from 'framer-motion';

const stats = [
  { value: '62%', label: 'of calls to small businesses go unanswered' },
  { value: '$1,200+', label: 'average value of a single missed service job' },
  { value: '24/7', label: 'Reachwell answers — nights, weekends, holidays' },
  { value: '<2 min', label: 'from sign-up to a live AI receptionist' },
];

export default function Stats() {
  return (
    <section className="border-y border-[#141414] bg-[#080808]">
      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-60px' }}
        className="max-w-7xl mx-auto px-5 sm:px-8 py-16 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-10"
      >
        {stats.map((s) => (
          <motion.div key={s.label} variants={fadeUp} className="text-center sm:text-left">
            <p className="text-4xl sm:text-5xl text-[#c9a84c] font-semibold tracking-tight">{s.value}</p>
            <p className="mt-2 text-sm text-[#9a9a9a] leading-snug max-w-[16rem] mx-auto sm:mx-0">{s.label}</p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
