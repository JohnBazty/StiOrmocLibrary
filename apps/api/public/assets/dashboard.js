const userName = document.querySelector('[data-user-name]')
const userRole = document.querySelector('[data-user-role]')
const csrfField = document.querySelector('.csrf-field')

async function initializeDashboard() {
  try {
    const [userResponse, csrfResponse] = await Promise.all([
      fetch('/api/auth/me', { credentials: 'same-origin', headers: { Accept: 'application/json' } }),
      fetch('/api/auth/csrf', { credentials: 'same-origin', headers: { Accept: 'application/json' } }),
    ])
    if (!userResponse.ok || !csrfResponse.ok) {
      window.location.replace('/login?timeout=1')
      return
    }
    const userResult = await userResponse.json()
    const csrfResult = await csrfResponse.json()
    userName.textContent = userResult.user.fullName
    userRole.textContent = userResult.user.role
    csrfField.value = csrfResult.csrfToken
  } catch (_error) {
    window.location.replace('/login?auth=required')
  }
}

initializeDashboard()

