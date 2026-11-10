import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

// splash: logo on a plain white background, shown until the app has drawn (at least ~0.8s so it never flashes)
const splash = document.getElementById('splash');
if (splash) {
  const started = (window.__splashStart = window.__splashStart || Date.now());
  setTimeout(() => {
    splash.classList.add('hide');
    setTimeout(() => splash.remove(), 400);
  }, Math.max(0, 800 - (Date.now() - started)));
}
