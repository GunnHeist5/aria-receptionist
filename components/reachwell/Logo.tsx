import type { CSSProperties } from 'react';

export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  const gid = `rw-g-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e7cd80" />
          <stop offset="0.5" stopColor="#c9a84c" />
          <stop offset="1" stopColor="#a8842c" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${gid})`} />
      <g fill="none" stroke="#0a0a0a" strokeWidth="2.6" strokeLinecap="round">
        <path d="M9 12.5V19.5" />
        <path d="M12.5 9.5V22.5" />
        <path d="M16 7.5V24.5" />
        <path d="M19.5 9.5V22.5" />
        <path d="M23 12.5V19.5" />
      </g>
    </svg>
  );
}

export function Logo({
  size = 32,
  className = '',
  wordClassName = 'text-[#f5f2ee] font-semibold tracking-tight text-lg',
  accent = false,
  style,
}: {
  size?: number;
  className?: string;
  wordClassName?: string;
  accent?: boolean;
  style?: CSSProperties;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`} style={style}>
      <LogoMark size={size} />
      <span className={wordClassName}>
        Reach{accent ? <span className="text-[#c9a84c]">well</span> : 'well'}
      </span>
    </span>
  );
}
