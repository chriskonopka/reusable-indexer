# Frontend Error Logging

- All frontend applications must instrument the App Insights JavaScript SDK (@microsoft/applicationinsights-web). Azure hosting does not provide frontend telemetry automatically — unhandled exceptions, React errors, and client-side failures are invisible to App Insights without it.

- Initialize the SDK once at app entry point using the APPLICATIONINSIGHTS_CONNECTION_STRING — the same connection string used by the API and Worker. The connection string is safe to expose in the browser; it is a write-only ingestion key, not an access key.

- A React error boundary must wrap the application root and call appInsights.trackException() on any caught error.
