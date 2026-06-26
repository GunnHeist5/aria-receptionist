'use client';

import { motion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';

// Shared motion variants — gentle, professional easing (150–800ms range)
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
};

export const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

// Reveal-on-scroll wrapper
export function Reveal({
  children,
  className,
  variants = fadeUp,
}: {
  children: ReactNode;
  className?: string;
  variants?: Variants;
}) {
  return (
    <motion.div
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-80px' }}
    >
      {children}
    </motion.div>
  );
}

// Small uppercase mono label that precedes section headings
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[#c9a84c] text-xs font-medium uppercase tracking-[0.25em] mb-4">
      {children}
    </p>
  );
}

type CTAProps = {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'ghost';
  className?: string;
};

// Primary = gold fill, ghost = gold outline. min touch target 48px.
export function CTAButton({ href, children, variant = 'primary', className = '' }: CTAProps) {
  const base =
    'inline-flex items-center justify-center gap-2 px-7 min-h-[48px] rounded-full text-sm font-semibold tracking-wide transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c] focus-visible:ring-offset-2 focus-visible:ring-offset-[#050505]';
  const styles =
    variant === 'primary'
      ? 'bg-[#c9a84c] text-[#050505] hover:bg-[#d8bb63] hover:shadow-[0_0_28px_-4px_rgba(201,168,76,0.5)]'
      : 'border border-[#3a3526] text-[#f5f2ee] hover:border-[#c9a84c] hover:text-[#c9a84c]';
  return (
    <motion.a
      href={href}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      className={`${base} ${styles} ${className}`}
    >
      {children}
    </motion.a>
  );
}
