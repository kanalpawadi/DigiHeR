import type { Verdict } from '../lib/types'

const META: Record<Verdict, { label: string; icon: string }> = {
  accepted: { label: 'Accepted', icon: 'M3 8.5 L6.5 12 L13 4.5' },
  review: { label: 'Needs review', icon: 'M8 3.5 V9 M8 11.5 V12.5' },
  rejected: { label: 'Rejected', icon: 'M4 4 L12 12 M12 4 L4 12' },
}

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const m = META[verdict]
  return (
    <span className={`badge ${verdict}`}>
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <path d={m.icon} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {m.label}
    </span>
  )
}
