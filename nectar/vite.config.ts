import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// VITE_BASE is the path the site is served from, e.g. '/vinny001/' on GitHub Pages.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss()],
});
