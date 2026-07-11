import { Sidebar } from './Sidebar'
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar />
      <main className="ml-56 min-h-screen">
        <div className="p-6 max-w-screen-xl">{children}</div>
      </main>
    </div>
  )
}
