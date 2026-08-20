const form = document.querySelector('#register-form')
const fullNameInput = document.querySelector('#full-name')
const emailInput = document.querySelector('#email')
const roleInput = document.querySelector('#role')
const passwordInput = document.querySelector('#password')
const showPasswordInput = document.querySelector('#show-password')
const submitButton = document.querySelector('#submit-button')
const statusAlert = document.querySelector('#status-alert')

const errorElements = {
  fullName: document.querySelector('#full-name-error'),
  email: document.querySelector('#email-error'),
  role: document.querySelector('#role-error'),
  password: document.querySelector('#password-error'),
}

const inputs = { fullName: fullNameInput, email: emailInput, role: roleInput, password: passwordInput }
const institutionalEmail = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?@(?:ormoc\.sti\.edu\.ph|sti\.edu)$/i
let csrfToken = ''
let redirectTimer

function showAlert(message, kind = 'error') {
  statusAlert.textContent = message
  statusAlert.dataset.kind = kind
  statusAlert.hidden = false
}

function setFieldError(field, message = '') {
  errorElements[field].textContent = message
  if (message) inputs[field].setAttribute('aria-invalid', 'true')
  else inputs[field].removeAttribute('aria-invalid')
}

function validateField(field) {
  const fullName = fullNameInput.value.trim().replace(/\s+/g, ' ')
  const email = emailInput.value.trim()
  const role = roleInput.value
  const password = passwordInput.value

  if (field === 'fullName') {
    if (!fullName) return setFieldError(field, 'Full name is required.'), false
    if (fullName.length < 2) return setFieldError(field, 'Enter your complete name.'), false
  }
  if (field === 'email') {
    if (!email) return setFieldError(field, 'School email address is required.'), false
    if (!institutionalEmail.test(email)) return setFieldError(field, 'Use an official @ormoc.sti.edu.ph or @sti.edu email.'), false
  }
  if (field === 'role' && !role) return setFieldError(field, 'Select an account role.'), false
  if (field === 'password') {
    if (!password) return setFieldError(field, 'Password is required.'), false
    if (password.length < 6) return setFieldError(field, 'Password must contain at least 6 characters.'), false
  }

  setFieldError(field)
  return true
}

function validateForm() {
  statusAlert.hidden = true
  return ['fullName', 'email', 'role', 'password'].map(validateField).every(Boolean)
}

async function loadCsrfToken() {
  try {
    const response = await fetch('/api/auth/csrf', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error('Unable to initialize registration security.')
    const result = await response.json()
    csrfToken = result.csrfToken
    submitButton.disabled = false
  } catch (_error) {
    showAlert('The secure registration form could not be initialized. Check the server and refresh this page.')
  }
}

for (const field of Object.keys(inputs)) {
  inputs[field].addEventListener('blur', () => validateField(field))
  inputs[field].addEventListener(field === 'role' ? 'change' : 'input', () => {
    if (inputs[field].hasAttribute('aria-invalid')) validateField(field)
  })
}

showPasswordInput.addEventListener('change', () => {
  passwordInput.type = showPasswordInput.checked ? 'text' : 'password'
})

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!validateForm() || !csrfToken) return

  submitButton.disabled = true
  submitButton.firstElementChild.textContent = 'Creating account…'

  try {
    const response = await fetch('/auth/register', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({
        fullName: fullNameInput.value.trim(),
        email: emailInput.value.trim(),
        role: roleInput.value,
        password: passwordInput.value,
      }),
    })
    const result = await response.json()

    if (!response.ok) {
      for (const [field, message] of Object.entries(result.errors || {})) {
        if (errorElements[field]) setFieldError(field, message)
      }
      showAlert(result.message || 'Unable to create the account. Please try again.')
      if (result.code === 'INVALID_CSRF_TOKEN') await loadCsrfToken()
      return
    }

    form.reset()
    for (const field of Object.keys(inputs)) setFieldError(field)
    showAlert('Account created successfully! Redirecting you to sign in…', 'success')
    redirectTimer = window.setTimeout(() => window.location.assign(result.redirect || '/login?registered=1'), 2500)
  } catch (_error) {
    showAlert('The registration service is unavailable. Please try again shortly.')
  } finally {
    submitButton.disabled = false
    submitButton.firstElementChild.textContent = 'Create Account'
  }
})

window.addEventListener('pagehide', () => window.clearTimeout(redirectTimer))
loadCsrfToken()

