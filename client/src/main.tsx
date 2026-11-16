import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Installs the project header on every API request before anything else runs.
import './project.ts'
import { ProjectRoot } from './ProjectRoot.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProjectRoot />
  </StrictMode>,
)
