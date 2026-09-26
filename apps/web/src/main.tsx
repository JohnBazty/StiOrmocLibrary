import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { MockAuthProvider } from './features/inventory/MockAuthContext'
import { ThemeProvider } from './features/theme/ThemeProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <MockAuthProvider><App /></MockAuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
