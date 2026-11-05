import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/noto-sans-thaana/thaana-400.css'
import '@fontsource/noto-sans-thaana/thaana-700.css'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth.tsx'
import { I18nProvider } from './i18n.tsx'
import { API_URL } from './v3/api.ts'
import { V3App } from './v3/V3App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <AuthProvider>
        {/* v3 (API) when the build has VITE_API_URL; otherwise the v2 Firebase app. */}
        {API_URL ? <V3App /> : <App />}
      </AuthProvider>
    </I18nProvider>
  </StrictMode>,
)
