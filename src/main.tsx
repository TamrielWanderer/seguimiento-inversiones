import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./ui.css";
import InversionesPage from "./seguimiento";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <InversionesPage />
  </StrictMode>,
);
