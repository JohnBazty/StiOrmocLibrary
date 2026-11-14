import { AlertCircle, Info } from 'lucide-react'

export function AuthMessage({ children, error = true }: { children: React.ReactNode; error?: boolean }) {
  const Icon = error ? AlertCircle : Info
  return <div role={error ? 'alert' : 'status'} data-tone={error ? 'error' : 'info'}
    className={`mt-5 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm font-semibold ${error ? 'border-[#b42318] bg-[#b42318] text-white' : 'border-[#0b5ea2]/20 bg-[#FFF200] text-[#0b5ea2]'}`}>
    <Icon aria-hidden="true" size={20} className="mt-0.5 shrink-0" /><div>{children}</div>
  </div>
}
