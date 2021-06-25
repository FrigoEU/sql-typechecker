import {
  parse,
  toSql,
  Statement,
  // astVisitor,
  NodeLocation,
  QName,
  Name,
  DataTypeDef,
  SelectFromStatement,
  PGNode,
  From,
  CreateTableStatement,
  CreateViewStatement,
  AlterTableStatement,
  SelectStatement,
  Expr,
  CreateFunctionStatement,
  CreateMaterializedViewStatement,
  ColumnConstraint,
  SelectedColumn,
  ExprParameter,
  ExprRef,
  ExprBinary,
  ExprNull,
} from "pgsql-ast-parser";

export type Type = SimpleT | SetT | UnifVar;
export type SimpleT = {
  kind: "simple";
  name: QName;
  typevar: null | SimpleT | UnifVar;
};
export type UnknownT = {
  kind: "unknown";
};
type Field = {
  name: Name | null;
  type: SimpleT | UnifVar;
};
export type SetT = {
  kind: "set";
  fields: Field[];
};
export type unifvarId = number;
export type UnifVar = {
  kind: "unifvar";
  id: unifvarId;
};

const BuiltinTypes = {
  Boolean: {
    kind: "simple",
    name: { name: "bool" },
    typevar: null,
  },
  Smallint: {
    kind: "simple",
    name: { name: "smallint" },
    typevar: null,
  },
  Integer: {
    kind: "simple",
    name: { name: "integer" },
    typevar: null,
  },
  Bigint: {
    kind: "simple",
    name: { name: "bigint" },
    typevar: null,
  },
  String: {
    kind: "simple",
    name: { name: "text" },
    typevar: null,
  },
  // Any: {
  //   kind: "simple",
  //   name: { name: "any" },
  //   typevar: null,
  // },
} as const;

const BuiltinTypeConstructors = {
  Nullable: (t: SimpleT): SimpleT => ({
    kind: "simple",
    name: { name: "nullable", schema: "" },
    typevar: t,
  }),
  Array: (t: SimpleT): SimpleT => ({
    kind: "simple",
    name: { name: "array", schema: "pg_catalog" },
    typevar: t,
  }),
} as const;

export type Global = {
  readonly tables: ReadonlyArray<{
    readonly name: QName;
    readonly rel: SetT;
    readonly defaults: Name[];
  }>;
  readonly views: ReadonlyArray<{
    readonly name: QName;
    readonly rel: SetT;
  }>;
};

// In UrWeb, unification variables are implemented as ref's. This is I think because you can introduce these anywhere, and reference them anywhere, so it becomes very hard to keep them up-to-date in the whole context. In SQL however, you cant just introduce new free variables. You can only do this at the statement level for prepared statements, or in a CREATE FUNCTION statement, and neither can be nested. So you can have a single "global" array of these free variables that always contains the most recent "judgement" of what type these parameters should be.
// Parameters are scoped differently from the context though: In the context we add things for example when going through a "FROM" using lexical scoping. Once the scope of that "SELECT" is done, these bindings are no longer present. We represent this with an immutable context object and the JS call stack. Parameters however are global: Deep in an expression somewhere a parameter can be referenced (= introduced) and / or unified. Another statement, somewhere in a completely lexical scope, can reference the same parameter. This list of parameters only gets "reset" at very specific times: At the end of a "CREATE FUNCTION" statement, or at the end of a prepared statement.
// Positional parameters don't have to be declared in advance, so every step has to pass the same "conceptually mutable" array of parameters around. We do keep this immutable however, so we can more easily follow the state of this array every step of the way. It is however annoying and error-prone that every step that can influence this array has to merge it and pass it along.
// Hmm, what if we do just keep this as a mutable array of name -> type bindings? That means that you can't "keep" an instance of the array around and refer to that current state later on (unless you explicitely clone it). In UrWeb that was annoying because these were everywhere in the "Elab"'d data structure which we wanted to cache and that was because of those ref's not possible, but this array isn't like that. It's a single almost-global array, introduced at very specific places, never nested, so it's probably useless to keep it immutable... Alright, I'm convinced, the (syntactical) overhead of keeping this immutable is not worth it. Let's keep the actual mutation of this array only in the "unification" part of things though
// Actually, I'm gonna try and keep it immutable anyway, until it becomes really annoying
// Hmm, what if you have :
//   WHERE $1 = $2
//     AND $2 = 42
// -> Unification variables need an identity, so we can say $1 and $2 refer to the same unification variable
// Parameters are of a certain type. This type is initially unknown (bar function parameters with a type annotation), so we assign a unification variable to it. These are implemented as refs in UrWeb. We don't want to model it like that (see discussion), so we need to keep a mapping of unification variable -> (current) type around. Is this seperate from the mapping (indexed) parameter -> unification variable? It should be use, otherwise you can never model equivalences between two unification variables (WHERE $1 = $2)

// "Global" scoping: per function call or prepared statement
export type Parameters = Readonly<{
  [index: number]: { unifvarId: unifvarId };
}>;
export type UnifVars = Readonly<{
  [key: number]: /* unifvarId */ {
    type: SimpleT | UnknownT;
    unificatedExpressions: Expr[];
  };
}>;

// Lexical scoping
type Context = {
  readonly decls: ReadonlyArray<{
    readonly name: QName;
    readonly type:
      | SimpleT // let bindings
      | SetT; // from-tables, from-views, with, (temp tables?)
  }>;
  readonly aliases: ReadonlyArray<{
    // the names of function parameters are aliases to the positional parameters
    readonly name: QName;
    readonly targetIndex: number;
  }>;
};

export function notImplementedYet(node: PGNode | null): any {
  throw new NotImplementedYet(node);
}

function mkType(t: DataTypeDef, cs: ColumnConstraint[]): SimpleT {
  const mapTypenames: { [n: string]: SimpleT } = {
    int: BuiltinTypes.Integer,
  };
  const t_: SimpleT =
    t.kind === "array"
      ? BuiltinTypeConstructors.Array(mkType(t.arrayOf, [{ type: "not null" }]))
      : mapTypenames[t.name] || {
          kind: "simple",
          name: t,
          typevar: null,
        };

  const notnullable = cs.some(
    (c) => c.type === "not null" || c.type === "primary key"
  );
  return notnullable ? t_ : BuiltinTypeConstructors.Nullable(t_);
}

function doCreateTable(g: Global, s: CreateTableStatement): Global {
  if ((s.inherits || []).length !== 0) {
    // Reusing the columns is not hard (see LIKE TABLE)
    // but subsequent alters to the parent table(s) also alter the children
    // so that's a bit more work. Not a huge amount though, just didnt do it yet
    return notImplementedYet(s);
  }
  const [fields, defaults] = s.columns.reduce(
    function (acc: [Field[], Name[]], c) {
      if (c.kind === "like table") {
        const targetTable = c.like;
        const found = g.tables.find((t) => eqQNames(t.name, targetTable));
        if (!found) {
          throw new UnknownIdentifier(targetTable);
        }
        return [acc[0].concat(found.rel.fields), acc[1].concat(found.defaults)];
      } else {
        return [
          acc[0].concat({
            name: c.name,
            type: mkType(c.dataType, c.constraints || []),
          }),
          (c.constraints || []).some((c) => c.type === "default")
            ? acc[1].concat(c.name)
            : acc[1],
        ];
      }
    },
    [[], []]
  );
  return {
    ...g,
    tables: g.tables.concat({
      name: s.name,
      rel: {
        kind: "set",
        fields,
      },
      defaults,
    }),
  };
}
function doCreateView(
  g: Global,
  s: CreateViewStatement | CreateMaterializedViewStatement
): Global {
  return notImplementedYet(s);
}
function doAlterTable(g: Global, s: AlterTableStatement): Global {
  return notImplementedYet(s);
}

function deriveNameFromExpr(expr: Expr): Name | null {
  if (expr.type === "ref") {
    return { name: expr.name };
  } else {
    return notImplementedYet(expr);
  }
}

export function doSelectFrom(
  g: Global,
  c: Context,
  p: Parameters,
  us: UnifVars,
  s: SelectFromStatement
): [SetT, Parameters, UnifVars] {
  const [newC, newP__, newU__]: [Context, Parameters, UnifVars] = doFroms(
    g,
    c,
    p,
    us,
    s.from || []
  );

  const newRes = s.where
    ? (function () {
        const [t, newP, newUs] = elabExpr(newC, newP__, newU__, s.where);
        if (t !== BuiltinTypes.Boolean) {
          throw new TypeMismatch(s.where, {
            expected: BuiltinTypes.Boolean,
            actual: t,
          });
        }
        return [newP, newUs] as const;
      })()
    : ([newP__, newU__] as const);

  if (isError(newRes)) {
    throw newRes;
  }

  const [fields, newP, newU] = (s.columns || []).reduce(
    (
      acc: [Field[], Parameters, UnifVars],
      c: SelectedColumn
    ): [Field[], Parameters, UnifVars] => {
      const n = c.alias ? c.alias : deriveNameFromExpr(c.expr);

      const [t, newP, newUs] = elabExpr(newC, acc[1], acc[2], c.expr);

      if (t.kind === "set") {
        throw new KindMismatch(c.expr, t, "Can only be scalar or array type");
      }

      const field: Field = { name: n, type: t };

      return [acc[0].concat(field), newP, newUs];
    },
    [[], newRes[0], newRes[1]]
  );
  return [
    {
      kind: "set",
      fields,
    },
    newP,
    newU,
  ];
}

type HandledFrom = { name: QName; rel: SetT };
type Nullable<T> = T | null;

function findRel(g: Global, n: QName): Nullable<SetT> {
  const t = g.tables.find((t) => eqQNames(t.name, n));
  if (t) {
    return t.rel;
  } else {
    const v = g.views.find((v) => eqQNames(v.name, n));
    if (v) {
      return v.rel;
    } else {
      return null;
    }
  }
}

function showLocation(loc: NodeLocation | undefined): string {
  if (!loc) {
    return "??";
  } else {
    return loc.start + " - " + loc.end;
  }
}

class NotImplementedYet extends Error {
  constructor(node: PGNode | null) {
    const m = node
      ? `: \n
${JSON.stringify(node)} @ ${node._location}`
      : "";
    super(`NotImplementedYet: ${m}`);
  }
}

class UnknownField extends Error {
  constructor(s: SetT, n: Name) {
    super(
      `UnknownField ${n.name} @ ${showLocation(
        n._location
      )} in ${JSON.stringify(s)}`
    );
  }
}
class UnknownIdentifier extends Error {
  constructor(m: QName) {
    super(`UnknownIdentifier ${showQName(m)} @ ${showLocation(m._location)}`);
  }
}
class AmbiguousIdentifier extends Error {
  constructor(m: QName, sets: QName[]) {
    super(
      `AmbiguousIdentifier ${showQName(m)} @ ${showLocation(
        m._location
      )} present in ${JSON.stringify(sets)}`
    );
  }
}
class KindMismatch extends Error {
  constructor(e: Expr, expected: Type, actual: string) {
    super(`KindMismatch: ${e}: ${expected} vs ${actual}}`);
  }
}
class TypeMismatch extends Error {
  constructor(
    e: Expr,
    ts: {
      expected: Type;
      actual: Type;
    }
  ) {
    super(
      `
TypeMismatch:
${toSql.expr(e)}

Expected:
${JSON.stringify(ts.expected)}

Actual:
${JSON.stringify(ts.actual)}}
`
    );
  }
}

function isError<U>(a: Error | U): a is Error {
  return a instanceof Error;
}

function mergeHandledFroms(c: Context, handledFroms: HandledFrom[]): Context {
  return {
    ...c,
    decls: c.decls.concat(
      handledFroms.map(function (f) {
        return {
          name: f.name,
          type: f.rel,
        };
      })
    ),
  };
}

function doSingleFrom(
  g: Global,
  c: Context,
  p: Parameters,
  us: UnifVars,
  handledFroms: HandledFrom[],
  f: From
): [HandledFrom[], Parameters, UnifVars] {
  if (f.type === "statement") {
    return notImplementedYet(f);
  } else if (f.type === "call") {
    return notImplementedYet(f);
  } else {
    if ((f.name.columnNames || []).length > 0) {
      notImplementedYet(f);
    }
    const foundRel = findRel(g, f.name);
    if (!foundRel) {
      throw new UnknownIdentifier(f.name);
    }

    const newHandledFrom = {
      name: f.name.alias
        ? {
            name: f.name.alias,
            _location: f.name._location,
          }
        : f.name,
      rel:
        f.join && (f.join.type === "FULL JOIN" || f.join.type === "LEFT JOIN")
          ? nullifySet(foundRel)
          : foundRel,
    };

    const newHandledFroms =
      f.join && (f.join.type === "FULL JOIN" || f.join.type === "RIGHT JOIN")
        ? handledFroms.map((fr) => ({ ...fr, rel: nullifySet(fr.rel) }))
        : handledFroms;

    const newRes = f.join?.on
      ? (function () {
          const [t, newP, newUs] = elabExpr(
            mergeHandledFroms(c, newHandledFroms),
            p,
            us,
            f.join.on
          );
          if (t !== BuiltinTypes.Boolean) {
            throw new TypeMismatch(f.join.on, {
              expected: BuiltinTypes.Boolean,
              actual: t,
            });
          } else {
            return [newP, newUs] as const;
          }
        })()
      : ([p, us] as const);

    if (isError(newRes)) {
      throw newRes;
    } else {
      return [newHandledFroms.concat(newHandledFrom), newRes[0], newRes[1]];
    }
  }
}
function doFroms(
  g: Global,
  c: Context,
  p: Parameters,
  us: UnifVars,
  froms: From[]
): [Context, Parameters, UnifVars] {
  const inFroms: [HandledFrom[], Parameters, UnifVars] = froms.reduce(
    function (acc: [HandledFrom[], Parameters, UnifVars], f: From) {
      return doSingleFrom(g, c, acc[1], acc[2], acc[0], f);
    },
    [[], p, us]
  );
  return [mergeHandledFroms(c, inFroms[0]), inFroms[1], inFroms[2]];
}

function lookup(c: Context, ps: Parameters, n: QName): Type | null {
  const foundAlias = c.aliases.find((a) => eqQNames(a.name, n));
  if (foundAlias) {
    const foundP = ps[foundAlias.targetIndex];
    if (foundP) {
      return { kind: "unifvar", id: foundP.unifvarId };
    } else {
      throw new Error(
        `Typechecker error: unknown parameter index ${foundAlias.targetIndex}`
      );
    }
  } else {
    const found = c.decls.find((d) => eqQNames(d.name, n));
    if (found) {
      return found.type;
    } else {
      return null;
    }
  }
}

function extractIndexFromParameter(e: ExprParameter): number {
  if (e.name.startsWith("$")) {
    const sub = e.name.substring(1);
    const parsed = parseInt(sub);
    if (isNaN(parsed)) {
      throw new Error(`Failed to parse parameter ${JSON.stringify(e)}`);
    } else {
      return parsed;
    }
  } else {
    throw new Error(`Failed to parse parameter ${JSON.stringify(e)}`);
  }
}

function lookupInSet(s: SetT, name: Name): SimpleT | UnifVar | null {
  const found = s.fields.find((f) => f.name && f.name.name === name.name);
  if (found) {
    return found.type;
  } else {
    return null;
  }
}

// function isSet(t: ScalarT | ArrayT | SetT): t is SetT{
//   retur
// }

function elabRef(c: Context, ps: Parameters, e: ExprRef): Type {
  if (e.name === "*") {
    return notImplementedYet(e);
  } else {
    if (e.table) {
      const table = lookup(c, ps, e.table);
      if (!table) {
        throw new UnknownIdentifier(e.table);
      }
      if (!(table.kind === "set")) {
        throw new KindMismatch(e, table, "Expecting Set");
      }
      const field = lookupInSet(table, e);
      if (!field) {
        throw new UnknownField(table, e);
      }
      return field;
    } else {
      const foundFields: {
        set: QName;
        field: Name;
        type: SimpleT | UnifVar;
      }[] = mapPartial(c.decls, (t) => {
        if (t.type.kind === "set") {
          const foundfield = lookupInSet(t.type, e);
          return foundfield
            ? { set: t.name, field: e, type: foundfield }
            : null;
        }
        return null;
      });
      if (foundFields.length === 0) {
        throw new UnknownIdentifier(e);
      } else if (foundFields.length === 1) {
        return foundFields[0].type;
      }
      // if (foundFields.length > 0)
      throw new AmbiguousIdentifier(
        e,
        foundFields.map((f) => f.set)
      );
    }
  }
}

function unify(
  e: Expr | null, // not actually used, just for "documentation", error handling, etc
  us: UnifVars,
  t1: Type,
  t2: Type,
  type: CastType
): null | [Type, UnifVars] {
  if (t1.kind === "set" || t2.kind === "set") {
    throw notImplementedYet(e);
  } else {
    return unifySimplesOrUnifVars(e, us, t1, t2, type);
  }
}

function unifySimplesOrUnifVars(
  e: Expr | null,
  us: UnifVars,
  source: SimpleT | UnifVar,
  target: SimpleT | UnifVar,
  type: CastType
): null | [SimpleT, UnifVars] {
  if (source.kind === "simple") {
    if (target.kind === "simple") {
      return unifySimples(e, us, source, target, type);
    } else {
      return unifyUnificationVarWithSimple(e, us, source, target, type);
    }
  } else {
    if (target.kind === "simple") {
      return unifyUnificationVarWithSimple(e, us, target, source, type);
    } else {
      return notImplementedYet(e);
      // const existingT1 = ps.find((p) => p.index === t1.index);
      // const existingT2 = ps.find((p) => p.index === t2.index);
      // Hmm, what if you have :
      //   WHERE $1 = $2
      //     AND $2 = 42
    }
  }
}

function unifyUnificationVarWithSimple(
  e: Expr | null, // not actually used, just for "documentation", error handling, etc
  us: UnifVars,
  t1: SimpleT,
  t2: UnifVar,
  type: CastType
): null | [SimpleT, UnifVars] {
  const existing = us[t2.id];
  if (existing) {
    if (existing.type.kind === "unknown") {
      const newUs = {
        ...us,
        ...{
          [t2.id]: {
            type: t1,
            unificatedExpressions: e
              ? existing.unificatedExpressions.concat(e)
              : existing.unificatedExpressions,
          },
        },
      };
      return [t1, newUs];
    } else {
      const res = unifySimples(e, us, existing.type, t1, type);
      if (res) {
        const newUs = {
          ...us,
          ...{
            [t2.id]: {
              type: res[0],
              unificatedExpressions: e
                ? existing.unificatedExpressions.concat(e)
                : existing.unificatedExpressions,
            },
          },
        };
        return [res[0], newUs];
      } else {
        return null;
      }
    }
  } else {
    throw new Error(
      `Typechecker error: Unknown unification var: ${JSON.stringify(t2)}`
    );
  }
}

function isNullable(s: SimpleT): boolean {
  return (
    s.typevar !== null &&
    eqQNames(s.name, {
      name: "nullable",
      schema: "",
    })
  );
}

//www.postgresql.org/docs/current/sql-createcast.html
// If they "fit into" eachother, you get the "biggest" type back
// eg: smallint fits into integer
// otherwise, this function will return null = does not unify
//
// https://www.postgresql.org/docs/7.3/typeconv.html
// https://www.postgresql.org/docs/current/sql-createcast.html
//
// 3 kinds of casts:
// * Implicit: can happen anywhere
// * In Assignment: (Only) in insert/update statements, when trying to "fit" data into table columns
// * Explicit: can happen when explicitely calling the CAST function
//
// Casting to a "nullable" type is not part of PostgreSQL, but it is the same idea
type CastType = "implicit" | "assignment" | "explicit";
function unifySimples(
  e: Expr | null,
  us: UnifVars,
  source: SimpleT,
  target: SimpleT,
  type: CastType
): null | [SimpleT, UnifVars] {
  debugger;
  // list casts = \dC+
  const casts: { source: SimpleT; target: SimpleT; type: CastType }[] = [
    {
      source: BuiltinTypes.Smallint,
      target: BuiltinTypes.Integer,
      type: "implicit",
    },
    {
      source: BuiltinTypes.Integer,
      target: BuiltinTypes.Bigint,
      type: "implicit",
    },
  ];

  function wrapResInNullable(
    res: null | [SimpleT, UnifVars]
  ): null | [SimpleT, UnifVars] {
    return res === null
      ? null
      : [BuiltinTypeConstructors.Nullable(res[0]), res[1]];
  }

  // T -> Nullable<T> is a universal cast
  if (target.typevar && isNullable(target) && !isNullable(source)) {
    if (target.typevar.kind === "simple") {
      return wrapResInNullable(
        unifySimples(e, us, source, target.typevar, type)
      );
    } else {
      return wrapResInNullable(
        unifyUnificationVarWithSimple(e, us, source, target.typevar, type)
      );
    }
  }
  if (source.typevar && isNullable(source) && !isNullable(target)) {
    if (source.typevar.kind === "simple") {
      return wrapResInNullable(
        unifySimples(e, us, target, source.typevar, type)
      );
    } else {
      return wrapResInNullable(
        unifyUnificationVarWithSimple(e, us, target, source.typevar, type)
      );
    }
  }

  if (source.typevar) {
    if (target.typevar) {
      if (eqQNames(source.name, target.name)) {
        const res = unifySimplesOrUnifVars(e, us, source, target, type);
        if (res) {
          return [{ ...source, typevar: res[0] }, us];
        } else {
          return null;
        }
      } else {
        return null;
      }
    } else {
      return null;
    }
  } else {
    if (target.typevar) {
      return null;
    } else {
      // No typevars in either side
      if (eqQNames(source.name, target.name)) {
        return [source, us];
      } else {
        const matchingCast = casts.find(
          (c) =>
            eqQNames(c.source.name, source.name) &&
            eqQNames(c.target.name, target.name)
        );
        if (matchingCast) {
          return [matchingCast.target, us];
        } else {
          return null;
        }
      }
    }
  }
}

function elabBinary(
  c: Context,
  p: Parameters,
  us: UnifVars,
  e: ExprBinary
): [Type, Parameters, UnifVars] {
  debugger;
  const [t1, p1, us1] = elabExpr(c, p, us, e.left);
  const [t2, p2, us2] = elabExpr(c, p1, us1, e.right);

  if (e.op === "=") {
    const unifies = unify(e, us2, t1, t2, "implicit");
    if (!unifies) {
      throw new TypeMismatch(e, { expected: t1, actual: t2 });
    } else {
      return [BuiltinTypes.Boolean, p2, unifies[1]];
    }
  } else if (e.op === "AND") {
    const unifies1 = unify(e, us2, t1, BuiltinTypes.Boolean, "implicit");
    if (!unifies1) {
      throw new TypeMismatch(e, { expected: BuiltinTypes.Boolean, actual: t1 });
    } else {
      const unifies2 = unify(
        e,
        unifies1[1],
        t2,
        BuiltinTypes.Boolean,
        "implicit"
      );
      if (!unifies2) {
        throw new TypeMismatch(e, {
          expected: BuiltinTypes.Boolean,
          actual: t1,
        });
      } else {
        return [BuiltinTypes.Boolean, p2, unifies2[1]];
      }
    }
  } else {
    return notImplementedYet(e);
  }
  // TODO support custom operators
}

function getNextUnifVarId(us: UnifVars): unifvarId {
  const keys = Object.keys(us).map(parseInt);
  if (keys.length === 0) {
    return 9000;
  } else {
    return Math.max(...keys) + 1;
  }
}

function elabExpr(
  c: Context,
  p: Parameters,
  us: UnifVars,
  e: Expr
): [Type, Parameters, UnifVars] {
  if (e.type === "ref") {
    const t = elabRef(c, p, e);
    return [t, p, us];
  } else if (e.type === "parameter") {
    const index = extractIndexFromParameter(e);
    const existing = p[index];
    if (existing) {
      return [{ kind: "unifvar", id: existing.unifvarId }, p, us];
    } else {
      const newUnifvarId = getNextUnifVarId(us);
      return [
        { kind: "unifvar", id: newUnifvarId },
        { ...p, ...{ [index]: { unifvarId: newUnifvarId } } },
        {
          ...us,
          ...{
            [newUnifvarId]: {
              type: { kind: "unknown" },
              unificatedExpressions: [],
            },
          },
        },
      ];
    }
  } else if (e.type === "integer") {
    return [BuiltinTypes.Integer, p, us];
  } else if (e.type === "boolean") {
    return [BuiltinTypes.Boolean, p, us];
  } else if (e.type === "string") {
    return [BuiltinTypes.String, p, us];
  } else if (e.type === "binary") {
    return elabBinary(c, p, us, e);
  } else {
    return notImplementedYet(e);
  }
}

function doCreateFunc(
  g: Global,
  s: CreateFunctionStatement
): [QName, Parameters, SetT] {
  // introduce named parameters = aliases!
  return notImplementedYet(s);
}

export function parseSetupScripts(ast: Statement[]): Global {
  return ast.reduce(
    (acc: Global, a): Global => {
      if (a.type === "create table" && !a.temporary) {
        return doCreateTable(acc, a);
      } else if (
        a.type === "create view" ||
        a.type === "create materialized view"
      ) {
        return doCreateView(acc, a);
      } else if (a.type === "alter table") {
        return doAlterTable(acc, a);
      } else {
        return acc;
      }
    },
    { tables: [], views: [] }
  );
}

function nullifySet(s: SetT): SetT {
  return {
    kind: "set",
    fields: s.fields.map((c) => ({
      name: c.name,
      type: { ...c.type, nullable: true },
    })),
  };
}

function expectNever(_: never): any {
  throw new Error("Oops didn't expect that");
}

function showQName(n: QName): string {
  return n.schema ? n.schema + "." + n.name : n.name;
}

function eqQNames<U extends QName, V extends QName>(u: U, v: V): boolean {
  return (
    u.name === v.name &&
    ((!u.schema && v.schema === "dbo") ||
      (u.schema === "dbo" && !v.schema) ||
      (!u.schema && !v.schema) ||
      u.schema === v.schema)
  );
}

function mapPartial<T, U>(
  a: Array<T> | ReadonlyArray<T>,
  f: (t: T, i: number) => U | null
): U[] {
  const newA: U[] = [];
  a.forEach(function (a, i) {
    const res = f(a, i);
    if (res === null) {
    } else {
      newA.push(res);
    }
  });
  return newA.reverse();
}

function flatMapPartial<T, U>(a: T[], f: (t: T, i: number) => U[] | null): U[] {
  const newA: U[] = [];
  a.forEach(function (a, i) {
    const res = f(a, i);
    if (res === null) {
    } else {
      newA.push(...res);
    }
  });
  return newA.reverse();
}
