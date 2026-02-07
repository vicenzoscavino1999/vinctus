# Phase 6 Coverage Scope

## Coverage gate target

- Statements: `>= 85%`
- Branches: `>= 80%`
- Functions: `>= 85%`
- Lines: `>= 85%`

## Scope used for the gate

The coverage gate is intentionally scoped to the data-access and reliability surface being optimized in Phase 6:

- `src/features/**/api/{mutations,queries}.ts`
- `src/shared/lib/{errors,firebase-helpers,validators}.ts`

## Rationale

- This phase focuses on algorithmic logic, Firestore access patterns, edge-case handling, and type-safe API contracts.
- UI pages/components are validated through integration/E2E and lighthouse flows in later steps, but are not used as the primary gate for this refactor wave.
