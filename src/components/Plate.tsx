// Maldivian taxi registration plate.
export function Plate({ reg, size = 'md' }: { reg: string; size?: 'md' | 'lg' }) {
  const lg = size === 'lg'
  return (
    <div
      className={`inline-flex flex-col items-center rounded-md border-2 border-slate-900 bg-yellow-300 font-mono leading-none text-slate-900 shadow-sm ${
        lg ? 'px-4 py-2' : 'px-2 py-1'
      }`}
    >
      <span className={`tracking-widest opacity-70 ${lg ? 'text-xs' : 'text-[9px]'}`}>A A0 H</span>
      <span className={`font-bold tracking-wider ${lg ? 'text-3xl' : 'text-base'}`}>{reg}</span>
    </div>
  )
}
