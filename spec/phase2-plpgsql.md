# Phase 2: PL/pgSQL Support

## Goal

Typecheck `CREATE FUNCTION ... LANGUAGE plpgsql` function bodies. Currently these hit `notImplementedYet` at `typecheck.ts:1464`.

## Prerequisites

- Phase 1 complete (libpg-query available, which exposes `parsePlPgSQLSync`)

## Background

PL/pgSQL functions contain a mix of procedural control flow and embedded SQL. The typechecker needs to:
1. Parse the PL/pgSQL body into its own AST (separate from the SQL AST)
2. Walk the PL/pgSQL AST, maintaining a variable scope
3. For each embedded SQL expression/statement, delegate to the existing `elabExpr`/`elabSelect`

### PL/pgSQL AST structure

libpg_query's `parsePlPgSQL` returns a tree of `PLpgSQL_stmt_*` nodes. Key node types:

- `PLpgSQL_stmt_block` - BEGIN...END block with declarations
- `PLpgSQL_stmt_assign` - variable := expression
- `PLpgSQL_stmt_if` - IF/ELSIF/ELSE
- `PLpgSQL_stmt_loop` / `PLpgSQL_stmt_while` / `PLpgSQL_stmt_fori` / `PLpgSQL_stmt_fors`
- `PLpgSQL_stmt_return` - RETURN expression
- `PLpgSQL_stmt_return_query` - RETURN QUERY select
- `PLpgSQL_stmt_raise` - RAISE NOTICE/EXCEPTION
- `PLpgSQL_stmt_execsql` - embedded SQL (SELECT, INSERT, etc.)
- `PLpgSQL_stmt_perform` - PERFORM query
- `PLpgSQL_stmt_dynexecute` - EXECUTE dynamic SQL
- `PLpgSQL_var` - variable declaration
- `PLpgSQL_row` / `PLpgSQL_rec` - composite variable types

## Constructs to handle

| Construct | Typechecking behavior |
|---|---|
| `DECLARE x integer;` | Add `x: integer` to Context.decls |
| `DECLARE x integer := expr;` | Typecheck expr, cast to integer, add to context |
| `DECLARE x table%ROWTYPE;` | Look up table in Global, add record type to context |
| `DECLARE x column%TYPE;` | Look up column type, add to context |
| `x := expr;` | Typecheck expr, cast to x's declared type |
| `IF condition THEN ... ELSIF ... ELSE ... END IF;` | Require boolean condition(s), typecheck all branches |
| `RETURN expr;` | Typecheck expr, unify with function's declared return type |
| `RETURN QUERY select_stmt;` | Typecheck select, unify result record with return type |
| `RETURN NEXT expr;` | Typecheck expr, unify with return type element |
| `FOR x IN query LOOP ... END LOOP;` | Typecheck query, bind loop variable to result type |
| `FOR x IN low..high LOOP ... END LOOP;` | Bind x as integer |
| `FOREACH x IN ARRAY arr LOOP ... END LOOP;` | Typecheck arr as array, bind x to element type |
| `WHILE condition LOOP ... END LOOP;` | Require boolean condition |
| `RAISE NOTICE 'format', arg1, arg2;` | Typecheck args (format string validation is stretch goal) |
| `PERFORM query;` | Typecheck query, discard result |
| `EXECUTE dynamic_sql;` | Cannot typecheck statically - skip with warning |
| `EXECUTE dynamic_sql INTO x;` | Skip SQL check, but validate x exists in scope |
| `BEGIN ... EXCEPTION WHEN ... THEN ... END;` | Typecheck all branches |
| `GET DIAGNOSTICS x = ROW_COUNT;` | Validate x is integer-compatible |

## Architecture

### New function: `elabPlPgSQL`

```typescript
function elabPlPgSQL(
  g: Global,
  c: Context,
  body: PlPgSQLBlock,
  returnType: SimpleT | RecordT | VoidT
): void {
  // Walk PLpgSQL AST
  // Maintain variable scope via Context
  // Delegate SQL expressions to elabExpr/elabSelect
  // Validate RETURN statements against declared return type
}
```

### Variable scoping

PL/pgSQL has block-level scoping. Each `BEGIN...END` block can introduce new variables that shadow outer ones. Model this by creating a new `Context` for each block:

```typescript
// Entering a DECLARE block:
const blockContext = {
  ...parentContext,
  decls: parentContext.decls.concat(
    declaredVars.map(v => ({ name: v.name, type: v.type }))
  ),
};
```

This matches the existing Context pattern used for function parameters.

### Embedded SQL handling

PL/pgSQL embeds SQL in several ways:
- `PLpgSQL_stmt_execsql` contains a full SQL statement string
- Assignment RHS (`x := (SELECT ...)`) contains SQL expressions
- `RETURN QUERY` contains a SELECT statement

For each embedded SQL fragment:
1. Parse it with `parseSync` (the SQL parser, not PL/pgSQL parser)
2. Typecheck with `elabStatement` or `elabExpr` using the current PL/pgSQL context
3. PL/pgSQL variables should be resolvable as refs in the SQL context

### INTO clause handling

PL/pgSQL allows `SELECT ... INTO x, y` to assign query results to variables. This needs special handling:
1. Typecheck the SELECT
2. Match result columns to target variables
3. Cast each column type to the variable's declared type

## Files to modify

| File | Changes |
|---|---|
| `src/typecheck.ts` | Add `elabPlPgSQL` and supporting functions. Modify `doCreateFunction` to dispatch to `elabPlPgSQL` when `language === "plpgsql"`. |
| `src/pg-ast.ts` | Add helpers for navigating PL/pgSQL AST nodes |
| `test/test.ts` | Add PL/pgSQL test cases |

## Testing strategy

### Basic tests
- Simple RETURN with arithmetic
- Variable declaration and assignment
- IF/ELSE branching
- RETURN QUERY with SELECT

### Type checking tests
- Assignment type mismatch (assigning text to integer variable)
- RETURN type mismatch
- Using undeclared variable
- Variable shadowing in nested blocks

### SQL interaction tests
- PL/pgSQL variable used in SQL WHERE clause
- SELECT INTO with type checking
- PERFORM with type checking
- RETURN QUERY with table joins

### Control flow tests
- FOR loop with query
- FOR loop with integer range
- WHILE loop
- FOREACH with array
- Nested blocks with variable scoping

### Edge cases
- EXECUTE dynamic SQL (should produce warning, not error)
- EXCEPTION handlers
- %ROWTYPE and %TYPE variable declarations
- OUT parameters

## Stretch goals

- Format string validation for RAISE (check that number of `%` placeholders matches number of args)
- Unreachable code detection after unconditional RETURN
- FOUND variable (automatically available boolean after queries)
