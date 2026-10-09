import { Eye, EyeOff, IdCard, LibraryBig, LockKeyhole, Mail, UserRound } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthenticationError, registerStudent, resendRegistrationCode, verifyRegistration, type StudentRegistrationInput } from './auth-api'

const SCHOOL_ID = /^[A-Z0-9][A-Z0-9._-]{2,49}$/
const SCHOOL_EMAIL = /^[^\s@]+@ormoc\.sti\.edu\.ph$/i
const roles = ['Student', 'Faculty', 'Librarian', 'Staff'] as const
const initialForm: StudentRegistrationInput = {
  role: 'Student', school_id: '', school_email: '', first_name: '', last_name: '', program_strand: '',
  year_grade_level: '', password: '', confirm_password: '',
}

const fieldClass = 'h-12 w-full rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-4 text-sm text-[#003399] outline-none transition placeholder:text-[#003399]/40 focus:border-[#003399] focus:ring-4 focus:ring-[#003399]/10'

export function RegistrationPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState(initialForm)
  const [verification, setVerification] = useState(false)
  const [approvalPending, setApprovalPending] = useState(false)
  const [code, setCode] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [registrationUnavailable, setRegistrationUnavailable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showPasswords, setShowPasswords] = useState(false)

  function update(field: keyof StudentRegistrationInput, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => { const next = { ...current }; delete next[field]; return next })
  }

  function validate() {
    const next: Record<string, string> = {}
    const schoolId = form.school_id.trim().toUpperCase()
    if (!schoolId) next.school_id = 'School ID is required.'
    else if (!SCHOOL_ID.test(schoolId)) next.school_id = 'Enter a valid STI School ID.'
    if (!form.first_name.trim()) next.first_name = 'First name is required.'
    if (!form.last_name.trim()) next.last_name = 'Last name is required.'
    if (!form.school_email?.trim()) next.school_email = 'School email is required.'
    else if (!SCHOOL_EMAIL.test(form.school_email.trim())) next.school_email = 'Use your @ormoc.sti.edu.ph email.'
    if (form.role === 'Student') {
      if (!form.program_strand) next.program_strand = 'Program or pathway is required.'
      if (!form.year_grade_level) next.year_grade_level = 'Year or grade level is required.'
    }
    if (!form.password) next.password = 'Password is required.'
    else if (form.password.length < 8) next.password = 'Password must contain at least 8 characters.'
    if (!form.confirm_password) next.confirm_password = 'Confirm your password.'
    else if (form.password !== form.confirm_password) next.confirm_password = 'Password confirmation does not match.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!validate()) { setMessage('Please correct the highlighted fields.'); return }
    setBusy(true); setMessage(''); setRegistrationUnavailable(false)
    const schoolId = form.school_id.trim().toUpperCase()
    try {
      await registerStudent({
        ...form, school_id: schoolId, first_name: form.first_name.trim(), last_name: form.last_name.trim(),
        school_email: form.school_email?.trim().toLowerCase(),
      })
      setErrors({})
      setMessage(`Enter the six-digit code sent to ${form.school_email?.trim().toLowerCase()}.`)
      setVerification(true)
    } catch (error) {
      const authError = error instanceof AuthenticationError ? error : new AuthenticationError('Unable to create your account right now.')
      setErrors(authError.errors)
      setMessage(authError.message)
      setRegistrationUnavailable(authError.code === 'REGISTRATION_UNAVAILABLE')
    } finally { setBusy(false) }
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      const result = await verifyRegistration(form.school_id.trim().toUpperCase(), code)
      if (result.status === 'PendingApproval') {
        setMessage('Your school email is verified. An administrator must approve your account before you can sign in.')
        setApprovalPending(true)
        setCode('')
        setForm(current => ({ ...current, password: '', confirm_password: '' }))
      } else {
        navigate('/login', { replace: true, state: { registrationSuccess: true, registrationSchoolId: form.school_id.trim().toUpperCase() } })
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to verify your code.') }
    finally { setBusy(false) }
  }

  async function resendCode() {
    setBusy(true); setMessage('')
    try { await resendRegistrationCode(form.school_id.trim().toUpperCase()); setMessage('A new code was sent to your school email.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to resend the code.') }
    finally { setBusy(false) }
  }

  return (
    <main className="min-h-screen bg-[#003399] px-4 py-8 sm:px-6 lg:py-12">
      <div className="mx-auto w-full max-w-5xl overflow-hidden rounded-[2rem] bg-[#FFFFFF] shadow-2xl shadow-[#003399] lg:grid lg:grid-cols-[.78fr_1.22fr]">
        <section className="relative overflow-hidden bg-[#003399] p-8 text-[#FFFFFF] lg:p-10">
          <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full border-[55px] border-[#FFF200]/10" />
          <div className="relative flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF200] text-[#003399]"><LibraryBig /></span><div><p className="font-display text-lg font-black">STI College Ormoc</p><p className="text-xs font-bold uppercase tracking-[.18em] text-[#FFFFFF]/70">ILMS</p></div></div>
          <div className="relative mt-14"><p className="text-xs font-black uppercase tracking-[.2em] text-[#FFF200]">Campus access</p><h1 className="mt-4 font-display text-4xl font-black leading-tight">Create your library account.</h1></div>
          <div className="relative mt-10 rounded-2xl border border-[#FFF200]/35 bg-[#FFF200]/10 p-5 text-sm leading-6 text-[#FFFFFF]/80"><strong className="block text-[#FFF200]">Already registered?</strong><Link to="/login" className="mt-1 inline-flex font-bold text-[#FFFFFF] underline underline-offset-4">Return to Login</Link></div>
        </section>

        <section className="p-6 sm:p-10">
          <p className="text-xs font-black uppercase tracking-[.18em] text-[#003399]/55">New account</p><h2 className="mt-2 font-display text-3xl font-black text-[#003399]">Account Registration</h2>
          {message ? <div role="alert" className="mt-5 rounded-xl border border-[#003399] bg-[#FFF200] px-4 py-3 text-sm font-bold text-[#003399]">{message}{registrationUnavailable ? <Link to="/login" className="mt-2 block underline underline-offset-4">Go to Sign In</Link> : null}</div> : null}
          {approvalPending ? <div className="mt-6 rounded-xl border border-[#003399]/20 p-5 text-sm text-[#003399]">Your registration is awaiting Admin approval. You can sign in after your account is approved.<Link to="/login" className="mt-3 block font-bold underline">Return to Login</Link></div> : verification ? <form className="mt-6 space-y-4" onSubmit={submitCode}>
            <Field label="Verification code"><input inputMode="numeric" maxLength={6} autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} placeholder="Six-digit code" className={fieldClass} /></Field>
            <button disabled={busy || code.length !== 6} className="h-12 w-full rounded-xl bg-[#FFF200] font-bold text-[#003399] disabled:opacity-50">Verify school email</button>
            <button type="button" disabled={busy} onClick={() => void resendCode()} className="text-sm font-bold text-[#003399] underline">Resend code</button>
          </form> :
          <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={submit} noValidate>
            <Field label="Register as" error={errors.role}><select value={form.role} onChange={event => update('role', event.target.value)} className={fieldClass}>{roles.map(role => <option key={role}>{role}</option>)}</select></Field>
            <div className="hidden sm:block" />
            <Field label="First Name" error={errors.first_name}><span className="relative block"><UserRound className="absolute left-4 top-1/2 -translate-y-1/2 text-[#003399]/45" size={17} /><input autoFocus autoComplete="given-name" value={form.first_name} onChange={(event) => update('first_name', event.target.value)} placeholder="First name" className={`${fieldClass} pl-11`} /></span></Field>
            <Field label="Last Name" error={errors.last_name}><input autoComplete="family-name" value={form.last_name} onChange={(event) => update('last_name', event.target.value)} placeholder="Last name" className={fieldClass} /></Field>
            <Field label="School Email" error={errors.school_email}><span className="relative block"><Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-[#003399]/45" size={17} /><input type="email" autoComplete="email" value={form.school_email} onChange={(event) => update('school_email', event.target.value)} placeholder="name@ormoc.sti.edu.ph" className={`${fieldClass} pl-11`} /></span></Field>
            <Field label="School ID" error={errors.school_id}><span className="relative block"><IdCard className="absolute left-4 top-1/2 -translate-y-1/2 text-[#003399]/45" size={17} /><input autoComplete="username" value={form.school_id} onChange={(event) => update('school_id', event.target.value)} placeholder="STI-2026-XXXX" className={`${fieldClass} pl-11 uppercase placeholder:normal-case`} /></span></Field>
            <Field label="Program / Strand" error={errors.program_strand}><select value={form.program_strand} onChange={(event) => update('program_strand', event.target.value)} className={fieldClass}><option value="">{form.role === 'Student' ? 'Select program or pathway' : 'Optional'}</option><optgroup label="College"><option>Bachelor of Science in Information Technology</option><option>Bachelor of Science in Tourism Management</option><option>Bachelor of Science in Hospitality Management</option></optgroup><optgroup label="Senior High — Academic"><option>STEM</option><option>ABM</option><option>HUMSS</option><option>General Academic</option></optgroup><optgroup label="Senior High — TechPro"><option>IT in Mobile App and Web Development</option><option>Computer and Communications Technology</option><option>Tourism Operations</option><option>Culinary Arts</option></optgroup></select></Field>
            <Field label="Year / Grade Level" error={errors.year_grade_level}><select value={form.year_grade_level} onChange={(event) => update('year_grade_level', event.target.value)} className={fieldClass}><option value="">{form.role === 'Student' ? 'Select year or grade level' : 'Optional'}</option><option>Grade 11</option><option>Grade 12</option><option>1st Year</option><option>2nd Year</option><option>3rd Year</option><option>4th Year</option></select></Field>
            <Field label="Password" error={errors.password}><span className="relative block"><LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 text-[#003399]/45" size={17} /><input type={showPasswords ? 'text' : 'password'} autoComplete="new-password" value={form.password} onChange={(event) => update('password', event.target.value)} placeholder="At least 8 characters" className={`${fieldClass} pl-11 pr-11`} /><button type="button" onClick={() => setShowPasswords((current) => !current)} aria-label={showPasswords ? 'Hide passwords' : 'Show passwords'} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-[#003399]/55">{showPasswords ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></Field>
            <Field label="Confirm Password" error={errors.confirm_password}><input type={showPasswords ? 'text' : 'password'} autoComplete="new-password" value={form.confirm_password} onChange={(event) => update('confirm_password', event.target.value)} placeholder="Repeat your password" className={fieldClass} /></Field>
            <button disabled={busy} className="mt-2 flex h-13 items-center justify-center rounded-xl bg-[#FFF200] px-5 text-sm font-black uppercase tracking-[.12em] text-[#003399] shadow-lg shadow-[#003399]/10 transition hover:ring-4 hover:ring-[#003399]/10 disabled:cursor-wait disabled:opacity-60 sm:col-span-2">{busy ? 'Creating account…' : 'Register'}</button>
          </form>}
          <p className="mt-6 text-center text-sm text-[#003399]/65">Already registered? <Link to="/login" className="font-black text-[#003399] underline decoration-[#FFF200] decoration-4 underline-offset-4">Sign In Here</Link></p>
        </section>
      </div>
    </main>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-sm font-bold text-[#003399]">{label}</span>{children}{error ? <span className="mt-1.5 block text-xs font-bold text-[#003399]">{error}</span> : null}</label>
}
