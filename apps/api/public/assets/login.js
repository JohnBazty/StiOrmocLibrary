const form = document.querySelector('#login-form')
const emailInput = document.querySelector('#email')
const passwordInput = document.querySelector('#password')
const showPassword = document.querySelector('#show-password')
const submitButton = document.querySelector('#submit-button')
const statusAlert = document.querySelector('#status-alert')
const emailError = document.querySelector('#email-error')
const passwordError = document.querySelector('#password-error')

const institutionalEmail = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?@(?:ormoc\.sti\.edu\.ph|sti\.edu)$/i
let csrfToken = ''

function showAlert(message, kind = 'error') {
  statusAlert.textContent = message
  statusAlert.dataset.kind = kind
  statusAlert.hidden = false
}

function clearErrors() {
  emailError.textContent = ''
  passwordError.textContent = ''
  emailInput.removeAttribute('aria-invalid')
  passwordInput.removeAttribute('aria-invalid')
  statusAlert.hidden = true
}

function validate() {
  clearErrors()
  const email = emailInput.value.trim()
  const password = passwordInput.value
  let valid = true

  if (!email) {
    emailError.textContent = 'School email address is required.'
    emailInput.setAttribute('aria-invalid', 'true')
    valid = false
  } else if (!institutionalEmail.test(email)) {
    emailError.textContent = 'Use an official @ormoc.sti.edu.ph or @sti.edu email.'
    emailInput.setAttribute('aria-invalid', 'true')
    valid = false
  }

  if (!password) {
    passwordError.textContent = 'Password is required.'
    passwordInput.setAttribute('aria-invalid', 'true')
    valid = false
  }
  return valid
}

async function loadCsrfToken() {
  try {
    const response = await fetch('/api/auth/csrf', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error('Unable to initialize the secure form.')
    const result = await response.json()
    csrfToken = result.csrfToken
    submitButton.disabled = false
  } catch (_error) {
    showAlert('The secure login form could not be initialized. Check the server and refresh this page.')
  }
}

showPassword.addEventListener('change', () => {
  passwordInput.type = showPassword.checked ? 'text' : 'password'
})

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!validate() || !csrfToken) return

  submitButton.disabled = true
  submitButton.firstElementChild.textContent = 'Verifying account…'

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ email: emailInput.value.trim(), password: passwordInput.value }),
    })
    const result = await response.json()

    if (!response.ok) {
      if (result.errors?.email) emailError.textContent = result.errors.email
      if (result.errors?.password) passwordError.textContent = result.errors.password
      showAlert(result.message || 'Unable to sign in. Please try again.')
      if (result.code === 'INVALID_CSRF_TOKEN') await loadCsrfToken()
      return
    }

    showAlert('Login successful. Opening your dashboard…', 'success')
    window.location.assign(result.redirect)
  } catch (_error) {
    showAlert('The authentication server is unavailable. Please try again shortly.')
  } finally {
    submitButton.disabled = false
    submitButton.firstElementChild.textContent = 'Secure Sign In'
  }
})

const query = new URLSearchParams(window.location.search)
if (query.has('logout')) showAlert('You have been signed out successfully.', 'success')
else if (query.has('registered')) showAlert('Account created successfully! You may now sign in.', 'success')
else if (query.has('timeout')) showAlert('Your session expired after 30 minutes of inactivity. Please sign in again.')
else if (query.has('auth')) showAlert('Please sign in to continue.')

loadCsrfToken()
