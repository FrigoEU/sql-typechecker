# SQL Typechecker: Migration & Feature Roadmap

## Overview

This spec describes four phases of work to evolve the SQL typechecker:

1. **[Phase 1: Parser Migration](./phase1-parser-migration.md)** - Replace `trader-pgsql-ast-parser` with `libpg-query` (the actual PostgreSQL C parser via WASM)
2. **[Phase 2: PL/pgSQL Support](./phase2-plpgsql.md)** - Typecheck `LANGUAGE plpgsql` function bodies
3. **[Phase 3: Parameter Inference](./phase3-parameter-inference.md)** - Infer types of `$1`, `$2`, etc. from query context
4. **[Phase 4: Autocomplete / LSP](./phase4-autocomplete.md)** - Type-aware SQL autocompletions

## Phase dependencies

```
Phase 1 (parser migration)
  |
  ├──> Phase 2 (PL/pgSQL) - needs libpg-query's parsePlPgSQL
  |
  └──> Phase 3 (parameter inference) - needs ParamRef handling
          |
          └──> Phase 4 (autocomplete) - builds on diagnostic accumulation from Phase 3
```

Phases 2 and 3 are independent of each other and can be done in either order. Phase 4 depends on the diagnostic accumulation work partially done in Phase 3.

Each phase is independently shippable.

## Current architecture

The typechecker is ~3200 lines (`src/typecheck.ts`) with supporting modules:

- **Type system**: `SimpleT` (Scalar, Nullable, Array, JsonKnown, AnyScalar), `RecordT`, `VoidT`
- **Global context**: tables, views, domains, enums (built from DDL via `parseSetupScripts`)
- **Lexical context**: `Context` with `froms` (table scopes) and `decls` (variable bindings)
- **Core functions**: `elabExpr`, `elabSelect`, `elabInsert`, `elabDeleteOrUpdate`, `elabCall`, `elabBinaryOp`, `elabUnaryOp`
- **Supporting modules**: `builtincasts.ts` (279 lines), `builtinoperators.ts` (5145 lines), `builtinunaryoperators.ts` (291 lines), `normalize.ts` (45 lines), `codegen.ts` (496 lines), `cli.ts` (311 lines)
- **Tests**: `test/test.ts` (2667 lines, 100+ test cases, Node.js test runner)

## Key architectural principle

The core typechecker should be **policy-free**: it infers types and reports errors, with no opinions about nullability conventions, unused parameter checks, etc. The current `doCreateFunction` pipeline (with its `DEFAULT NULL` convention, return type checking, unused arg detection) becomes one *consumer* of the core. Other consumers (query inference, migration validation, LSP) use the same core with different policy.
