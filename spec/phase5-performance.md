# Phase 5: Performance Improvements

## Goal

Fix obvious performance problems in `src/typecheck.ts`. The typechecker rebuilds large data structures on every expression, uses exceptions for control flow in hot paths, and performs redundant linear scans. These changes are purely internal — no new features, no behavior changes, all existing tests pass.

## Problems and fixes

### 1. `elabBinaryOp` rebuilds the full operator list on every call

**Where**: `elabBinaryOp` (~line 2262)

**Problem**: Every binary expression evaluation does this:
```typescript
builtinoperators                          // 5145-line array
  .concat(g.domains.flatMap(...))         // rebuild domain operators
  .concat(g.domains.map(...))             // domain = operators
  .concat(g.domains.map(...))             // domain <> operators
  .concat(g.enums.map(...))               // enum = operators
  .concat(g.enums.map(...))               // enum <> operators
  .filter(op => eqQNames(...))            // linear scan
  .sort(...)                              // sort
  .map(op => { try { ... } catch {} })    // try each
  .filter(isNotEmpty)
  .sort(...)
```

This is O(n) over thousands of operators, repeated for every `+`, `-`, `=`, `<`, `AND`, `OR`, etc. in every SQL statement. The domain/enum operators are identical across calls for the same `Global`.

**Fix**: Pre-build an operator lookup `Map<string, binaryOp[]>` keyed by normalized operator name. Build it once when `Global` is constructed (in `parseSetupScripts` or lazily on first use). `elabBinaryOp` looks up the map instead of filtering the full list.

```typescript
// New type on Global (or a derived "resolved" context)
type OperatorIndex = Map<string, binaryOp[]>;

function buildOperatorIndex(g: Global): OperatorIndex {
  const allOps = builtinoperators
    .concat(/* domain operators */)
    .concat(/* enum operators */);
  const index = new Map<string, binaryOp[]>();
  for (const op of allOps) {
    const key = normalizeOperatorName(op.name.name);  // or however the key should work
    const existing = index.get(key);
    if (existing) existing.push(op);
    else index.set(key, [op]);
  }
  return index;
}
```

### 2. `findMatchingCast` rebuilds the cast list on every call

**Where**: `findMatchingCast` (~line 382)

**Problem**: Every cast check calls:
```typescript
const casts = builtincasts.concat(
  g.domains.map(d => ({
    source: ...,
    target: { kind: "scalar", name: d.name },
    type: "assignment",
  }))
);
```

This builds a new array every time. Casts are checked during `castSimples`, which is called from `unifySimples`, which is called from almost everywhere: binary ops, function calls, insert type checks, etc.

**Fix**: Pre-build the full cast list once per `Global` and store it (or build a `Map<sourceTypeName, Cast[]>` index). This can be built at the same time as the operator index.

```typescript
type CastIndex = Map<string, Array<{ target: ScalarT; type: CastType }>>;

function buildCastIndex(g: Global): CastIndex {
  const allCasts = builtincasts.concat(/* domain casts */);
  const index = new Map();
  for (const c of allCasts) {
    const key = c.source.name.name.toLowerCase();
    const existing = index.get(key);
    if (existing) existing.push({ target: c.target, type: c.type });
    else index.set(key, [{ target: c.target, type: c.type }]);
  }
  return index;
}
```

### 3. `checkType` does a linear scan of `Object.values(BuiltinTypes)` on every call ✅ Done

**Where**: `checkType` (~line 436)

**Problem**:
```typescript
const builtintype = Object.values(BuiltinTypes)
  .map(v => v.name.name)
  .find(b => b.toLowerCase() === name);
```

This creates a new array, maps it, and does a linear scan with `.toLowerCase()` on every type lookup. `checkType` is called for every column in every table definition, every function parameter, every cast target, etc.

**Fix**: Build a `Set<string>` (or `Map`) of lowercase builtin type names once at module level:

```typescript
const builtinTypeNames = new Set(
  Object.values(BuiltinTypes).map(v => v.name.name.toLowerCase())
);

// In checkType:
if (builtinTypeNames.has(name.toLowerCase())) { ... }
```

### 4. Exception-based control flow in overload resolution ✅ Done

**Where**: `unifyOverloadedCall` (~line 315), `elabBinaryOp` (~line 2310), `elabUnaryOp` (~line 2211)

**Problem**: Overload resolution works by trying each candidate and catching the exception if it doesn't match. The code even has a comment acknowledging this: *"This is probably bad, among others for performance, as we use error handling for control flow here"*. JS exception creation captures stack traces, which is expensive — and this happens for every overload of every operator of every expression.

**Fix**: Add non-throwing variants of the cast/unify functions that return `null` (or a result-type union) on failure instead of throwing:

```typescript
function tryCastSimples(
  g: Global,
  source: SimpleT,
  target: SimpleT,
  type: CastType
): boolean {
  // Same logic as castSimples, but returns false instead of throwing
}

function tryElabAnyCall(
  g: Global,
  sourceTypes: Type[],
  targetTypes: Type[],
  nullPolicy: "CALLED ON NULL INPUT" | "STRICT"
): { nullifyResultType: boolean; score: number } | null {
  // Same logic as elabAnyCall, but returns null instead of throwing
}
```

Then `unifyOverloadedCall` and the operator resolution in `elabBinaryOp`/`elabUnaryOp` use the non-throwing variants to check candidates.

### 5. `eqQNames` does `.toLowerCase()` on every call

**Where**: `eqQNames` (~line 3209), called everywhere

**Problem**: `eqQNames` is the most-called utility function in the typechecker. Every call does:
```typescript
u.name.toLowerCase() === v.name.toLowerCase()
```
plus conditional `.toLowerCase()` on schemas. When scanning arrays of tables, operators, or casts via `.find()` or `.filter()`, this runs many times per element.

**Fix**: Two options (pick one or both):
- **Normalize names eagerly**: Ensure all names stored in `Global`, `builtinoperators`, `builtincasts`, etc. are already lowercased. Then `eqQNames` can use direct `===` comparison.
- **Use Map lookups instead of linear scans**: Most uses of `eqQNames` are inside `.find()` or `.filter()` on arrays — replace these with Map lookups (which is mostly achieved by fixes 1-3 above).

The first approach is simpler and has the broadest impact. Normalize type names at ingestion time (in `parseSetupScripts`, `mkType`, the builtin arrays) so that string comparison in `eqQNames` is just `===`.

## Implementation order

1. **Builtin type name Set** (fix 3) — smallest change, easy win
2. **Pre-built cast index** (fix 2) — medium change, high impact since casts are checked constantly
3. **Pre-built operator index** (fix 1) — largest data structure, biggest win for complex queries
4. **Non-throwing overload resolution** (fix 4) — requires new function variants, moderate refactor
5. **Normalize names eagerly** (fix 5) — can be done incrementally alongside the others

Fixes 1-3 are independent and could be done in any order. Fix 5 pairs well with 1-3 since the indexes benefit from normalized keys. Fix 4 is independent of the rest.

## Approach: `ResolvedGlobal`

Rather than mutating `Global`, introduce a `ResolvedGlobal` type (or just add optional cached fields to `Global`) that holds pre-computed indexes. Build it once after `parseSetupScripts` returns:

```typescript
type ResolvedGlobal = Global & {
  readonly operatorIndex: Map<string, binaryOp[]>;
  readonly castIndex: Map<string, Array<{ target: ScalarT; type: CastType }>>;
};

function resolveGlobal(g: Global): ResolvedGlobal {
  return {
    ...g,
    operatorIndex: buildOperatorIndex(g),
    castIndex: buildCastIndex(g),
  };
}
```

All `elab*` functions change their `g: Global` parameter to `g: ResolvedGlobal`. The public API (`doCreateFunction`, `parseSetupScripts`) either accepts `ResolvedGlobal` or calls `resolveGlobal` internally.

## Files to modify

| File | Changes |
|---|---|
| `src/typecheck.ts` | Add `ResolvedGlobal`, `buildOperatorIndex`, `buildCastIndex`, `resolveGlobal`. Add non-throwing cast/unify variants. Update `elabBinaryOp`, `elabUnaryOp`, `findMatchingCast`, `checkType`, `unifyOverloadedCall`. |
| `src/builtincasts.ts` | No changes (data stays the same) |
| `src/builtinoperators.ts` | No changes (data stays the same) |
| `src/cli.ts` | Call `resolveGlobal` after `parseSetupScripts` |

## What stays the same

- All public types (`Type`, `SimpleT`, `RecordT`, `Global`, etc.)
- All error classes and error messages
- All test behavior — pure refactor, no semantic changes
- `builtincasts.ts`, `builtinoperators.ts`, `builtinunaryoperators.ts` data files

## Verification

1. `npm test` — all existing tests pass with identical results
2. Optional: add a simple benchmark (typecheck N functions, measure wall time) before and after to confirm improvement. Not required for correctness.
