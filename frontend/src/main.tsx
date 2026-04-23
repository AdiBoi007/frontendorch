import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { AppShellProvider } from "./context/AppShellContext";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppShellProvider>
          <App />
        </AppShellProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
