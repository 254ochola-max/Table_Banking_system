import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Handle Vite dynamic import chunk errors after new deployments on hosting platforms like Vercel
window.addEventListener("vite:preloadError", (event) => {
  const reloadKey = "vite_chunk_preload_reload";
  const lastReload = window.sessionStorage.getItem(reloadKey);
  const now = Date.now();

  // Only reload once within a 10-second window to prevent infinite reload loops
  if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
    window.sessionStorage.setItem(reloadKey, now.toString());
    window.location.reload();
  }
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);