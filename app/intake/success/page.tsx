'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useState, Suspense } from 'react';

function SuccessContent() {
  const searchParams = useSearchParams();
  const clientName  = searchParams.get('name') ? decodeURIComponent(searchParams.get('name')!) : 'Client';
  const checkoutUrl = searchParams.get('checkoutUrl');
  const [copied, setCopied]   = useState(false);

  async function copyLink() {
    if (!checkoutUrl) return;
    await navigator.clipboard.writeText(checkoutUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main className="min-h-screen bg-[#050505] flex items-center justify-center px-4">
      <div className="max-w-lg w-full text-center">

        <div className="w-12 h-12 border border-[#c9a84c] flex items-center justify-center mx-auto mb-8">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M4 10l4.5 4.5L16 6" stroke="#c9a84c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <p className="text-[#c9a84c] text-xs font-mono uppercase tracking-widest mb-4">
          Successfully Submitted
        </p>

        <h1 className="text-3xl text-[#f5f2ee] mb-4">
          {clientName}
        </h1>

        {checkoutUrl ? (
          <>
            <p className="text-sm text-[#9a9a9a] leading-relaxed mb-6">
              Send the payment link below to the client. Once they pay, provisioning
              starts automatically — the AI receptionist will be live within minutes.
            </p>

            <div className="border border-[#1a1a1a] bg-[#0a0a0a] p-4 mb-3 text-left">
              <p className="text-xs text-[#555] uppercase tracking-widest mb-2 font-mono">Payment link</p>
              <p className="text-xs text-[#f5f2ee] break-all leading-relaxed font-mono">{checkoutUrl}</p>
            </div>

            <button
              onClick={copyLink}
              className="w-full bg-[#c9a84c] text-[#050505] py-3 text-sm font-medium uppercase tracking-widest hover:opacity-90 transition-opacity mb-6">
              {copied ? 'Copied!' : 'Copy Payment Link'}
            </button>

            <p className="text-xs text-[#555] leading-relaxed mb-2">
              $500 setup + $297/month — card details captured by Stripe, you never see them.
            </p>
          </>
        ) : (
          <p className="text-sm text-[#555] leading-relaxed mb-8">
            The AI receptionist is being configured. A dedicated phone number
            will be provisioned and the system will be live shortly.
            <br /><br />
            You will receive an SMS confirmation once the number is assigned.
          </p>
        )}

        <div className="h-px bg-[#1a1a1a] mb-8" />

        <Link href="/intake"
          className="text-xs text-[#9a9a9a] uppercase tracking-widest hover:text-[#c9a84c] transition-colors">
          ← Onboard another client
        </Link>
      </div>
    </main>
  );
}

export default function SuccessPage() {
  return (
    <Suspense>
      <SuccessContent />
    </Suspense>
  );
}
