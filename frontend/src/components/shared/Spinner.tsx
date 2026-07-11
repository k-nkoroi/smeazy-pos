export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8' }[size]
  return <div className={`${s} border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin`} />
}
