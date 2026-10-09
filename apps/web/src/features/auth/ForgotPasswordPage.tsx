import { IdCard, LibraryBig, ShieldCheck } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ThemeToggle } from '../theme/ThemeToggle'
import {
  AuthenticationError,
  confirmPasswordReset,
  requestPasswordReset,
  verifyPasswordResetOtp,
} from './auth-api'
import { AuthAlertBanner, AuthStatusBanner, FieldError, PasswordField } from './auth-form'

type Step = 'identify' | 'otp' | 'password'

export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('identify')
  const [identifier, setIdentifier] = useState('')
  const [otp, setOtp] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [alert, setAlert] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function submitIdentify(event: FormEvent) {
    event.preventDefault()
    const value = identifier.trim()
    if (!value) {
      setErrors({ school_id_or_email: 'Student ID or school email is required.' })
      setAlert('')
      return
    }
    setBusy(true); setErrors({}); setAlert(''); setStatus('')
    try {
      const result = await requestPasswordReset(value)
      setStatus(result.message)
      setStep('otp')
    } catch (error) {
      const authError = error instanceof AuthenticationError ? error : new AuthenticationError('Unable to start password reset.')
      setErrors(authError.errors)
      setAlert(authError.message)
    } finally { setBusy(false) }
  }

  async function submitOtp(event: FormEvent) {
    event.preventDefault()
    const code = otp.trim()
    if (!/^\d{6}$/.test(code)) {
      setErrors({ otp: 'Enter the 6-digit code from your email.' })
      setAlert('')
      return
    }
    setBusy(true); setErrors({}); setAlert('')
    try {
      const result = await verifyPasswordResetOtp(identifier.trim(), code)
      setResetToken(result.resetToken)
      setStatus('Code verified. Choose a new password.')
      setStep('password')
    } catch (error) {
      const authError = error instanceof AuthenticationError ? error : new AuthenticationError('Unable to verify the reset code.')
      setErrors(authError.errors)
      setAlert(authError.message)
      setOtp('')
    } finally { setBusy(false) }
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault()
    const nextErrors: Record<string, string> = {}
    if (!password) nextErrors.new_password = 'Password is required.'
    else if (password.length < 8) nextErrors.new_password = 'Password must contain at least 8 characters.'
    if (!confirmPassword) nextErrors.confirm_password = 'Password confirmation is required.'
    else if (password !== confirmPassword) nextErrors.confirm_password = 'Password confirmation does not match.'
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); setAlert(''); return }

    setBusy(true); setErrors({}); setAlert('')
    try {
      await confirmPasswordReset(resetToken, password, confirmPassword)
      navigate('/login', { replace: true, state: { passwordReset: true } })
    } catch (error) {
      const authError = error instanceof AuthenticationError ? error : new AuthenticationError('Unable to update the password.')
      setErrors(authError.errors)
      setAlert(authError.message)
    } finally { setBusy(false) }
  }

  return (
    <main className="relative grid min-h-screen bg-[#FFFFFF] transition-colors lg:grid-cols-[1.05fr_.95fr] dark:bg-[#000d2b]">
      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6"><ThemeToggle /></div>
      <section className="relative hidden overflow-hidden bg-[#003399] p-12 text-[#FFFFFF] lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full border-[70px] border-[#FFF200]/10" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF200] text-[#003399]"><LibraryBig /></span>
          <div>
            <p className="font-display text-lg font-black">STI ORMOC</p>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-[#FFFFFF]/70">Smart Library</p>
          </div>
        </div>
        <div className="relative max-w-xl">
          <span className="inline-flex rounded-full border border-[#FFF200]/40 bg-[#FFF200]/10 px-4 py-2 text-xs font-bold uppercase tracking-[.16em] text-[#FFF200]">Student password reset</span>
          <h1 className="mt-7 font-display text-5xl font-black leading-tight">Reset with your school email</h1>
        </div>
        <div className="relative flex items-center gap-3 text-sm text-[#FFFFFF]/70">
          <ShieldCheck className="text-[#FFF200]" />
          <span>Codes expire in 10 minutes and lock after three failed attempts</span>
        </div>
      </section>

      <section className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-md">
          <p className="text-xs font-black uppercase tracking-[.18em] text-[#003399]/55">Account recovery</p>
          <h2 className="mt-2 font-display text-4xl font-black tracking-tight text-[#003399]">Forgot Password</h2>
          {status ? <AuthStatusBanner>{status}</AuthStatusBanner> : null}
          {alert ? <AuthAlertBanner>{alert}</AuthAlertBanner> : null}

          {step === 'identify' ? (
            <form className="mt-7 space-y-5" onSubmit={submitIdentify} noValidate>
              <div>
                <label className="block" htmlFor="reset-identifier">
                  <span className="text-sm font-bold text-[#003399]">Student ID or school email</span>
                  <span className="relative mt-2 block">
                    <IdCard className="absolute left-4 top-1/2 -translate-y-1/2 text-[#003399]/50" size={18} />
                    <input
                      id="reset-identifier"
                      autoFocus
                      autoComplete="username"
                      value={identifier}
                      onChange={(event) => setIdentifier(event.target.value)}
                      aria-invalid={errors.school_id_or_email ? true : undefined}
                      aria-describedby={errors.school_id_or_email ? 'reset-identifier-error' : undefined}
                      placeholder="02000351061 or name@ormoc.sti.edu.ph"
                      className="h-13 w-full rounded-xl border border-[#003399]/20 bg-[#FFFFFF] pl-12 pr-4 text-sm text-[#003399] outline-none transition placeholder:text-[#003399]/40 focus:border-[#003399] focus:ring-4 focus:ring-[#003399]/10"
                    />
                  </span>
                </label>
                <FieldError id="reset-identifier-error">{errors.school_id_or_email}</FieldError>
              </div>
              <button disabled={busy} className="flex h-13 w-full items-center justify-center rounded-xl bg-[#003399] px-5 text-sm font-black text-[#FFFFFF] shadow-lg shadow-[#003399]/15 transition hover:bg-[#003399]/90 disabled:cursor-wait disabled:opacity-60">
                {busy ? 'Sending…' : 'Send reset code'}
              </button>
            </form>
          ) : null}

          {step === 'otp' ? (
            <form className="mt-7 space-y-5" onSubmit={submitOtp} noValidate>
              <div>
                <label className="block" htmlFor="reset-otp">
                  <span className="text-sm font-bold text-[#003399]">6-digit code</span>
                  <input
                    id="reset-otp"
                    autoFocus
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={otp}
                    onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    aria-invalid={errors.otp ? true : undefined}
                    aria-describedby={errors.otp ? 'reset-otp-error' : undefined}
                    placeholder="Enter code from Outlook"
                    className="mt-2 h-13 w-full rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-4 text-center text-lg tracking-[0.35em] text-[#003399] outline-none focus:border-[#003399] focus:ring-4 focus:ring-[#003399]/10"
                  />
                </label>
                <FieldError id="reset-otp-error">{errors.otp}</FieldError>
              </div>
              <button disabled={busy} className="flex h-13 w-full items-center justify-center rounded-xl bg-[#003399] px-5 text-sm font-black text-[#FFFFFF] disabled:cursor-wait disabled:opacity-60">
                {busy ? 'Verifying…' : 'Verify code'}
              </button>
            </form>
          ) : null}

          {step === 'password' ? (
            <form className="mt-7 space-y-5" onSubmit={submitPassword} noValidate>
              <PasswordField
                id="new-password"
                label="New password"
                value={password}
                onChange={setPassword}
                error={errors.new_password}
                placeholder="Enter a completely new password"
                forgotHint="none"
                autoComplete="new-password"
              />
              <PasswordField
                id="confirm-password"
                label="Confirm new password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                error={errors.confirm_password}
                placeholder="Re-enter new password"
                forgotHint="none"
                autoComplete="new-password"
              />
              <button disabled={busy} className="flex h-13 w-full items-center justify-center rounded-xl bg-[#003399] px-5 text-sm font-black text-[#FFFFFF] disabled:cursor-wait disabled:opacity-60">
                {busy ? 'Updating…' : 'Update password'}
              </button>
            </form>
          ) : null}

          <p className="mt-7 text-center text-sm text-[#003399]/70">
            <Link to="/login" className="font-semibold text-[#003399] underline decoration-[#003399]/20 underline-offset-4">Back to login</Link>
          </p>
        </div>
      </section>
    </main>
  )
}
