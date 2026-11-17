import { lookColours, type FigureLook } from '../core/figures'

// A small front view of a 3D map look (the picker in Show me on the map). Static shapes from our own
// constants (the same colours as src/figures3d/models.ts); no user data goes in.
const SKIN = '#a86f4c'
const HAIR = '#1c1917'
const DARK = '#0f172a'

export function LookPreview({ look, colour, size = 40 }: { look: FigureLook; colour: number; size?: number }) {
  const [main, second] = lookColours(colour)
  const child = look === 'child'
  const young = look === 'young' || child // the same T-shirt and shorts; a child has hair, not a cap
  const s = child ? 0.7 : young ? 0.85 : 1
  const hijab = look === 'woman-hijab' || look === 'woman-libaas' || look === 'woman-sport'
  const scarf = look === 'woman-sport' ? DARK : look === 'woman-hijab' && second === '#1e293b' ? '#334155' : second
  const shirt = look === 'man-formal' ? (main === '#f8fafc' ? '#dbeafe' : '#f8fafc') : main
  const arms = look === 'man-tshirt' || young ? SKIN : shirt
  const legs = look === 'man-formal' || look === 'woman-sport' ? (look === 'woman-sport' ? DARK : '#1f2937') : young ? SKIN : second
  return (
    <svg viewBox="0 0 24 40" width={size * 0.6} height={size} aria-hidden="true">
      <g transform={`translate(12 40) scale(${s}) translate(-12 -40)`}>
        {/* legs */}
        <rect x="8.4" y="23" width="3" height="15" rx="1" fill={legs} />
        <rect x="12.6" y="23" width="3" height="15" rx="1" fill={legs} />
        <rect x="8" y="37" width="3.6" height="2" rx="1" fill="#3f3f46" />
        <rect x="12.4" y="37" width="3.6" height="2" rx="1" fill="#3f3f46" />
        {/* arms */}
        <rect x="4.6" y="11.5" width="2.4" height="11" rx="1.2" fill={arms} />
        <rect x="17" y="11.5" width="2.4" height="11" rx="1.2" fill={arms} />
        {/* body */}
        {look === 'woman-libaas' ? (
          <path d="M8 11 L16 11 L18.5 38 L5.5 38 Z" fill={main} />
        ) : look === 'woman-hijab' ? (
          <path d="M7.5 11 L16.5 11 L17 29 L7 29 Z" fill={main} />
        ) : (
          <rect x="7" y="11" width="10" height="13" rx="2" fill={shirt} />
        )}
        {(look === 'man-tshirt' || young) && (
          <>
            <rect x="4.4" y="11" width="3" height="4" rx="1" fill={main} />
            <rect x="16.6" y="11" width="3" height="4" rx="1" fill={main} />
          </>
        )}
        {young && <rect x="7" y="22" width="10" height="4.5" rx="1" fill={second} />}
        {look === 'man-formal' && <path d="M11.3 11.5 L12.7 11.5 L13.2 20 L12 21.5 L10.8 20 Z" fill={main} />}
        {look === 'man-casual' && <path d="M9.5 11 L12 13 L14.5 11 Z" fill="#f8fafc" />}
        {look === 'woman-sport' && <rect x="7" y="19" width="10" height="1.2" fill="#f8fafc" />}
        {/* head */}
        {hijab ? (
          <>
            {look !== 'woman-sport' && <path d="M6.5 13 Q12 6 17.5 13 L17 15 L7 15 Z" fill={scarf} />}
            <circle cx="12" cy="6.4" r="4.4" fill={scarf} />
            <ellipse cx="12" cy="6.8" rx="2.5" ry="3" fill={SKIN} />
          </>
        ) : (
          <>
            <rect x="11" y="9" width="2" height="2.5" fill={SKIN} />
            <circle cx="12" cy="6.5" r="3.6" fill={SKIN} />
            {young && !child ? <path d="M8.3 6 A3.8 3.8 0 0 1 15.7 6 L17.5 6.6 L8.3 6.6 Z" fill={second} /> : <path d="M8.3 6 A3.8 3.8 0 0 1 15.7 6 Z" fill={HAIR} />}
          </>
        )}
      </g>
    </svg>
  )
}
