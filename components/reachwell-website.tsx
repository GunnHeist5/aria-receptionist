'use client';

import Nav from '@/components/reachwell/Nav';
import Hero from '@/components/reachwell/Hero';
import Stats from '@/components/reachwell/Stats';
import HowItWorks from '@/components/reachwell/HowItWorks';
import Features from '@/components/reachwell/Features';
import Industries from '@/components/reachwell/Industries';
import Pricing from '@/components/reachwell/Pricing';
import FAQ from '@/components/reachwell/FAQ';
import FinalCTA from '@/components/reachwell/FinalCTA';
import Footer from '@/components/reachwell/Footer';

export default function ReachwellWebsite() {
  return (
    <main className="relative bg-[#050505] text-[#f5f2ee]">
      <Nav />
      <Hero />
      <Stats />
      <HowItWorks />
      <Features />
      <Industries />
      <Pricing />
      <FAQ />
      <FinalCTA />
      <Footer />
    </main>
  );
}
