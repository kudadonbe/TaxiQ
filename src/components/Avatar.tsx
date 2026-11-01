// Initials avatar, rendered locally so driver names are never sent to a third-party service.
const palette = ['bg-sky-600', 'bg-emerald-600', 'bg-violet-600', 'bg-rose-600', 'bg-amber-600', 'bg-teal-600']

export function Avatar({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
  const color = palette[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % palette.length]
  return (
    <div
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full font-semibold text-white ${color} ${
        size === 'lg' ? 'size-16 text-xl' : 'size-11 text-sm'
      }`}
    >
      {initials}
    </div>
  )
}
