# Phase 1: Migrate to Official PostgreSQL Parser

## Goal

Replace `trader-pgsql-ast-parser` with `libpg-query` (WASM-based, wraps the actual PostgreSQL C parser via libpg_query). All 100+ existing tests pass. No new features - pure parser swap.

## Motivation

- `trader-pgsql-ast-parser` is a JS reimplementation with known gaps (can't parse `LEFT()`/`RIGHT()` functions, bugs noted in comments, incomplete SQL support)
- `libpg-query` wraps the real PostgreSQL parser - correct and complete by definition
- Same protobuf AST as `pg_query.rs`, making a future Rust migration straightforward
- Unlocks Phase 2 (PL/pgSQL) which requires `parsePlPgSQL`

## Dependencies

- `libpg-query` (or `pgsql-parser`) - core parser
- `@pgsql/types` - TypeScript types for the protobuf AST
- `@pgsql/enums` - enum constants (e.g., `A_Expr_Kind`, `BoolExprType`, `SetOperation`)

## Architecture: AST adapter module

Create `src/pg-ast.ts` that:
1. Re-exports `parseSync`/`deparseSync` from the parser package
2. Defines internal `Name` and `QName` types (currently imported from `trader-pgsql-ast-parser`)
3. Provides utility functions for navigating the protobuf AST:
   - Extracting operator names from `A_Expr.name` (which is a list of `String` nodes)
   - Unwrapping `Node` wrappers to get concrete node types
   - Converting `ColumnRef.fields` to table/column name pairs
   - Extracting type names from `TypeName` nodes

The `elab*` functions in `typecheck.ts` are rewritten to pattern-match on the new AST directly. No intermediate "convert new AST to old AST" translation layer.

## AST mapping reference

### Statement types

| Current (trader-pgsql-ast-parser) | New (libpg_query protobuf) |
|---|---|
| `s.type === "select"` | `SelectStmt` node |
| `s.type === "union"` / `"union all"` | `SelectStmt` with `op: SETOP_UNION`, `all: true/false` |
| `s.type === "values"` | `SelectStmt` with `valuesLists` populated |
| `s.type === "with"` | `SelectStmt` with `withClause` |
| `s.type === "with recursive"` | `SelectStmt` with `withClause.recursive = true` |
| `s.type === "insert"` | `InsertStmt` node |
| `s.type === "update"` | `UpdateStmt` node |
| `s.type === "delete"` | `DeleteStmt` node |
| `s.type === "create table"` | `CreateStmt` node |
| `s.type === "create view"` | `ViewStmt` node |
| `s.type === "create materialized view"` | `CreateTableAsStmt` with `objtype: OBJECT_MATVIEW` |
| `s.type === "create function"` | `CreateFunctionStmt` node |
| `s.type === "alter table"` | `AlterTableStmt` node |
| `s.type === "create domain"` | `CreateDomainStmt` node |
| `s.type === "create enum"` | `CreateEnumStmt` node |

### Expression types

| Current | New |
|---|---|
| `e.type === "ref"` with `e.name`, `e.table` | `ColumnRef` with `fields` (list of `String`/`A_Star` nodes) |
| `e.type === "binary"` with `e.op`, `e.left`, `e.right` | `A_Expr` with `kind`, `name`, `lexpr`, `rexpr` |
| `e.type === "unary"` with `e.op === "NOT"` | `BoolExpr` with `boolop: NOT_EXPR` |
| `e.type === "unary"` with `e.op === "IS NULL"` | `NullTest` with `nulltesttype: IS_NULL` |
| `e.type === "unary"` with `e.op === "IS NOT NULL"` | `NullTest` with `nulltesttype: IS_NOT_NULL` |
| `e.type === "unary"` (other ops like `-`, `@`, `~`) | `A_Expr` with `kind: AEXPR_OP` and single operand |
| `e.type === "call"` with `e.function`, `e.args` | `FuncCall` with `funcname`, `args` |
| `e.type === "cast"` with `e.operand`, `e.to` | `TypeCast` with `arg`, `typeName` |
| `e.type === "integer"` | `A_Const` with `ival` |
| `e.type === "string"` | `A_Const` with `sval` |
| `e.type === "numeric"` | `A_Const` with `fval` (string representation) |
| `e.type === "boolean"` | `A_Const` with `boolval` |
| `e.type === "null"` | `A_Const` with `isnull: true` |
| `e.type === "parameter"` | `ParamRef` with `number` |
| `e.type === "list"` / `"array"` | `A_ArrayExpr` / row constructor |
| `e.type === "case"` | `CaseExpr` with `args` (list of `CaseWhen`), `defresult` |
| `e.type === "member"` (JSON access) | Operator expression (`->`, `->>`) |
| `e.type === "arrayIndex"` | `A_Indirection` with `A_Indices` |
| `e.type === "extract"` | `FuncCall` to `extract` or dedicated node |
| `e.type === "ternary"` (BETWEEN) | `A_Expr` with `kind: AEXPR_BETWEEN` |
| `e.type === "substring"` / `"overlay"` | `FuncCall` or dedicated nodes |
| `e.type === "keyword"` (current_date etc.) | `SQLValueFunction` with `op` enum |
| `e.type === "array select"` | `SubLink` with `subLinkType: ARRAY_SUBLINK` |
| `e.type === "default"` | `SetToDefault` node |
| AND/OR (currently binary ops) | `BoolExpr` with `boolop: AND_EXPR` / `OR_EXPR` |
| `IN` / `NOT IN` (currently binary ops) | `A_Expr` with `kind: AEXPR_IN` |

### FROM clause types

| Current | New |
|---|---|
| `f.type === "table"` with `f.name` | `RangeVar` with `relname`, `schemaname`, `alias` |
| `f.type === "statement"` with `f.statement`, `f.alias` | `RangeSubselect` with `subquery`, `alias` |
| `f.type === "call"` | `RangeFunction` |
| JOIN handling via `f.join.type`, `f.join.on` | `JoinExpr` with `jointype` enum, `quals` |
| `f.lateral` flag | `RangeSubselect.lateral` or `RangeFunction.lateral` |

### Other structural differences

- **Selected columns**: `SelectedColumn` with `.expr`, `.alias` becomes `ResTarget` with `.val`, `.name`
- **Insert columns**: Column name list becomes `ResTarget` nodes in `InsertStmt.cols`
- **UPDATE SET**: `{column, value}` pairs become `ResTarget` nodes in `UpdateStmt.targetList`
- **Function arguments**: `CreateFunctionStmt` uses `FunctionParameter` nodes
- **DataTypeDef**: Becomes `TypeName` with `names` (list of String nodes) and `arrayBounds`
- **Table constraints**: `Constraint` nodes with `contype` enum
- **toSql.expr()** in error messages: Replace with `deparseSync` or custom formatter

## Files to modify

| File | Changes |
|---|---|
| `package.json` | Replace `trader-pgsql-ast-parser` with `libpg-query`, `@pgsql/types`, `@pgsql/enums` |
| `src/pg-ast.ts` (new) | AST helpers, internal `Name`/`QName` types, re-export parse/deparse |
| `src/typecheck.ts` | Rewrite all `elab*` functions against new AST. Type system unchanged. |
| `src/normalize.ts` | Remove `BinaryOperator` import. Operator normalization logic stays. |
| `src/codegen.ts` | Replace `Name`/`QName` imports with internal types |
| `src/cli.ts` | Replace `parse` import, update statement type checks |
| `test/test.ts` | Replace `parse`/`Name`/`QName` imports, update `testCreateFunction` |

## What stays the same

- The entire type system: `SimpleT`, `RecordT`, `Type`, `ScalarT`, `NullableT`, `ArrayT`, `JsonKnownT`, `AnyScalarT`, `VoidT`
- `Global` and `Context` types
- All unification logic: `unify`, `unifySimples`, `unifyRecords`, `cast`, `castSimples`, `castScalars`
- All builtin definitions: `builtincasts.ts`, `builtinoperators.ts`, `builtinunaryoperators.ts` (these reference the internal type system, not the parser AST)
- `BuiltinTypes`, `BuiltinTypeConstructors`
- `nullify`, `unnullify`, `nullifyRecord`, `nullifyArray`
- All error classes (though `toSql.expr()` calls in error messages need updating)
- `codegen.ts` logic (only imports change)
- `typeparsers.ts` (no parser dependency)
- `interval.ts` (no parser dependency)

## What to mark as "TODO: human review"

- New expression/statement node types in the protobuf AST that have no current handler (add `notImplementedYet` with a comment)
- `ParamRef` - leave as `notImplementedYet` (Phase 3 handles this)
- PL/pgSQL function bodies - leave as `notImplementedYet` (Phase 2)
- Any behavioral differences discovered during testing

## Risk: sync vs async parsing

The old `parse()` is synchronous. `libpg-query` provides both async and sync variants. Use `parseSync` (or `parsePlPgSQLSync`) to avoid cascading async changes through the entire codebase. Verify that `pgsql-parser` also exposes sync methods if using that package instead.

## Verification

1. `npm test` - all 100+ existing tests pass
2. `npm run start` - sample pipeline produces same output
3. `npm run extendedexample` - extended example produces same output
4. Manually test a few SQL statements that the old parser couldn't handle
