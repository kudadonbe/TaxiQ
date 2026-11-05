/// <reference types="vite/client" />

interface ImportMetaEnv {
  // TaxiQ v3 API base URL, e.g. https://api.example.mv. Unset = the v2 Firebase app.
  readonly VITE_API_URL?: string
}
