import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

// splash: logo on plain white, on screen from the very first paint (it is in index.html), and
// removed only once the app has actually drawn — never before ~0.8s so it can't flash.
const splash = document.getElementById('splash');
if (splash) {
  const started = window.__splashStart || Date.now();
  const hide = () => {
    splash.classList.add('hide');
    setTimeout(() => splash.remove(), 400);
  };
  const ready = () => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(hide, Math.max(0, 800 - (Date.now() - started)))));
  if (document.readyState === 'complete') ready(); else window.addEventListener('load', ready, { once: true });
  setTimeout(hide, 4000); // safety net
}
