import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { LoginPage } from './LoginPage'
import { RegistrationPage } from './RegistrationPage'
import { AdminLoginPage } from './AdminLoginPage'

describe('authentication pages', () => {
  it('shows the role and school-ID login contract with a registration link', () => {
    render(<MemoryRouter><LoginPage /></MemoryRouter>)
    expect(screen.getByLabelText('Login as')).toBeTruthy()
    expect(screen.getByLabelText('School ID')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Register as Student' }).getAttribute('href')).toBe('/register')
    expect(screen.getByRole('link', { name: 'System Administrator Login' }).getAttribute('href')).toBe('/admin/login')
  })

  it('shows every field required by normalized student registration', () => {
    render(<MemoryRouter><RegistrationPage /></MemoryRouter>)
    for (const label of ['First Name', 'Last Name', 'Contact Number', 'Student ID', 'Program / Strand', 'Year / Grade Level', 'Password', 'Confirm Password']) {
      expect(screen.getByLabelText(label)).toBeTruthy()
    }
    expect(screen.getByRole('button', { name: 'Register' })).toBeTruthy()
  })

  it('provides a dedicated administrator login without a selectable role', () => {
    render(<MemoryRouter><AdminLoginPage /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Administration Portal' })).toBeTruthy()
    expect(screen.getByLabelText('Administrator School ID')).toBeTruthy()
    expect(screen.queryByLabelText('Login as')).toBeNull()
    expect(screen.getByRole('button', { name: 'Open Administration Portal' })).toBeTruthy()
  })
})

afterEach(cleanup)
