import { jsx as _jsx } from "react/jsx-runtime";
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { applyTheme, readTheme } from './lib/theme';
import { applyAccent, readAccent } from './lib/accent';
import './lib/install';
applyTheme(readTheme());
applyAccent(readAccent());
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
    });
}
createRoot(document.getElementById('root')).render(_jsx(StrictMode, { children: _jsx(BrowserRouter, { basename: import.meta.env.BASE_URL, children: _jsx(App, {}) }) }));
