import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./ui/App";
import { OptionalTelemetry } from "./infrastructure/browser/optional-telemetry";
import "./ui/styles/global.css";
import "./ui/styles/primitives.css";

createRoot(document.getElementById("root")!).render(<BrowserRouter><StrictMode><App /></StrictMode><OptionalTelemetry /></BrowserRouter>);
