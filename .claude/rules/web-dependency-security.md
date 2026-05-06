# Dependency Security

Before installing any npm package, audit it for known vulnerabilities and supply-chain risk.

## Severity policy

| Severity       | Action                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Critical**   | Do not install. Find an alternative.                                                                                      |
| **High**       | Do not install. Find an alternative.                                                                                      |
| **Moderate**   | Investigate. Only install if no viable alternative exists and the vulnerability does not affect your usage; document why. |
| **Low / Info** | Acceptable with awareness; monitor for patches.                                                                           |

- If no safe alternative exists, escalate to the team rather than installing a known-vulnerable package.
- Consider implementing the functionality natively if the package is small-scope.

## Transitive dependencies

- Apply the same severity policy to transitive (indirect) dependencies.
- If a vulnerable transitive package is not reachable from your code path (e.g. dev-only build step), document this explicitly.
- Use the `overrides` field in `package.json` to pin a vulnerable transitive package to a patched version when no updated direct dependency is available:

```json
{
  "overrides": {
    "vulnerable-transitive-package": ">=2.3.1"
  }
}
```

- Document which CVE the override addresses and when it can be removed.
- Review and remove stale overrides whenever the direct dependency is upgraded.

## Ongoing maintenance

- Run `npm audit` in CI. A **high or critical** finding fails the build.
- Pin exact versions (`--save-exact`) for security-sensitive packages.
