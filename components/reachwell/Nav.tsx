'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CTAButton } from './primitives';

const links = [
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={`fixed top-0 inset-x-0 z-50 transition-colors duration-300 ${
        scrolled ? 'bg-[#050505]/85 backdrop-blur-md border-b border-[#161616]' : 'bg-transparent'
      }`}
    >
      <nav className="max-w-7xl mx-auto flex items-center justify-between px-5 sm:px-8 h-16">
        <a href="#top" className="flex items-center gap-2.5 group">
          <span className="grid place-items-center w-8 h-8 rounded-lg bg-[#c9a84c] text-[#050505] text-sm font-bold">R</span>
          <span className="text-[#f5f2ee] font-semibold tracking-tight text-lg">Reachwell</span>
        </a>

        <div className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm text-[#9a9a9a] hover:text-[#f5f2ee] transition-colors"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <a href="mailto:sales@reachwellhq.com" className="text-sm text-[#9a9a9a] hover:text-[#f5f2ee] transition-colors px-3">
            Book a demo
          </a>
          <CTAButton href="/intake" className="px-5">Get started</CTAButton>
        </div>

        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={open}
          className="md:hidden grid place-items-center w-11 h-11 -mr-2 text-[#f5f2ee]"
        >
          <div className="space-y-1.5">
            <span className={`block h-0.5 w-6 bg-current transition-transform ${open ? 'translate-y-2 rotate-45' : ''}`} />
            <span className={`block h-0.5 w-6 bg-current transition-opacity ${open ? 'opacity-0' : ''}`} />
            <span className={`block h-0.5 w-6 bg-current transition-transform ${open ? '-translate-y-2 -rotate-45' : ''}`} />
          </div>
        </button>
      </nav>

      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="md:hidden border-t border-[#161616] bg-[#050505]/95 backdrop-blur-md px-5 py-5 space-y-1"
        >
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block py-3 text-[#9a9a9a] hover:text-[#f5f2ee] transition-colors"
            >
              {l.label}
            </a>
          ))}
          <div className="flex flex-col gap-3 pt-3">
            <CTAButton href="/intake">Get started</CTAButton>
            <CTAButton href="mailto:sales@reachwellhq.com" variant="ghost">Book a demo</CTAButton>
          </div>
        </motion.div>
      )}
    </motion.header>
  );
}
