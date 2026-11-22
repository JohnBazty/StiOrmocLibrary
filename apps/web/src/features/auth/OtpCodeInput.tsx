import { type ClipboardEvent, type KeyboardEvent, type MutableRefObject, useId, useRef } from 'react'

const OTP_LENGTH = 6

export type OtpCodeInputProps = {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  autoFocus?: boolean
  firstInputRef?: MutableRefObject<HTMLInputElement | null>
}

export function OtpCodeInput({
  label,
  value,
  onChange,
  disabled = false,
  autoFocus = false,
  firstInputRef,
}: OtpCodeInputProps) {
  const firstId = useId()
  const refs = useRef<Array<HTMLInputElement | null>>([])
  const digits = value.replace(/\D/g, '').slice(0, OTP_LENGTH)

  function focusIndex(index: number) {
    refs.current[Math.max(0, Math.min(index, OTP_LENGTH - 1))]?.focus({ preventScroll: true })
  }

  function applyPasted(index: number, raw: string) {
    const incoming = raw.replace(/\D/g, '')
    if (!incoming) return
    const start = index === 0 || incoming.length >= OTP_LENGTH ? 0 : index
    const chars = Array.from({ length: OTP_LENGTH }, (_, idx) => digits[idx] ?? '')
    for (let offset = 0; offset < incoming.length && start + offset < OTP_LENGTH; offset++) {
      chars[start + offset] = incoming[offset]
    }
    const next = chars.join('').slice(0, OTP_LENGTH)
    onChange(next)
    focusIndex(Math.min(start + incoming.length, OTP_LENGTH - 1))
  }

  function handleChange(index: number, raw: string) {
    const incoming = raw.replace(/\D/g, '')
    if (!incoming) {
      const next = digits.slice(0, index) + digits.slice(index + 1)
      onChange(next)
      return
    }
    const existing = digits[index]
    if (existing && incoming.length === 2 && (incoming.startsWith(existing) || incoming.endsWith(existing))) {
      const typed = incoming.startsWith(existing) ? incoming[1] : incoming[0]
      const chars = digits.split('')
      chars[index] = typed
      onChange(chars.join('').slice(0, OTP_LENGTH))
      if (index < OTP_LENGTH - 1) focusIndex(index + 1)
      return
    }
    if (incoming.length > 1) {
      applyPasted(index, incoming)
      return
    }
    const chars = digits.split('')
    if (index < chars.length) {
      chars[index] = incoming
    } else {
      chars.push(incoming)
    }
    const next = chars.join('').slice(0, OTP_LENGTH)
    onChange(next)
    if (index < OTP_LENGTH - 1) focusIndex(Math.min(next.length, OTP_LENGTH - 1))
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        event.preventDefault()
        onChange(digits.slice(0, index - 1) + digits.slice(index))
        focusIndex(index - 1)
      }
      return
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault()
      focusIndex(index - 1)
      return
    }
    if (event.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      event.preventDefault()
      focusIndex(index + 1)
    }
  }

  function handlePaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '')
    if (!pasted) return
    event.preventDefault()
    applyPasted(index, pasted)
  }

  return (
    <div className="space-y-2">
      <label htmlFor={firstId} className="block text-sm font-bold text-[#0b5ea2] dark:text-white">
        {label}
      </label>
      <div className="grid grid-cols-6 gap-2 sm:gap-2.5">
        {Array.from({ length: OTP_LENGTH }, (_, index) => {
          const digit = digits[index] ?? ''
          return (
            <input
              key={index}
              id={index === 0 ? firstId : undefined}
              ref={element => {
                refs.current[index] = element
                if (index === 0 && firstInputRef) firstInputRef.current = element
              }}
              aria-label={index === 0 ? undefined : `${label} digit ${index + 1}`}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete={index === 0 ? 'one-time-code' : 'off'}
              required={index === 0}
              disabled={disabled}
              autoFocus={index === 0 ? autoFocus : false}
              value={digit}
              onFocus={event => event.currentTarget.select()}
              onChange={event => handleChange(index, event.target.value)}
              onKeyDown={event => handleKeyDown(index, event)}
              onPaste={event => handlePaste(index, event)}
              className={`h-13 w-full rounded-xl border-2 bg-white text-center text-xl font-black tabular-nums text-[#0b5ea2] outline-none transition focus:border-[#0b5ea2] focus:ring-4 focus:ring-[#0b5ea2]/15 disabled:opacity-55 dark:bg-[#001a4d] dark:text-white dark:focus:border-[#FFF200] dark:focus:ring-[#FFF200]/20 ${
                digit
                  ? 'border-[#0b5ea2] dark:border-[#FFF200]'
                  : 'border-[#0b5ea2]/25 dark:border-white/25'
              }`}
            />
          )
        })}
      </div>
    </div>
  )
}
