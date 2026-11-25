import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./theme.css";
import "./elevate.css";
import { applyTheme, ensureHouse, initialTheme } from "./lib/theme";

applyTheme(initialTheme());
ensureHouse();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// App dos Admins (PWA): o service worker recebe as notificações push.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
}
