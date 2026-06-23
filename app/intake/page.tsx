import { Metadata } from 'next';
import IntakeForm from '@/components/intake/IntakeForm';

export const metadata: Metadata = {
  title: 'Get Started — Reachwell',
  robots: 'noindex',
};

export default function IntakePage({ searchParams }: { searchParams: { ref?: string } }) {
  const refSlug = searchParams.ref?.trim() || null;
  return (
    <main className="min-h-screen bg-[#050505] px-4 py-12 sm:px-8">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="mb-12">
          <p className="text-[#c9a84c] text-xs font-mono uppercase tracking-widest mb-3">
            Reachwell
          </p>
          <h1 className="text-3xl sm:text-4xl text-[#f5f2ee] mb-3">
            Get Your AI Receptionist
          </h1>
          <p className="text-sm text-[#555] leading-relaxed">
            Fill out the form below and your AI receptionist will be configured
            and live within a few minutes. We&apos;ll text you once it&apos;s ready.
          </p>
          <div className="h-px bg-[#1a1a1a] mt-8" />
        </div>

        <IntakeForm refSlug={refSlug} />

        <p className="text-xs text-[#333] mt-8 text-center">
          Reachwell — Questions? Reply to your sales rep.
        </p>
      </div>
    </main>
  );
}
