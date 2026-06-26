import type { ReactNode } from 'react';

export type Block = string | { list: string[] };
export type LegalSection = { heading: string; body: Block[] };

function renderBlock(block: Block, i: number) {
  if (typeof block === 'string') {
    return (
      <p key={i} className="text-sm sm:text-[15px] text-[#9a9a9a] leading-relaxed">
        {block}
      </p>
    );
  }
  return (
    <ul key={i} className="space-y-2 pl-1">
      {block.list.map((item, j) => (
        <li key={j} className="flex gap-3 text-sm sm:text-[15px] text-[#9a9a9a] leading-relaxed">
          <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#c9a84c]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function LegalDoc({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  intro: ReactNode;
  sections: LegalSection[];
}) {
  return (
    <main className="relative min-h-screen bg-[#050505] text-[#f5f2ee]">
      <header className="border-b border-[#141414]">
        <div className="max-w-3xl mx-auto flex items-center justify-between px-5 sm:px-8 h-16">
          <a href="/" className="flex items-center gap-2.5">
            <span className="grid place-items-center w-8 h-8 rounded-lg bg-[#c9a84c] text-[#050505] text-sm font-bold">R</span>
            <span className="font-semibold tracking-tight text-lg">Reachwell</span>
          </a>
          <a href="/" className="text-sm text-[#9a9a9a] hover:text-[#f5f2ee] transition-colors">&larr; Back to site</a>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-5 sm:px-8 py-16">
        <h1 className="text-4xl sm:text-5xl leading-tight">{title}</h1>
        <p className="mt-4 text-xs uppercase tracking-widest text-[#6b6b6b]">Last updated: {updated}</p>
        <div className="mt-8 space-y-4 text-sm sm:text-[15px] text-[#9a9a9a] leading-relaxed">{intro}</div>

        <div className="mt-12 space-y-12">
          {sections.map((s, idx) => (
            <section key={s.heading}>
              <h2 className="text-xl sm:text-2xl text-[#f5f2ee] font-semibold">
                <span className="text-[#c9a84c] font-mono text-base mr-3">{String(idx + 1).padStart(2, '0')}</span>
                {s.heading}
              </h2>
              <div className="mt-4 space-y-3">{s.body.map(renderBlock)}</div>
            </section>
          ))}
        </div>

        <div className="mt-16 border-t border-[#141414] pt-8 flex flex-col sm:flex-row justify-between gap-4 text-xs text-[#555]">
          <span>&copy; 2026 Reachwell. All rights reserved.</span>
          <div className="flex gap-6">
            <a href="/privacy" className="hover:text-[#c9a84c] transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-[#c9a84c] transition-colors">Terms</a>
            <a href="mailto:sales@reachwellhq.com" className="hover:text-[#c9a84c] transition-colors">Contact</a>
          </div>
        </div>
      </article>
    </main>
  );
}
