import { Component, Suspense, lazy, type ReactNode } from "react";

const VercelAnalytics = lazy(() => import("./vercel-analytics").catch(() => ({ default: () => null })));

class TelemetryBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

export function OptionalTelemetry() {
  if (import.meta.env.VITE_TELEMETRY_PROVIDER !== "vercel") return null;
  return <TelemetryBoundary><Suspense fallback={null}><VercelAnalytics /></Suspense></TelemetryBoundary>;
}
