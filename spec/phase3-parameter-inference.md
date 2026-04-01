# Phase 3: Parameter Type Inference

## Goal

Infer the types of `$1`, `$2`, etc. from how they're used in a SQL query. Expose a new API for typechecking bare SQL queries (not just CREATE FUNCTION bodies).

Currently, `ParamRef` nodes hit `notImplementedYet` in `elabExpr`.

## Prerequisites

- Phase 1 complete (ParamRef nodes are available from the libpg_query AST)
- Independent of Phase 2

## New API

```typescript
type ParamInfo = {
  index: number;     // 1-based ($1, $2, ...)
  type: SimpleT;
  locations: number[]; // byte offsets where this param appears
};

type ColumnInfo = {
  name: string | null;
  type: SimpleT;
};

type Diagnostic = {
  location: number | null;
  message: string;
  severity: "error" | "warning";
};

type InferredQuery = {
  params: ParamInfo[];
  columns: ColumnInfo[];
  diagnostics: Diagnostic[];
};

// Main entry point for embedded SQL typechecking
function infer(global: Global, sql: string): InferredQuery;
```

This separates the **type inference engine** from the **policy layer**. The existing `doCreateFunction` pipeline remains a separate consumer with its own conventions.

## Approach: Constraint collection

Rather than modifying the unification engine to support first-class type variables (which would be a deep change), use a constraint-based approach:

### Step 1: Typecheck with parameters as AnyScalar

When `elabExpr` encounters a `ParamRef`:
1. Look up the param index in a `Map<number, ParamSlot>`
2. If not yet seen, create a new slot and return `AnyScalar`
3. If already seen, return the currently inferred type (or `AnyScalar` if unconstrained)

```typescript
type ParamSlot = {
  index: number;
  constraints: { type: SimpleT; location: number }[];
  resolved: SimpleT | null;
};
```

### Step 2: Collect constraints from context

When a parameter is used in a constraining position, record the constraint:

- `WHERE id = $1` and `id: integer` -> constraint: `$1 must be castable to integer`
- `INSERT INTO t (name) VALUES ($1)` and `name: text` -> constraint: `$1 assignable to text`
- `$1 + 5` -> constraint: `$1 must be numeric` (from operator resolution)
- `CAST($1 AS integer)` -> constraint: `$1 castable to integer`

Constraints are collected during the normal typechecking pass. The key integration points:

1. **Binary operators**: When resolving `elabBinaryOp` and one side is a param, the other side's type constrains it
2. **Function calls**: When resolving `elabCall`, expected argument types constrain params
3. **INSERT VALUES**: When `castSimples` is called for insert assignment, the column type constrains the param
4. **UPDATE SET**: Same as INSERT
5. **Cast expressions**: The target type constrains the param
6. **IN lists**: The left side constrains all params in the right side list

### Step 3: Resolve constraints

After typechecking completes:
1. For each param, unify all constraints
2. If constraints conflict -> diagnostic error
3. If no constraints -> diagnostic warning ("unconstrained parameter")
4. If exactly one constraint -> resolved type
5. If multiple compatible constraints -> unified (most specific) type

## Integration with existing typechecker

The constraint collection needs to be threaded through the existing `elab*` functions. Options:

**Option A: Mutable context** - Add a `params: Map<number, ParamSlot>` to `Context`. The `elab*` functions already receive `Context`, so this is minimally invasive.

**Option B: Separate collector** - Thread a `ParamCollector` alongside the existing args. More explicit but requires changing many function signatures.

**Recommended: Option A.** Add `params` to `Context` as an optional field. When present, `elabExpr` records param constraints. When absent (e.g., in `doCreateFunction`), parameters still hit `notImplementedYet` (preserving existing behavior).

## Error accumulation

The `infer` API should not throw on the first error. Instead, collect diagnostics:

```typescript
function infer(global: Global, sql: string): InferredQuery {
  const diagnostics: Diagnostic[] = [];
  const params = new Map<number, ParamSlot>();
  const context: Context = { froms: [], decls: [], params };

  try {
    const ast = parseSync(sql);
    const resultType = elabStatement(global, context, ast[0]);
    // ... extract columns from resultType
  } catch (err) {
    if (err instanceof ErrorWithLocation) {
      diagnostics.push({
        location: err.l?.start ?? null,
        message: err.message,
        severity: "error",
      });
    }
  }

  // Resolve param constraints
  const resolvedParams = resolveParams(params, diagnostics);

  return { params: resolvedParams, columns, diagnostics };
}
```

For Phase 3, we only need error accumulation at the top level (catch the first error). Full diagnostic accumulation (continue typechecking after errors) is Phase 4 work.

## Files to modify

| File | Changes |
|---|---|
| `src/typecheck.ts` | Handle `ParamRef` in `elabExpr`. Add `ParamSlot` type. Add constraint recording at key points (binary ops, function calls, insert, update, cast). Add `infer()` export. Optionally add `params` to `Context`. |
| `src/pg-ast.ts` | Ensure `ParamRef` helpers exist (should already from Phase 1) |
| `test/test.ts` or `test/test-infer.ts` (new) | Parameter inference tests |

## Testing strategy

### Simple inference
```sql
SELECT * FROM users WHERE id = $1
-- $1: integer (from users.id)

SELECT * FROM users WHERE name = $1 AND age = $2
-- $1: text, $2: integer

INSERT INTO users (name, age) VALUES ($1, $2)
-- $1: text, $2: integer
```

### Operators and expressions
```sql
SELECT * FROM users WHERE age > $1 + 5
-- $1: numeric-compatible

SELECT * FROM users WHERE created_at > $1
-- $1: timestamp (or compatible)
```

### Multiple consistent uses
```sql
SELECT * FROM users WHERE id = $1 OR id = $1
-- $1: integer (consistent)
```

### Conflicting constraints
```sql
SELECT * FROM users WHERE id = $1 AND name = $1
-- Error: $1 constrained to both integer and text
```

### Unconstrained parameters
```sql
SELECT $1
-- Warning: cannot infer type of $1
```

### Nullable context
```sql
SELECT * FROM users WHERE name = $1
-- $1: text (or text | null depending on column nullability)
```

### Subqueries
```sql
SELECT * FROM users WHERE id IN (SELECT user_id FROM orders WHERE total > $1)
-- $1: numeric (from orders.total)
```

## Future considerations

- **Named parameters**: Some frameworks use `:name` instead of `$N`. This could be a thin mapping layer on top.
- **Parameter count validation**: Verify that $1..$N are contiguous (no gaps like $1, $3 without $2).
- **Default types**: When a parameter is unconstrained, should it default to `text` (PostgreSQL's behavior for untyped literals) or be an error?
