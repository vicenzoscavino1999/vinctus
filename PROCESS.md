# Process and governance

## Branch protection (manual GitHub settings)

- Require status checks to pass
- Require branches to be up to date
- Require pull request reviews (if applicable)

## PR discipline

- Small, focused PRs (ideally <300-500 net lines)
- CI gate must be green before merge
- Manual checklist is required, but not the only gate

## Stub policy

- Every stub must include:
  - TODO: STUB REMOVE BY: YYYY-MM-DD
  - Ticket: ABC-123
- If today > REMOVE BY date, CI must fail
