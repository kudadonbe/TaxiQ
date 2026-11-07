import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/noto-sans-thaana/thaana-400.css'
import '@fontsource/noto-sans-thaana/thaana-700.css'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth.tsx'
import { AvailabilityProvider } from './availability.tsx'
import { I18nProvider } from './i18n.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <AuthProvider>
        <AvailabilityProvider>
          <App />
        </AvailabilityProvider>
      </AuthProvider>
    </I18nProvider>
  </StrictMode>,
)
