import { Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { type KeyboardEvent, type Ref, useState } from 'react'

export const RATE_LIMIT_MESSAGE = 'Too many login attempts. Please wait 15 minutes and try again.'

export function AuthStatusBanner({ children }: { children: string }) {
  return <div role="status" className="mt-6 rounded-xl border border-[#003399]/30 bg-[#003399]/5 px-4 py-3 text-sm font-semibold text-[#003399]">{children}</div>
}

export function AuthAlertBanner({ children }: { children: string }) {
  return <div role="alert" className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{children}</div>
}

export function FieldError({ id, children }: { id: string; children?: string }) {
  if (!children) return null
  return <span id={id} className="mt-2 block text-xs font-bold text-rose-700">{children}</span>
}

export function PasswordField({
  id, label, value, onChange, error, inputRef, placeholder, forgotHint = 'librarian', autoComplete = 'current-password',
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  inputRef?: Ref<HTMLInputElement>
  placeholder: string
  forgotHint?: 'librarian' | 'none'
  autoComplete?: string
}) {
  const errorId = `${id}-error`
  const capsId = `${id}-caps`
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const describedBy = [error ? errorId : '', capsLock ? capsId : ''].filter(Boolean).join(' ') || undefined

  function trackCapsLock(event: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(event.getModifierState('CapsLock'))
  }

  return (
    <div>
      <label className="block" htmlFor={id}>
        <span className="text-sm font-bold text-[#003399]">{label}</span>
        <span className="relative mt-2 block">
          <LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 text-[#003399]/50" size={18} />
          <input
            ref={inputRef}
            id={id}
            type={showPassword ? 'text' : 'password'}
            autoComplete={autoComplete}
            value={value}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={trackCapsLock}
            onKeyUp={trackCapsLock}
            onBlur={() => setCapsLock(false)}
            placeholder={placeholder}
            className="h-13 w-full rounded-xl border border-[#003399]/20 bg-[#FFFFFF] pl-12 pr-12 text-sm text-[#003399] outline-none transition placeholder:text-[#003399]/40 focus:border-[#003399] focus:ring-4 focus:ring-[#003399]/10"
          />
          <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((current) => !current)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-[#003399]/60 hover:bg-[#003399]/5">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
        </span>
      </label>
      {capsLock ? <span id={capsId} className="mt-2 block text-xs font-bold text-[#003399]">Caps Lock is on</span> : null}
      <FieldError id={errorId}>{error}</FieldError>
      {forgotHint === 'librarian' ? (
        <p className="mt-2 text-xs font-semibold text-[#003399]/70">Forgot your password? Ask the campus librarian to reset it.</p>
      ) : null}
    </div>
  )
}
