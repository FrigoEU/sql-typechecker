# Phase 4: Autocomplete / LSP Support

## Goal

Provide type-aware SQL autocompletions. Expose a `completions_at(global, sql, offset) -> CompletionItem[]` API that can power an LSP server or editor plugin.

## Prerequisites

- Phase 1 complete (libpg-query parser)
- Phase 3 partially complete (diagnostic accumulation pattern established)

## Core approach: Placeholder insertion

1. Receive the SQL string and cursor byte offset
2. Analyze tokens around the cursor to determine context
3. Insert `__placeholder__` identifier at the cursor position
4. Parse the modified SQL with `parseSync`
5. If parse succeeds: typecheck, find the type/context at the placeholder, return completions
6. If parse fails: fall back to heuristic completions

### Why placeholder insertion

- Avoids needing a second error-recovering parser (like tree-sitter)
- Leverages the existing typechecker for type-aware completions
- Works for the most common completion scenarios (after `.`, in WHERE, in SELECT)
- Simple to implement and reason about

### Limitations

- Doesn't work when the SQL is so broken that even with a placeholder it can't parse
- Some cursor positions are ambiguous (e.g., between two clauses)
- Heuristic fallback needed for those cases

## Completion contexts

| Context | How to detect | What to return |
|---|---|---|
| After `alias.` | `__placeholder__` resolves as a `ColumnRef` with table qualifier | Fields of the referenced table/view/CTE |
| After `FROM` / `JOIN` | `__placeholder__` appears in `fromClause` as a `RangeVar` | Table and view names from `Global` |
| After `WHERE` / `AND` / `OR` | `__placeholder__` in `whereClause` | Column names from all FROM tables + table aliases |
| After `SELECT` | `__placeholder__` in `targetList` | Column names + table aliases + `*` |
| After `ORDER BY` | `__placeholder__` in `sortClause` | Column names + aliases from SELECT list |
| After `GROUP BY` | `__placeholder__` in `groupClause` | Column names from FROM tables |
| After `INSERT INTO t (` | `__placeholder__` in column list | Columns of the target table |
| After `SET` (UPDATE) | `__placeholder__` in `targetList` | Columns of the target table |
| Function arguments | `__placeholder__` in `FuncCall.args` | Suggest based on expected arg types (stretch) |
| After `::` (cast) | `__placeholder__` is a `TypeName` | Available type names (builtins + domains + enums) |

## API

```typescript
type CompletionItem = {
  label: string;           // what to insert
  kind: CompletionKind;    // column, table, type, function, keyword
  detail?: string;         // type information (e.g., "integer", "text | null")
  sortText?: string;       // for ordering
};

type CompletionKind = "column" | "table" | "view" | "type" | "function" | "keyword";

function completionsAt(
  global: Global,
  sql: string,
  offset: number
): CompletionItem[];
```

## Implementation

### Step 1: Cursor context analysis

Before inserting the placeholder, do a quick lexical analysis of tokens around the cursor:

```typescript
function getCursorContext(sql: string, offset: number): CursorContext {
  const before = sql.substring(0, offset).trimEnd();

  if (before.endsWith('.')) return { kind: 'dot_access', prefix: extractAliasBefore(before) };
  if (/\bFROM\s*$/i.test(before)) return { kind: 'from_clause' };
  if (/\bJOIN\s*$/i.test(before)) return { kind: 'from_clause' };
  if (/\bSELECT\s*$/i.test(before)) return { kind: 'select_list' };
  // ... etc

  return { kind: 'expression' }; // default
}
```

This pre-analysis helps in two ways:
1. Guides placeholder insertion (e.g., after `.`, insert just the placeholder; after `FROM`, insert it as a table name)
2. Provides fallback when parsing fails

### Step 2: Placeholder insertion and parsing

```typescript
function insertPlaceholder(sql: string, offset: number, context: CursorContext): string {
  const placeholder = '__placeholder__';
  return sql.substring(0, offset) + placeholder + sql.substring(offset);
}
```

### Step 3: Typecheck in lenient mode

The typechecker needs a "lenient" mode where errors are collected, not thrown. When an error occurs:
1. Record it as a diagnostic
2. Return an `unknown`/`AnyScalar` type for the failing node
3. Continue typechecking

This is needed because:
- The SQL with placeholder may have type errors elsewhere
- We only care about the type context at the placeholder location
- Other errors shouldn't prevent completions from working

### Step 4: Position-to-type map

During typechecking, record a `Map<number, TypeContext>` mapping byte offsets to their resolved context:

```typescript
type TypeContext = {
  type: Type;
  scope: Context;  // what's in scope at this point
  parent: "select_list" | "where_clause" | "from_clause" | "function_arg" | "other";
};
```

When the placeholder's location is found in this map, use it to generate completions.

### Step 5: Generate completions

Based on the `TypeContext` at the placeholder location:

```typescript
function generateCompletions(
  global: Global,
  typeContext: TypeContext,
  cursorContext: CursorContext
): CompletionItem[] {
  switch (cursorContext.kind) {
    case 'dot_access':
      // Find the table/alias, return its columns with types
      return typeContext.scope.froms
        .filter(f => f.name.name === cursorContext.prefix)
        .flatMap(f => f.type.fields.map(field => ({
          label: field.name?.name ?? '?',
          kind: 'column',
          detail: showType(field.type),
        })));

    case 'from_clause':
      return [
        ...global.tables.map(t => ({ label: showQName(t.name), kind: 'table' as const })),
        ...global.views.map(v => ({ label: showQName(v.name), kind: 'view' as const })),
      ];

    // ... other cases
  }
}
```

## Lenient typechecking mode

This is the most significant architectural change. Options:

**Option A: Try/catch at each elab call.** Wrap each recursive `elab*` call in try/catch. On error, return `AnyScalar` and continue. Simple but coarse.

**Option B: Result type.** Change `elab*` functions to return `Result<Type, Diagnostic>`. Most invasive but most correct.

**Option C: Error boundary pattern.** Add an `onError` callback to the context. The `elab*` functions call it instead of throwing, then return `AnyScalar`. The callback collects diagnostics.

**Recommended: Option A** for initial implementation. It's the least invasive and good enough for completions. Can be refined to Option C later if needed.

```typescript
function elabExprLenient(g: Global, c: Context, e: Node, diagnostics: Diagnostic[]): Type {
  try {
    return elabExpr(g, c, e);
  } catch (err) {
    if (err instanceof ErrorWithLocation) {
      diagnostics.push({ location: err.l?.start ?? null, message: err.message, severity: "error" });
    }
    return AnyScalar;
  }
}
```

## Files to create/modify

| File | Changes |
|---|---|
| `src/completions.ts` (new) | `completionsAt()`, cursor context analysis, placeholder insertion, completion generation |
| `src/typecheck.ts` | Add optional position-to-type recording. Export `elabExprLenient` or add lenient mode flag. |
| `test/test-completions.ts` (new) | Completion tests |
| `src/lsp.ts` (new, optional) | LSP server wiring using `vscode-languageserver` (if building a proper LSP) |

## Testing strategy

### Column completion
```
SELECT u.| FROM users u
-- Expect: columns of users table (id, name, email, ...)

SELECT * FROM users u WHERE u.|
-- Expect: columns of users table
```

### Table completion
```
SELECT * FROM |
-- Expect: all tables and views

SELECT * FROM users u JOIN |
-- Expect: all tables and views
```

### Column in WHERE
```
SELECT * FROM users u WHERE |
-- Expect: columns from users + table alias "u"
```

### JOIN columns
```
SELECT * FROM users u JOIN orders o ON u.id = o.|
-- Expect: columns of orders table
```

### Scoping in subqueries
```
SELECT * FROM users u WHERE u.id IN (SELECT | FROM orders o)
-- Expect: columns of orders (not users, since this is a subquery scope)
```

### Graceful degradation
```
SELECT * FROM |  WHERE
-- Even with broken SQL, should still offer table names after FROM
```

## Stretch goals

- **Signature help**: When cursor is inside function arguments, show expected argument types
- **Hover information**: Given a position, return the type of the expression at that position (useful for editor hover tooltips)
- **Go to definition**: Given a column reference, return the table/view where it's defined
- **Rename symbol**: Rename a table alias and all its references
- **Full LSP server**: Package as a proper LSP server with `vscode-languageserver`, supporting diagnostics, completions, hover, and go-to-definition
