'use client';

import { motion } from 'framer-motion';
import { Eyebrow, Reveal, stagger, fadeUp } from './primitives';

const industries = [
  'HVAC', 'Plumbing', 'Electrical', 'Roofing', 'Landscaping', 'Pest Control',
  'Garage Doors', 'Cleaning', 'Auto Repair', 'Locksmiths', 'Painters', 'Movers',
];

export default function Industries() {
  return (
    <section className="py-28 px-5 sm:px-8">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-[0.9fr_1.1fr] gap-14 items-center">
        <Reveal>
          <Eyebrow>Built for the trades</Eyebrow>
          <h2 className="text-4xl sm:text-5xl text-[#f5f2ee] leading-tight">
            Made for the businesses that live on the phone.
          </h2>
          <p className="mt-5 text-[#9a9a9a] leading-relaxed max-w-md">
            If a missed call means a lost customer, Reachwell pays for itself the
            first week. Tuned for local service companies of every kind.
          </p>
        </Reveal>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          className="flex flex-wrap gap-3"
        >
          {industries.map((name) => (
            <motion.span
              key={name}
              variants={fadeUp}
              whileHover={{ y: -3 }}
              className="rounded-full border border-[#1f1f1f] bg-[#0b0b0b] px-5 py-2.5 text-sm text-[#cfcfcf] hover:border-[#c9a84c]/60 hover:text-[#c9a84c] transition-colors"
            >
              {name}
            </motion.span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
