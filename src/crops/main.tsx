import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import './crops.css'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { CropFinder } from './CropFinder'

const host = document.getElementById('crops-root')
if (host) {
  createRoot(host).render(
    <StrictMode>
      <ErrorBoundary
        label="Crop finder"
        testId="panel-crops-failed"
        note="Reload the page: the address bar holds your place and your answers."
      >
        <CropFinder />
      </ErrorBoundary>
    </StrictMode>,
  )
}
