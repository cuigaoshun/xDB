import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./globals.css";
import "./i18n";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="xDB-ui-theme">
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
