import { useLocation } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { analyticsBeforeSend, telemetryRoute } from "./telemetry-policy";

export default function VercelAnalytics() {
  const { pathname } = useLocation();
  const route = telemetryRoute(pathname);
  // A first pageview could otherwise include an incoming third-party document.referrer,
  // which the SDK does not expose to beforeSend. Do not load the SDK in that case.
  if (route === null || (document.referrer && !document.referrer.startsWith(`${window.location.origin}/`))) return null;
  return <Analytics route={route} path={route} beforeSend={analyticsBeforeSend} />;
}
