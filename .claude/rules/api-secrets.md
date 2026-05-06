# Secrets Handling

A "secret" is any value whose disclosure would let an attacker impersonate a
service, decrypt protected data, or access a paid third-party account. This
includes: API keys, connection strings containing passwords, signing keys,
OAuth client secrets, webhook signing secrets, encryption keys.

It does **not** include: endpoint URIs, queue names, container names,
allowed CORS origins, region names, or other configuration that is
non-secret on its own. Those go in container app environment variables.

## Storage — Azure Key Vault is the only sanctioned secrets store
- All secrets live in Azure Key Vault, in every environment (dev, staging,
  prod). There is no "dev mode" exemption. Local development uses a
  developer-scoped Key Vault accessed via `DefaultAzureCredential` — i.e.
  the developer's own Azure login, not a shared key.
- Secrets are loaded at startup via `DefaultAzureCredential`. No secret is
  ever read from `appsettings.json`, `.env`, environment variables,
  hardcoded constants, or build-time substitution.
- Service-to-service auth inside Azure uses Managed Identity, which means
  there is no secret to store at all. Prefer this over any API key whenever
  the target service supports it.

## What goes in environment variables instead
Container app environment variables hold non-secret configuration: Key
Vault URI, Service Bus namespace, Blob Storage account URI, queue names,
container names, allowed CORS origins, log levels, feature flags. The
application code reads the Key Vault URI from the environment, then loads
actual secrets from Key Vault.

## Forbidden patterns
- API keys, connection strings with passwords, or any other secret in
  `appsettings.json`, `appsettings.*.json`, `.env`, or environment variables
- Secrets in container image layers (set via `ENV`, `ARG`, or `COPY`)
- Secrets in source control under any branch, including private forks
- Secrets in commit messages, PR descriptions, or issue comments
- Secrets in log statements, exception messages, or telemetry
- Logging the result of `KeyVaultSecret.Value` even at `Debug`

## Rotation and revocation
- Every secret has a documented owner and rotation cadence
- Rotation is a Key Vault operation, never a code change. The application
  must re-read secrets without a redeploy — implement Key Vault refresh on
  a configurable interval (template default: **1 hour** — tune per project
  based on rotation cadence and tolerable staleness window) using
  `Azure.Extensions.AspNetCore.Configuration.Secrets`
- On suspected leak: revoke first, investigate second. Record the incident
  in the project's incident log

## Pre-commit gating
The repository must run `gitleaks` (or an equivalent secret scanner) on
every commit. The `/security-review` skill includes a secret-scan pass.
Any finding blocks the commit until either the value is removed and the
git history is rewritten, or the value is confirmed false-positive and
allowlisted with a comment.

## Reviewer checklist
- [ ] No new secret is read from configuration outside Key Vault
- [ ] No new logging statement could log a secret value (including
      structured properties on a DTO that holds one)
- [ ] No new test fixture contains a real secret — synthetic values only
- [ ] Any new third-party integration uses Managed Identity if available;
      if not, the API key is in Key Vault and the rotation cadence is
      recorded
