'use client';

const cols = [
  {
    heading: 'Product',
    links: [
      { label: 'How it works', href: '#how-it-works' },
      { label: 'Features', href: '#features' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'FAQ', href: '#faq' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'Get started', href: '/intake' },
      { label: 'Book a demo', href: 'mailto:sales@reachwellhq.com' },
      { label: 'Become a rep', href: '/apply' },
      { label: 'Contact', href: 'mailto:sales@reachwellhq.com' },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-[#141414] bg-[#070707] px-5 sm:px-8 pt-16 pb-10">
      <div className="max-w-7xl mx-auto grid gap-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <a href="#top" className="flex items-center gap-2.5">
            <span className="grid place-items-center w-8 h-8 rounded-lg bg-[#c9a84c] text-[#050505] text-sm font-bold">R</span>
            <span className="text-[#f5f2ee] font-semibold text-lg">Reachwell</span>
          </a>
          <p className="mt-4 max-w-xs text-sm text-[#6b6b6b] leading-relaxed">
            The AI receptionist for local service businesses. Never miss another call.
          </p>
        </div>

        {cols.map((col) => (
          <div key={col.heading}>
            <p className="text-xs uppercase tracking-widest text-[#6b6b6b]">{col.heading}</p>
            <ul className="mt-4 space-y-3">
              {col.links.map((l) => (
                <li key={l.label}>
                  <a href={l.href} className="text-sm text-[#9a9a9a] hover:text-[#c9a84c] transition-colors">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="max-w-7xl mx-auto mt-14 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-[#141414] pt-8">
        <p className="text-xs text-[#555]">© 2026 Reachwell. All rights reserved.</p>
        <div className="flex gap-6 text-xs text-[#6b6b6b]">
          <a href="#" className="hover:text-[#c9a84c] transition-colors">Privacy</a>
          <a href="#" className="hover:text-[#c9a84c] transition-colors">Terms</a>
          <a href="mailto:sales@reachwellhq.com" className="hover:text-[#c9a84c] transition-colors">sales@reachwellhq.com</a>
        </div>
      </div>
    </footer>
  );
}
