// The Blue Balance mark: one drop split down the middle. The filled half is water that arrived,
// the outlined half is water that went missing; the name is about bringing the two into balance.

export default function Logo({ className = 'size-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} role="img" aria-label="Blue Balance">
      <rect width="40" height="40" rx="11" className="fill-ink" />
      <path d="M20 7 C14 15 10.5 20.5 10.5 25 A9.5 9.5 0 0 0 20 34.5 Z" className="fill-water" />
      <path d="M20 7 C26 15 29.5 20.5 29.5 25 A9.5 9.5 0 0 1 20 34.5" fill="none" strokeWidth="2.2" strokeLinejoin="round" className="stroke-water-300" />
      <path d="M20 5.5 V36" strokeWidth="1.6" className="stroke-white/80" />
    </svg>
  )
}
