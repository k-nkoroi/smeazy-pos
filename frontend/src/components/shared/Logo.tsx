export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sz = { sm: 'text-lg', md: 'text-2xl', lg: 'text-4xl' }[size]
  return (
    <div className={`font-bold ${sz} flex items-center gap-2`}>
      <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white text-sm font-bold">S</div>
      <span className="text-brand-600">SME</span><span className="text-slate-800">azy</span>
    </div>
  )
}
