import { Metadata } from 'next';
import IntakeForm from '@/components/intake/IntakeForm';

export const metadata: Metadata = {
  title: 'Client Onboarding — ARIA Capital',
  robots: 'noindex',
};

export default function IntakePage() {
  return (
    <main className="min-h-screen bg-[#050505] px-4 py-12 sm:px-8">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="mb-12">
          <p className="text-[#c9a84c] text-xs font-mono uppercase tracking-widest mb-3">
            ARIA Capital — Internal
          </p>
          <h1 className="text-3xl sm:text-4xl text-[#f5f2ee] mb-3">
            Client Onboarding
          </h1>
          <p className="text-sm text-[#555] leading-relaxed">
            Fill out the form below after closing a sale. The AI receptionist
            will be configured and live within a few minutes.
          </p>
          <div className="h-px bg-[#1a1a1a] mt-8" />
        </div>

        <IntakeForm />

        <p className="text-xs text-[#333] mt-8 text-center">
          ARIA Capital LLC — Internal tool. Do not share this URL.
        </p>
      </div>
    </main>
  );
}
