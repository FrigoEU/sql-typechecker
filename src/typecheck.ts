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
  ExprRef,
  From,
  Name,
  // astVisitor,
  NodeLocation,
  parse,
  PGNode,
  QName,
  SelectedColumn,
  SelectFromStatement,
  Statement,
  toSql,
} from "pgsql-ast-parser";
import { builtinoperators } from "./builtinoperators";

export type Type = SimpleT | SetT;
export type NullableT<T> = {
  kind: "nullable";
  typevar: T;
};
export type ArrayT<T> = {
  kind: "array";
  typevar: T;
};
export type ScalarT = {
  kind: "scalar";
  name: QName;
};
export type SimpleT =
  | ScalarT
  | NullableT<any>
  | ArrayT<any>
  | NullableT<ArrayT<any>>;
type Field = {
  name: Name | null;
  type: SimpleT;
};
export type SetT = {
  kind: "set";
  fields: Field[];
};

export const BuiltinTypes = {
  Boolean: {
    kind: "scalar",
    name: { name: "boolean" },
  },
  Smallint: {
    kind: "scalar",
    name: { name: "smallint" },
  },
  Integer: {
    kind: "scalar",
    name: { name: "integer" },
  },
  Bigint: {
    kind: "scalar",
    name: { name: "bigint" },
  },
  String: {
    kind: "scalar",
    name: { name: "text" },
  },
  // Any: {
  //   kind: "scalar",
  //   name: { name: "any" },
  //   typevar: null,
  // },
} as const;

function requireBoolean(e: Expr, t: Type): void {
  if (t.kind === "scalar" && eqQNames(t.name, BuiltinTypes.Boolean.name)) {
    return;
  } else {
    throw new TypeMismatch(e, {
      expected: BuiltinTypes.Boolean,
      actual: t,
    });
  }
}

export const BuiltinTypeConstructors = {
  Nullable: <T>(t: T): NullableT<T> => ({
    kind: "nullable",
    typevar: t,
  }),
  Array: <T>(t: T): ArrayT<T> => ({
    kind: "array",
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

function unifySimples(
  e: Expr,
  source: SimpleT,
  target: SimpleT,
  type: CastType
): SimpleT {
  // T -> Nullable<T> is a universal cast
  if (source.kind === "nullable" && target.kind === "scalar") {
    return BuiltinTypeConstructors.Nullable(
      unifySimples(e, source.typevar, target, type)
    );
  }
  if (target.kind === "nullable" && source.kind === "scalar") {
    return BuiltinTypeConstructors.Nullable(
      unifySimples(e, source, target.typevar, type)
    );
  }

  if (source.kind === "nullable") {
    if (target.kind === "nullable") {
      const res = unifySimples(e, source.typevar, target.typevar, type);
      return { ...source, typevar: res };
    } else {
      throw new TypeMismatch(e, { expected: source, actual: target });
    }
  } else if (source.kind === "array") {
    if (target.kind === "array") {
      const res = unifySimples(e, source.typevar, target.typevar, type);
      return { ...source, typevar: res };
    } else {
      throw new TypeMismatch(e, { expected: source, actual: target });
    }
  } else if (source.kind === "scalar") {
    if (target.kind === "scalar") {
      return unifyScalars(e, source, target, type);
    } else {
      // simple - parametrized
      throw new TypeMismatch(e, { expected: source, actual: target });
    }
  } else {
    return checkAllCasesHandled(source);
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
function unifyScalars(
  e: Expr,
  source: ScalarT,
  target: ScalarT,
  type: CastType
): ScalarT {
  // list casts = \dC+

  const casts: { source: ScalarT; target: ScalarT; type: CastType }[] = [
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
      throw new TypeMismatch(e, { expected: source, actual: target });
    }
  }
}

// Lexical scoping
export type Context = {
  readonly decls: ReadonlyArray<{
    readonly name: Name;
    readonly type: Type;
    // | ScalarT // declare bindings and function parameters
    // | ParametrizedT<ScalarT> // declare bindings and function parameters
    // | SetT; // from-tables, from-views, with, (temp tables?)
  }>;
};

export function notImplementedYet(node: PGNode | null): any {
  throw new NotImplementedYet(node);
}

function mkType(t: DataTypeDef, cs: ColumnConstraint[]): SimpleT {
  const mapTypenames: { [n: string]: ScalarT } = {
    int: BuiltinTypes.Integer,
  };
  if (t.kind === "array") {
    if (t.arrayOf.kind === "array") {
      throw new Error("Array or array not supported");
    } else {
      return BuiltinTypeConstructors.Array(
        mapTypenames[t.arrayOf.name] || { kind: "scalar", name: t.arrayOf }
      );
    }
  } else {
    const t_: ScalarT = mapTypenames[t.name] || {
      kind: "scalar",
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
  _g: Global,
  s: CreateViewStatement | CreateMaterializedViewStatement
): Global {
  return notImplementedYet(s);
}
function doAlterTable(_g: Global, s: AlterTableStatement): Global {
  return notImplementedYet(s);
}

function deriveNameFromExpr(expr: Expr): Name | null {
  if (expr.type === "ref") {
    return { name: expr.name };
  } else if (expr.type === "parameter") {
    return null;
  } else {
    // return notImplementedYet(expr);
    return null;
  }
}

export function doSelectFrom(
  g: Global,
  c: Context,
  s: SelectFromStatement
): SetT {
  const newC: Context = doFroms(g, c, s.from || []);

  if (s.where) {
    const t = elabExpr(newC, s.where);
    requireBoolean(s.where, t);
  }

  const fields = (s.columns || []).map(
    (c: SelectedColumn): Field => {
      const n = c.alias ? c.alias : deriveNameFromExpr(c.expr);

      const t = elabExpr(newC, c.expr);

      if (t.kind === "set") {
        throw new KindMismatch(c.expr, t, "Can only be scalar or array type");
      }

      const field: Field = { name: n, type: t };

      return field;
    }
  );
  return {
    kind: "set",
    fields,
  };
}

export function doCreateFunction(
  g: Global,
  c: Context,
  s: CreateFunctionStatement
): {
  name: QName;
  inputs: { name: Name; type: SimpleT }[];
  returns: ScalarT | SetT | null;
  multipleRows: boolean;
} {
  const name = s.name;
  if (!s.language) {
    throw new Error(
      "Please provide name for function at " + showLocation(s._location)
    );
  }
  if (s.language && s.language.name.toLowerCase() === "sql") {
    const inputs = s.arguments.map((arg) => {
      if (!arg.name) {
        throw new Error(
          "Please provide name for all function arguments at " +
            showLocation(s._location)
        );
      }
      return {
        name: arg.name,
        type: mkType(
          arg.type,
          // Default rule of THIS typechecker:  params are NOT NULL
          // , unless defined as eg: (myname int default null)
          arg.default && arg.default.type === "null"
            ? []
            : [{ type: "not null" }]
        ),
      };
    });
    const contextForBody: Context = {
      decls: c.decls.concat(inputs),
    };

    const body = parse(s.code);

    if (body.length === 0) {
      return {
        name,
        inputs,
        returns: null,
        multipleRows: false,
      };
    } else {
      // TODO check rest of body for type errors
      const lastStatement = body[body.length - 1];

      if (lastStatement.type === "select") {
        const res = doSelectFrom(g, contextForBody, lastStatement);
        return {
          name,
          inputs,
          returns: res,
          multipleRows: true, // todo
        };
      } else {
        return notImplementedYet(lastStatement);
      }
    }
  } else {
    return notImplementedYet(s);
  }
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
export class UnknownIdentifier extends Error {
  constructor(m: QName) {
    super(`UnknownIdentifier ${showQName(m)} @ ${showLocation(m._location)}`);
  }
}

export function printType(t: Type): string {
  if (t.kind === "set") {
    return (
      "{" +
      t.fields
        .map(
          (f) =>
            (f.name === null ? `"?": ` : `"${f.name.name}": `) +
            printType(f.type)
        )
        .join(", ") +
      "}"
    );
  } else {
    if (t.kind === "array") {
      return "(" + printType(t.typevar) + ")" + "[]";
    } else if (t.kind === "nullable") {
      return printType(t.typevar) + " | null";
    } else if (t.kind === "scalar") {
      return t.name.name;
    } else {
      return checkAllCasesHandled(t);
    }
  }
}
export class UnknownBinaryOp extends Error {
  constructor(e: Expr, n: QName, t1: Type, t2: Type) {
    super(
      `Can't apply operator "${showQName(n)}" to ${printType(
        t1
      )} and ${printType(t2)}`
    );
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
export class TypeMismatch extends Error {
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
  handledFroms: HandledFrom[],
  f: From
): HandledFrom[] {
  debugger;
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

    const newHandledFroms_ =
      f.join && (f.join.type === "FULL JOIN" || f.join.type === "RIGHT JOIN")
        ? handledFroms.map((fr) => ({ ...fr, rel: nullifySet(fr.rel) }))
        : handledFroms;

    const newHandledFroms = newHandledFroms_.concat(newHandledFrom);

    if (f.join?.on) {
      const t = elabExpr(mergeHandledFroms(c, newHandledFroms), f.join.on);
      requireBoolean(f.join.on, t);
    }

    return newHandledFroms;
  }
}
function doFroms(g: Global, c: Context, froms: From[]): Context {
  const inFroms: HandledFrom[] = froms.reduce(function (
    acc: HandledFrom[],
    f: From
  ) {
    return doSingleFrom(g, c, acc, f);
  },
  []);
  return mergeHandledFroms(c, inFroms);
}

function lookup(c: Context, n: QName): Type | null {
  const found = c.decls.find((d) => eqQNames(d.name, n));
  if (found) {
    return found.type;
  } else {
    return null;
  }
}

// function extractIndexFromParameter(e: ExprParameter): number {
//   if (e.name.startsWith("$")) {
//     const sub = e.name.substring(1);
//     const parsed = parseInt(sub);
//     if (isNaN(parsed)) {
//       throw new Error(`Failed to parse parameter ${JSON.stringify(e)}`);
//     } else {
//       return parsed;
//     }
//   } else {
//     throw new Error(`Failed to parse parameter ${JSON.stringify(e)}`);
//   }
// }

function lookupInSet(s: SetT, name: Name): SimpleT | null {
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
        type: SimpleT;
      }[] = mapPartial(c.decls, (t) => {
        if (t.type.kind === "set") {
          const foundfield = lookupInSet(t.type, e);
          return foundfield
            ? { set: t.name, field: e, type: foundfield }
            : null;
        } else {
          return null;
        }
      });

      const foundIdentifiers = mapPartial(c.decls, (t) => {
        if (t.type.kind === "set") {
          return null;
        } else {
          return t.name.name === e.name
            ? { name: t.name.name, type: t.type }
            : null;
        }
      });

      // Fields seem to have precedence over eg: function params in postgres?
      if (foundFields.length === 0) {
        if (foundIdentifiers.length === 0) {
          throw new UnknownIdentifier(e);
        } else if (foundIdentifiers.length === 1) {
          return foundIdentifiers[0].type;
        } else {
          throw new AmbiguousIdentifier(e, []);
        }
      } else if (foundFields.length === 1) {
        return foundFields[0].type;
      } else {
        throw new AmbiguousIdentifier(
          e,
          foundFields.map((f) => f.set)
        );
      }
    }
  }
}

export type binaryOp = {
  left: SimpleT;
  right: SimpleT;
  result: SimpleT;
  name: QName;
  description: string;
};

function elabBinary(c: Context, e: ExprBinary): Type {
  debugger;
  const t1 = elabExpr(c, e.left);
  const t2 = elabExpr(c, e.right);

  if (t1.kind === "set" || t2.kind === "set") {
    return notImplementedYet(e);
  }

  const found = builtinoperators
    .filter(function (op) {
      return eqQNames(
        {
          name: e.op,
          schema: e.opSchema,
        },
        op.name
      );
    })
    .find(function (op) {
      try {
        unifySimples(e, t1, op.left, "implicit");
      } catch {
        return false;
      }
      try {
        unifySimples(e, t2, op.right, "implicit");
      } catch {
        return false;
      }
      return true;
    });

  if (!found) {
    throw new UnknownBinaryOp(e, { name: e.op, schema: e.opSchema }, t1, t2);
  } else {
    return found.result;
  }
}

function elabExpr(c: Context, e: Expr): Type {
  if (e.type === "ref") {
    const t = elabRef(c, e);
    return t;
  } else if (e.type === "parameter") {
    return notImplementedYet(e);
  } else if (e.type === "integer") {
    return BuiltinTypes.Integer;
  } else if (e.type === "boolean") {
    return BuiltinTypes.Boolean;
  } else if (e.type === "string") {
    return BuiltinTypes.String;
  } else if (e.type === "binary") {
    return elabBinary(c, e);
  } else {
    return notImplementedYet(e);
  }
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
      type:
        c.type.kind === "nullable"
          ? c.type
          : BuiltinTypeConstructors.Nullable(c.type),
    })),
  };
}

function checkAllCasesHandled(_: never): any {
  throw new Error("Oops didn't expect that");
}

function showQName(n: QName): string {
  return n.schema ? n.schema + "." + n.name : n.name;
}

function eqQNames<U extends QName, V extends QName>(u: U, v: V): boolean {
  return (
    u.name === v.name &&
    ((!u.schema && (v.schema === "dbo" || v.schema === "pg_catalog")) ||
      ((u.schema === "dbo" || u.schema === "pg_catalog") && !v.schema) ||
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

// function flatMapPartial<T, U>(a: T[], f: (t: T, i: number) => U[] | null): U[] {
//   const newA: U[] = [];
//   a.forEach(function (a, i) {
//     const res = f(a, i);
//     if (res === null) {
//     } else {
//       newA.push(...res);
//     }
//   });
//   return newA.reverse();
// }
