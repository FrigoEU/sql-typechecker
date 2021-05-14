import {
  parse,
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
export type UnifVar = {
  kind: "unifvar";
  index: number; // eg: "$1" -> 1
};

const BuiltinTypes = {
  Boolean: {
    kind: "simple",
    name: { name: "bool", schema: "pg_catalog" },
    typevar: null,
  },
  Integer: {
    kind: "simple",
    name: { name: "integer", schema: "pg_catalog" },
    typevar: null,
  },
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

// "Global" scoping: per function call or prepared statement
type Parameter = {
  index: number;
  type: SimpleT | UnknownT;
  unificatedExpressions: Expr[];
};
// In UrWeb, unification variables are implemented as ref's. This is I think because you can introduce these anywhere, and reference them anywhere, so it becomes very hard to keep them up-to-date in the whole context. In SQL however, you cant just introduce new free variables. You can only do this at the statement level for prepared statements, or in a CREATE FUNCTION statement, and neither can be nested. So you can have a single "global" array of these free variables that always contains the most recent "judgement" of what type these parameters should be.
// Parameters are scoped differently from the context though: In the context we add things for example when going through a "FROM" using lexical scoping. Once the scope of that "SELECT" is done, these bindings are no longer present. We represent this with an immutable context object and the JS call stack. Parameters however are global: Deep in an expression somewhere a parameter can be referenced (= introduced) and / or unified. Another statement, somewhere in a completely lexical scope, can reference the same parameter. This list of parameters only gets "reset" at very specific times: At the end of a "CREATE FUNCTION" statement, or at the end of a prepared statement.
// Positional parameters don't have to be declared in advance, so every step has to pass the same "conceptually mutable" array of parameters around. We do keep this immutable however, so we can more easily follow the state of this array every step of the way. It is however annoying and error-prone that every step that can influence this array has to merge it and pass it along.
// Hmm, what if we do just keep this as a mutable array of name -> type bindings? That means that you can't "keep" an instance of the array around and refer to that current state later on (unless you explicitely clone it). In UrWeb that was annoying because these were everywhere in the "Elab"'d data structure which we wanted to cache and that was because of those ref's not possible, but this array isn't like that. It's a single almost-global array, introduced at very specific places, never nested, so it's probably useless to keep it immutable... Alright, I'm convinced, the (syntactical) overhead of keeping this immutable is not worth it. Let's keep the actual mutation of this array only in the "unification" part of things though
// Actually, I'm gonna try and keep it immutable anyway, until it becomes really annoying
// Hmm, what if you have :
//   WHERE $1 = $2
//     AND $2 = 42
export type Parameters = ReadonlyArray<Parameter>;

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
    throw new Error("INHERITS is not supported yet");
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
  s: SelectFromStatement
): [SetT, Parameters] {
  const [newC, newP__]: [Context, Parameters] = doFroms(g, c, p, s.from || []);

  const newP_ = s.where
    ? (function () {
        const [t, newP] = elabExpr(newC, newP__, s.where);
        if (t !== BuiltinTypes.Boolean) {
          throw new TypeMismatch(s.where, {
            expected: BuiltinTypes.Boolean,
            actual: t,
          });
        }
        return newP;
      })()
    : newP__;

  if (isError(newP_)) {
    throw newP_;
  }

  const [fields, newP] = (s.columns || []).reduce(
    (acc: [Field[], Parameters], c: SelectedColumn): [Field[], Parameters] => {
      const n = c.alias ? c.alias : deriveNameFromExpr(c.expr);

      const [t, newP] = elabExpr(newC, acc[1], c.expr);

      if (t.kind === "set") {
        throw new KindMismatch(c.expr, t, "Can only be scalar or array type");
      }

      const field: Field = { name: n, type: t };

      return [acc[0].concat(field), newP];
    },
    [[], newP_]
  );
  return [
    {
      kind: "set",
      fields,
    },
    newP,
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
${JSON.stringify(e)}:

Expected:
${JSON.stringify(ts.expected)}

Actual:
${JSON.stringify(ts.actual)}}`
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
  handledFroms: HandledFrom[],
  f: From
): [HandledFrom[], Parameters] {
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

    const newP = f.join?.on
      ? (function () {
          const [t, newP] = elabExpr(
            mergeHandledFroms(c, newHandledFroms),
            p,
            f.join.on
          );
          if (t !== BuiltinTypes.Boolean) {
            throw new TypeMismatch(f.join.on, {
              expected: BuiltinTypes.Boolean,
              actual: t,
            });
          } else {
            return newP;
          }
        })()
      : p;

    if (isError(newP)) {
      throw newP;
    } else {
      return [newHandledFroms.concat(newHandledFrom), newP];
    }
  }
}
function doFroms(
  g: Global,
  c: Context,
  p: Parameters,
  froms: From[]
): [Context, Parameters] {
  const inFroms: [HandledFrom[], Parameters] = froms.reduce(
    function (acc: [HandledFrom[], Parameters], f: From) {
      return doSingleFrom(g, c, acc[1], acc[0], f);
    },
    [[], p]
  );
  return [mergeHandledFroms(c, inFroms[0]), inFroms[1]];
}

function lookup(c: Context, n: QName): Type | null {
  const foundAlias = c.aliases.find((a) => eqQNames(a.name, n));
  if (foundAlias) {
    return { kind: "unifvar", index: foundAlias.targetIndex };
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

function elabRef(c: Context, e: ExprRef): Type {
  if (e.name === "*") {
    return notImplementedYet(e);
  } else {
    if (e.table) {
      const table = lookup(c, e.table);
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
  ps: Parameters,
  t1: Type,
  t2: Type
): [boolean, Parameters] {
  if (t1.kind === "simple") {
    if (t2.kind === "simple") {
      if (!eqQNames(t1.name, t2.name)) {
        return [false, ps];
      }
      if (t1.typevar) {
        if (t2.typevar) {
          return unify(e, ps, t1.typevar, t2.typevar);
        } else {
          return [false, ps];
        }
      } else {
        if (t2.typevar) {
          return [false, ps];
        } else {
          return [true, ps];
        }
      }
    } else if (t2.kind === "unifvar") {
      const existing = ps.find((p) => p.index === t2.index);
      if (existing) {
        if (existing.type.kind === "unknown") {
          return [
            true,
            ps
              .filter((p) => p.index === t2.index)
              .concat({
                ...existing,
                type: t1,
                unificatedExpressions: e
                  ? existing.unificatedExpressions.concat(e)
                  : existing.unificatedExpressions,
              }),
          ];
        } else {
          return unify(e, ps, existing.type, t2);
        }
      } else {
        return [
          true,
          ps.concat({
            index: t2.index,
            type: t1,
            unificatedExpressions: e ? [e] : [],
          }),
        ];
      }
    } else {
      return [false, ps];
    }
  } else if (t1.kind === "set") {
    return notImplementedYet(e);
  } else if (t1.kind === "unifvar") {
    if (t2.kind === "unifvar") {
      throw notImplementedYet(e);
      // const existingT1 = ps.find((p) => p.index === t1.index);
      // const existingT2 = ps.find((p) => p.index === t2.index);
      // Hmm, what if you have :
      //   WHERE $1 = $2
      //     AND $2 = 42
    } else {
      return unify(e, ps, t2, t1);
    }
  } else {
    return expectNever(t1);
  }
}

function elabBinary(
  c: Context,
  p: Parameters,
  e: ExprBinary
): [Type, Parameters] {
  const [t1, p1] = elabExpr(c, p, e.left);
  const [t2, p2] = elabExpr(c, p1, e.right);

  if (e.op === "=") {
    const [unifies, p3] = unify(e, p2, t1, t2);
    if (!unifies) {
      throw new TypeMismatch(e, { expected: t1, actual: t2 });
    } else {
      return [BuiltinTypes.Boolean, p3];
    }
  } else if (e.op === "AND") {
    const [unifies1, p3] = unify(e, p2, t1, BuiltinTypes.Boolean);
    if (!unifies1) {
      throw new TypeMismatch(e, { expected: BuiltinTypes.Boolean, actual: t1 });
    } else {
      const [unifies2, p4] = unify(e, p3, t2, BuiltinTypes.Boolean);
      if (!unifies2) {
        throw new TypeMismatch(e, {
          expected: BuiltinTypes.Boolean,
          actual: t1,
        });
      } else {
        return [BuiltinTypes.Boolean, p4];
      }
    }
  } else {
    return notImplementedYet(e);
  }
  // TODO support custom operators
}

function elabExpr(c: Context, p: Parameters, e: Expr): [Type, Parameters] {
  if (e.type === "ref") {
    const t = elabRef(c, e);
    return [t, p];
  } else if (e.type === "parameter") {
    return [{ kind: "unifvar", index: extractIndexFromParameter(e) }, p];
  } else if (e.type === "integer") {
    return [BuiltinTypes.Integer, p];
  } else if (e.type === "boolean") {
    return [BuiltinTypes.Boolean, p];
  } else if (e.type === "binary") {
    return elabBinary(c, p, e);
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
