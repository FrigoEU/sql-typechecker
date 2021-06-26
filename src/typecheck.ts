import {
  AlterTableStatement,
  ColumnConstraint,
  CreateFunctionStatement,
  CreateMaterializedViewStatement,
  CreateTableStatement,
  CreateViewStatement,
  DataTypeDef,
  Expr,
  ExprBinary,
  ExprParameter,
  ExprRef,
  From,
  Name,
  // astVisitor,
  NodeLocation,
  PGNode,
  QName,
  SelectedColumn,
  SelectFromStatement,
  Statement,
  toSql,
} from "pgsql-ast-parser";

export type Type = ParametrizedT<SimpleT | UnifVar> | SimpleT | SetT | UnifVar;
export type ParametrizedT<T> = {
  kind: "parametrized";
  name: "nullable" | "array";
  typevar: T;
};
export type SimpleT = {
  kind: "simple";
  name: QName;
};
type Field = {
  name: Name | null;
  type: SimpleT | ParametrizedT<SimpleT | UnifVar> | UnifVar;
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
  },
  Smallint: {
    kind: "simple",
    name: { name: "smallint" },
  },
  Integer: {
    kind: "simple",
    name: { name: "integer" },
  },
  Bigint: {
    kind: "simple",
    name: { name: "bigint" },
  },
  String: {
    kind: "simple",
    name: { name: "text" },
  },
  // Any: {
  //   kind: "simple",
  //   name: { name: "any" },
  //   typevar: null,
  // },
} as const;

const BuiltinTypeConstructors = {
  Nullable: <T>(t: T): ParametrizedT<T> => ({
    kind: "parametrized",
    name: "nullable",
    typevar: t,
  }),
  Array: <T>(t: T): ParametrizedT<T> => ({
    kind: "parametrized",
    name: "array",
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
// Nope this is not true. Rather, we keep "equivalences" between parameters/unification variables (which are the same since one parameter always is one unification variable and there is no other way to have other unification vars) in the UnifVars data structure itself, and take it into account when looking up the type of a unifvar

type unifvarValue = null | {
  type: ParametrizedT<SimpleT | UnifVar> | SimpleT | UnifVar;
  unificatedExpressions: Expr[];
};

// "Global" scoping: per function call or prepared statement
export class UnifVars {
  private currentI: unifvarId;
  private values: {
    [key: number /* unifvarId */]: unifvarValue;
  };
  constructor(
    i: unifvarId,
    values: {
      [key: number /* unifvarId */]: unifvarValue;
    }
  ) {
    this.currentI = i;
    this.values = values;
  }
  public getKeys(): number[] {
    return Object.keys(this.values).map((i) => parseInt(i));
  }
  public newvar(i: unifvarId): [UnifVar, UnifVars] {
    if (this.values[i] !== undefined) {
      return [{ kind: "unifvar", id: i }, this];
    } else {
      const i = this.currentI + 1;
      return [
        { kind: "unifvar", id: i },
        new UnifVars(i, {
          ...this.values,
          ...{ [i]: null },
        }),
      ];
    }
  }

  public lookup(
    i: UnifVar
  ): [ParametrizedT<SimpleT | UnifVar> | SimpleT | null, Expr[]] {
    const found = this.values[i.id];
    if (found === undefined) {
      throw new Error(
        `Typechecker error: Unknown unification var: ${JSON.stringify(
          i
        )}. Current unifvar values: ${JSON.stringify(this.values)}`
      );
    } else if (found === null) {
      return [null, []];
    } else {
      const t = found.type;
      if (t.kind === "unifvar") {
        return this.lookup(t);
      } else {
        return [t, found.unificatedExpressions];
      }
    }
  }

  public setValue(
    e: Expr | null,
    i: UnifVar,
    t: SimpleT | ParametrizedT<SimpleT | UnifVar>
  ) {
    const [_, exprs] = this.lookup(i);
    return new UnifVars(this.currentI, {
      ...this.values,
      ...{
        [i.id]: {
          type: t,
          unificatedExpressions: exprs.concat(e ? [e] : []),
        },
      },
    });
  }

  private registerEquivalence(i: UnifVar, j: UnifVar): UnifVars {
    if (i.id === j.id) {
      return this;
    } else {
      const [, exprsI] = this.lookup(i);
      const [currJ, exprsJ] = this.lookup(j);
      return new UnifVars(this.currentI, {
        ...this.values,
        ...{
          [i.id]: {
            type: j,
            unificatedExpressions: [],
          },
          [j.id]: currJ && {
            type: currJ,
            unificatedExpressions: exprsI.concat(exprsJ),
          },
        },
      });
    }
  }

  public areEqual(
    e: Expr | null,
    i: UnifVar,
    j: UnifVar,
    type: CastType
  ): null | [UnifVar, UnifVars] {
    const [curr1] = this.lookup(i);
    const [curr2] = this.lookup(j);
    const withEqui = this.registerEquivalence(i, j);
    if (curr1 === null) {
      if (curr2 === null) {
        // unknown - unknown
        return [i, withEqui];
      } else {
        // unknown - simple
        const res = withEqui.unify(e, i, curr2, type);
        return res && [i, res[1]];
      }
    } else {
      if (curr2 === null) {
        // simple - unknown
        return withEqui.unify(e, j, curr1, type);
      } else {
        // simple - simple
        const res = unifySimplesOrParametrizeds(
          e,
          withEqui,
          curr1,
          curr2,
          type
        );
        return res && [i, res[1]];
      }
    }
  }

  // * Checks if there are no type mismatches
  // * Updates unifvar value (if applicable)
  // * Adds unifvar equivalences (if applicable)
  public unify(
    e: Expr | null /* only for documentation */,
    i: UnifVar,
    t: SimpleT | ParametrizedT<SimpleT | UnifVar>,
    type: CastType
  ): null | [UnifVar, UnifVars] {
    const [existing, exprs] = this.lookup(i);
    // if (t.kind === "simple") {
    if (existing === null) {
      return [i, this.setValue(e, i, t)];
    } else {
      const res = unifySimplesOrParametrizeds(e, this, existing, t, type);
      return res && [i, res[1].setValue(e, i, res[0])];
    }
  }
}

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
    readonly targetIndex: unifvarId;
  }>;
};

export function notImplementedYet(node: PGNode | null): any {
  throw new NotImplementedYet(node);
}

function mkType(
  t: DataTypeDef,
  cs: ColumnConstraint[]
): SimpleT | ParametrizedT<SimpleT> {
  const mapTypenames: { [n: string]: SimpleT } = {
    int: BuiltinTypes.Integer,
  };
  if (t.kind === "array") {
    if (t.arrayOf.kind === "array") {
      throw new Error("Array or array not supported");
    } else {
      return BuiltinTypeConstructors.Array(
        mapTypenames[t.arrayOf.name] || { kind: "simple", name: t.arrayOf }
      );
    }
  } else {
    const t_: SimpleT = mapTypenames[t.name] || {
      kind: "simple",
      name: t,
    };

    const notnullable = cs.some(
      (c) => c.type === "not null" || c.type === "primary key"
    );
    return notnullable ? t_ : BuiltinTypeConstructors.Nullable(t_);
  }
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
  } else if (expr.type === "parameter") {
    return null;
  } else {
    return notImplementedYet(expr);
  }
}

export function doSelectFrom(
  g: Global,
  c: Context,
  us: UnifVars,
  s: SelectFromStatement
): [SetT, UnifVars] {
  const [newC, newU__]: [Context, UnifVars] = doFroms(g, c, us, s.from || []);

  const newRes = s.where
    ? (function () {
        const [t, newUs] = elabExpr(newC, newU__, s.where);
        if (t !== BuiltinTypes.Boolean) {
          throw new TypeMismatch(s.where, {
            expected: BuiltinTypes.Boolean,
            actual: t,
          });
        }
        return newUs;
      })()
    : newU__;

  if (isError(newRes)) {
    throw newRes;
  }

  const [fields, newU] = (s.columns || []).reduce(
    (acc: [Field[], UnifVars], c: SelectedColumn): [Field[], UnifVars] => {
      const n = c.alias ? c.alias : deriveNameFromExpr(c.expr);

      const [t, newUs] = elabExpr(newC, acc[1], c.expr);

      if (t.kind === "set") {
        throw new KindMismatch(c.expr, t, "Can only be scalar or array type");
      }

      const field: Field = { name: n, type: t };

      return [acc[0].concat(field), newUs];
    },
    [[], newRes]
  );
  return [
    {
      kind: "set",
      fields,
    },
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
  us: UnifVars,
  handledFroms: HandledFrom[],
  f: From
): [HandledFrom[], UnifVars] {
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
          const [t, newUs] = elabExpr(
            mergeHandledFroms(c, newHandledFroms),
            us,
            f.join.on
          );
          if (t !== BuiltinTypes.Boolean) {
            throw new TypeMismatch(f.join.on, {
              expected: BuiltinTypes.Boolean,
              actual: t,
            });
          } else {
            return newUs;
          }
        })()
      : us;

    if (isError(newRes)) {
      throw newRes;
    } else {
      return [newHandledFroms.concat(newHandledFrom), newRes];
    }
  }
}
function doFroms(
  g: Global,
  c: Context,
  us: UnifVars,
  froms: From[]
): [Context, UnifVars] {
  const inFroms: [HandledFrom[], UnifVars] = froms.reduce(
    function (acc: [HandledFrom[], UnifVars], f: From) {
      return doSingleFrom(g, c, acc[1], acc[0], f);
    },
    [[], us]
  );
  return [mergeHandledFroms(c, inFroms[0]), inFroms[1]];
}

function lookup(c: Context, n: QName): Type | null {
  const foundAlias = c.aliases.find((a) => eqQNames(a.name, n));
  if (foundAlias) {
    return { kind: "unifvar", id: foundAlias.targetIndex };
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

function lookupInSet(
  s: SetT,
  name: Name
): SimpleT | ParametrizedT<SimpleT | UnifVar> | UnifVar | null {
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
        type: SimpleT | UnifVar | ParametrizedT<SimpleT | UnifVar>;
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
  t1: ParametrizedT<SimpleT | UnifVar> | SimpleT | SetT | UnifVar,
  t2: ParametrizedT<SimpleT | UnifVar> | SimpleT | SetT | UnifVar,
  type: CastType
): null | [Type /* "Biggest" resulting type */, UnifVars] {
  if (t1.kind === "set" || t2.kind === "set") {
    throw notImplementedYet(e);
  } else {
    if (t1.kind === "unifvar") {
      if (t2.kind === "unifvar") {
        return us.areEqual(e, t1, t2, type);
      } else {
        return us.unify(e, t1, t2, type);
      }
    } else {
      if (t2.kind === "unifvar") {
        return us.unify(e, t2, t1, type);
      } else {
        return unifySimplesOrParametrizeds(e, us, t1, t2, type);
      }
    }
  }
}

function unifySimplesOrUnifVars(
  e: Expr | null,
  us: UnifVars,
  source: SimpleT | UnifVar,
  target: SimpleT | UnifVar,
  type: CastType
): null | [SimpleT | UnifVar, UnifVars] {
  if (source.kind === "simple") {
    if (target.kind === "simple") {
      // simple - simple
      const res = unifySimples(source, target, type);
      return res && [res, us];
    } else {
      // simple - unif
      return us.unify(e, target, source, type);
    }
  } else {
    if (target.kind === "simple") {
      // unif - simple
      return us.unify(e, source, target, type);
    } else {
      // unif - unif
      return us.areEqual(e, source, target, type);
    }
  }
}

function unifySimplesOrParametrizeds(
  e: Expr | null,
  us: UnifVars,
  source: ParametrizedT<SimpleT | UnifVar> | SimpleT,
  target: ParametrizedT<SimpleT | UnifVar> | SimpleT,
  type: CastType
): null | [ParametrizedT<SimpleT | UnifVar> | SimpleT, UnifVars] {
  function wrapResInNullable(
    res: null | [UnifVar | SimpleT, UnifVars]
  ): null | [ParametrizedT<SimpleT | UnifVar>, UnifVars] {
    return res === null
      ? null
      : [BuiltinTypeConstructors.Nullable(res[0]), res[1]];
  }

  // T -> Nullable<T> is a universal cast
  if (
    source.kind === "parametrized" &&
    source.name === "nullable" &&
    target.kind === "simple"
  ) {
    return wrapResInNullable(
      unifySimplesOrUnifVars(e, us, source.typevar, target, type)
    );
  }
  if (
    target.kind === "parametrized" &&
    target.name === "nullable" &&
    source.kind === "simple"
  ) {
    return wrapResInNullable(
      unifySimplesOrUnifVars(e, us, source, target.typevar, type)
    );
  }

  if (source.kind === "parametrized") {
    if (target.kind === "parametrized") {
      // parametrized - parametrized
      const res = unifySimplesOrUnifVars(
        e,
        us,
        source.typevar,
        target.typevar,
        type
      );
      return res && [{ ...source, typevar: res[0] }, res[1]];
    } else {
      // parametrized - simple
      return null;
    }
  } else {
    if (target.kind === "parametrized") {
      // simple - parametrized
      return null;
    } else {
      // simple - simple
      const res = unifySimples(source, target, type);
      return res && [res, us];
    }
  }
}

//www.postgresql.org/docs/current/sql-createcast.html
// If they "fit into" eachother, you get the "biggest" type back
// eg: smallint fits into integer
// otherwise, this function will return null = does not unify
//
// https://www.postgresql.org/docs/7.3/typeconv.html
// https://www.postgresql.org/docs/current/sql-createcast.html
// 3 kinds of casts:
// * Implicit: can happen anywhere
// * In Assignment: (Only) in insert/update statements, when trying to "fit" data into table columns
// * Explicit: can happen when explicitely calling the CAST function
//
type CastType = "implicit" | "assignment" | "explicit";
function unifySimples(
  source: SimpleT,
  target: SimpleT,
  type: CastType
): null | SimpleT {
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

  if (eqQNames(source.name, target.name)) {
    return source;
  } else {
    const matchingCast = casts.find(
      (c) =>
        eqQNames(c.source.name, source.name) &&
        eqQNames(c.target.name, target.name) &&
        c.type === type // TODO widen(?)
    );
    if (matchingCast) {
      return matchingCast.target;
    } else {
      return null;
    }
  }
}

function elabBinary(c: Context, us: UnifVars, e: ExprBinary): [Type, UnifVars] {
  const [t1, us1] = elabExpr(c, us, e.left);
  const [t2, us2] = elabExpr(c, us1, e.right);

  if (e.op === "=") {
    const unifies = unify(e, us2, t1, t2, "implicit");
    if (!unifies) {
      throw new TypeMismatch(e, { expected: t1, actual: t2 });
    } else {
      return [BuiltinTypes.Boolean, unifies[1]];
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
        return [BuiltinTypes.Boolean, unifies2[1]];
      }
    }
  } else {
    return notImplementedYet(e);
  }
  // TODO support custom operators
}

function elabExpr(c: Context, us: UnifVars, e: Expr): [Type, UnifVars] {
  if (e.type === "ref") {
    const t = elabRef(c, e);
    return [t, us];
  } else if (e.type === "parameter") {
    const index = extractIndexFromParameter(e);
    return us.newvar(index);
  } else if (e.type === "integer") {
    return [BuiltinTypes.Integer, us];
  } else if (e.type === "boolean") {
    return [BuiltinTypes.Boolean, us];
  } else if (e.type === "string") {
    return [BuiltinTypes.String, us];
  } else if (e.type === "binary") {
    return elabBinary(c, us, e);
  } else {
    return notImplementedYet(e);
  }
}

function doCreateFunc(
  g: Global,
  s: CreateFunctionStatement
): [QName, UnifVars, SetT] {
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
