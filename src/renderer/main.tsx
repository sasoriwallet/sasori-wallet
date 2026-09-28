import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'
import { AppErrorBoundary } from './components/AppErrorBoundary'

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled renderer promise rejection', event.reason)
})
window.addEventListener('error', (event) => {
  console.error('Unhandled renderer error', event.error ?? event.message)
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
)
