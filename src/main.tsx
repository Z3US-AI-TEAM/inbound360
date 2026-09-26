import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import App from "./App";
import { SessionProvider } from "./lib/session";
import "./styles/globals.css";

try { const t = localStorage.getItem("z3_theme"); if (t === "light") document.documentElement.setAttribute("data-theme", "light"); } catch { /* ignore */ }

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: true, retry: 1 } } });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <SessionProvider>
          <App />
          <Toaster position="bottom-center" toastOptions={{ style: { background: "var(--surface-3)", color: "var(--ink)", border: "1px solid var(--line-strong)", fontFamily: "inherit", fontWeight: 600 } }} />
        </SessionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
