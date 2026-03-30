# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 0.4.0   | :white_check_mark: |
| < 0.4.0 | :x:                |

## Reporting a Vulnerability

We take security seriously at FinanceFlow. If you discover a security vulnerability, please report it responsibly.

**Email:** [security@financeflow.app](mailto:security@financeflow.app)

Please include:
- A description of the vulnerability
- Steps to reproduce the issue
- Any relevant logs or screenshots
- Your assessment of the severity

### Response Timeline

- **Acknowledgment:** Within 72 hours of your report
- **Initial assessment:** Within 7 days
- **Fix timeline:** Within 30 days for confirmed vulnerabilities
- **Disclosure:** Coordinated with the reporter

## Scope

The following areas are in scope for security reports:

- **Authentication** — login, registration, session tokens, password hashing
- **Data encryption** — data at rest (SQLite), data in transit
- **Session management** — token generation, expiration, invalidation
- **Authorization** — access control, privilege escalation
- **Input validation** — SQL injection, XSS, CSRF
- **API security** — rate limiting, content-type enforcement

### Out of Scope

- Denial of service attacks against self-hosted instances
- Social engineering
- Physical access attacks
- Issues in third-party dependencies (report upstream instead)

## Credit

We believe in recognizing the efforts of security researchers. With your permission, we will:

- Credit you in our security advisories
- Add your name to our Security Hall of Fame in this document
- Provide a letter of acknowledgment upon request

Thank you for helping keep FinanceFlow and its users safe.

## Security Hall of Fame

*No reports yet — be the first responsible disclosure reporter!*
