// Gedeelde sport-icoon component en kleurmap — gebruikt in Training én Dashboard

export const SPORT_KLEUR = {
  fitness:    { kleur: '#16a34a', bg: '#f0fdf4' },
  hardlopen:  { kleur: '#2563eb', bg: '#eff6ff' },
  fietsen:    { kleur: '#d97706', bg: '#fefce8' },
  wielrennen: { kleur: '#ea580c', bg: '#fff7ed' },
  zwemmen:    { kleur: '#0891b2', bg: '#ecfeff' },
  padel:      { kleur: '#7c3aed', bg: '#f5f3ff' },
  tennis:     { kleur: '#9333ea', bg: '#fdf4ff' },
  wandelen:   { kleur: '#059669', bg: '#ecfdf5' },
  yoga:       { kleur: '#db2777', bg: '#fdf2f8' },
  voetbal:    { kleur: '#1d4ed8', bg: '#eff6ff' },
  overig:     { kleur: '#6b7280', bg: '#f9fafb' },
  herstel:    { kleur: '#9ca3af', bg: '#f9fafb' },
}

export const SPORT_LABEL = {
  fitness: 'Fitness', hardlopen: 'Hardlopen', fietsen: 'Fietsen',
  wielrennen: 'Wielrennen', zwemmen: 'Zwemmen', padel: 'Padel',
  tennis: 'Tennis', wandelen: 'Wandelen', yoga: 'Yoga',
  voetbal: 'Voetbal', overig: 'Overig', herstel: 'Herstel',
}

// Corrigeert duur_min die per abuis in seconden is opgeslagen (Strava sync bug).
// Heuristiek: als waarde > 720 (>12 uur) én na /60 realistisch is (<= 720 min),
// dan behandelen we het als seconden.
export function normMin(d) {
  if (!d) return 0
  const v = parseInt(d)
  return (v > 720 && Math.round(v / 60) <= 720) ? Math.round(v / 60) : v
}

export default function SportIcoon({ sport, size = 24 }) {
  const p = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: '1.75', strokeLinecap: 'round',
    strokeLinejoin: 'round', style: { display: 'block', flexShrink: 0 },
  }
  switch (sport) {
    case 'fitness':
      return <svg {...p}><line x1="6" y1="5" x2="6" y2="19"/><line x1="18" y1="5" x2="18" y2="19"/><line x1="3" y1="9" x2="3" y2="15"/><line x1="21" y1="9" x2="21" y2="15"/><line x1="6" y1="12" x2="18" y2="12"/></svg>
    case 'hardlopen':
      return <svg {...p}><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg>
    case 'fietsen':
    case 'wielrennen':
      return <svg {...p}><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>
    case 'zwemmen':
      return <svg {...p}>
        <path d="M2 7c1.3 0 1.3-2 2.7-2s1.3 2 2.7 2 1.3-2 2.7-2 1.3 2 2.7 2 1.3-2 2.7-2 1.3 2 2.7 2"/>
        <path d="M2 12c1.3 0 1.3-2 2.7-2s1.3 2 2.7 2 1.3-2 2.7-2 1.3 2 2.7 2 1.3-2 2.7-2 1.3 2 2.7 2"/>
        <path d="M2 17c1.3 0 1.3-2 2.7-2s1.3 2 2.7 2 1.3-2 2.7-2 1.3 2 2.7 2 1.3-2 2.7-2 1.3 2 2.7 2"/>
      </svg>
    case 'padel':
    case 'tennis':
      return <svg {...p}><circle cx="11" cy="9" r="6"/><line x1="11" y1="3" x2="11" y2="15"/><line x1="5" y1="9" x2="17" y2="9"/><line x1="16" y1="14" x2="19.5" y2="19"/></svg>
    case 'wandelen':
      return <svg {...p}><circle cx="12" cy="4" r="2"/><path d="M12 6l-3 5 1 9M12 6l3 5-1 9M9 11h6"/></svg>
    case 'yoga':
      return <svg {...p}><circle cx="12" cy="4" r="2"/><path d="M12 6v5"/><path d="M6 11c0 0 2-2 6-2s6 2 6 2"/><path d="M6 11l-2 7M18 11l2 7"/><line x1="8" y1="20" x2="16" y2="20"/></svg>
    case 'voetbal':
      return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M12 3l2 6h5l-4 4 2 6-5-4-5 4 2-6-4-4h5z"/></svg>
    case 'herstel':
      return <svg {...p}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
    default: // overig + onbekend
      return <svg {...p}><polygon points="13,2 3,14 12,14 11,22 21,10 12,10"/></svg>
  }
}
