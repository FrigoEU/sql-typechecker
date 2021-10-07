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
  ExprCall,
  ExprRef,
  ExprUnary,
  From,
  Name,
  // astVisitor,
  NodeLocation,
  parse,
  PGNode,
  QName,
  SelectedColumn,
  SelectStatement,
  Statement,
  toSql,
} from "pgsql-ast-parser";
import { builtinoperators } from "./builtinoperators";
import { builtinUnaryOperators } from "./builtinunaryoperators";

export type Type = SimpleT | SetT;
export type AnyScalarT = {
  kind: "anyscalar";
};
export type NullableT<T> = {
  kind: "nullable";
  typevar: T;
};
export type ArrayT<T> = {
  kind: "array";
  subtype: "array" | "list";
  typevar: T;
};
export type ScalarT = {
  kind: "scalar";
  name: QName;
};
export type SimpleT =
  | AnyScalarT
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
  Numeric: {
    kind: "scalar",
    name: { name: "numeric" },
  },
  Bigint: {
    kind: "scalar",
    name: { name: "bigint" },
  },
  Text: {
    kind: "scalar",
    name: { name: "text" },
  },
  AnyScalar: {
    kind: "anyscalar",
  },
  Date: {
    kind: "scalar",
    name: { name: "date" },
  },
  Time: {
    kind: "scalar",
    name: { name: "time" },
  },
  Timestamp: {
    kind: "scalar",
    name: { name: "timestamp" },
  },
  Interval: {
    kind: "scalar",
    name: { name: "interval" },
  },
  Json: {
    kind: "scalar",
    name: { name: "json" },
  },
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
    subtype: "array",
    typevar: t,
  }),
  List: <T>(t: T): ArrayT<T> => ({
    kind: "array",
    subtype: "list",
    typevar: t,
  }),
} as const;

function isNullable(t: Type) {
  return t.kind === "nullable";
}

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

function eqType(t1: Type, t2: Type): boolean {
  if (t1.kind === "anyscalar") {
    return t2.kind === "anyscalar";
  } else if (t1.kind === "nullable") {
    return t2.kind === "nullable" && eqType(t1.typevar, t2.typevar);
  } else if (t1.kind === "array") {
    return (
      t2.kind === "array" &&
      t1.subtype === t2.subtype &&
      eqType(t1.typevar, t2.typevar)
    );
  } else if (t1.kind === "scalar") {
    return t2.kind === "scalar" && eqQNames(t1.name, t2.name);
  } else if (t1.kind === "set") {
    return (
      t2.kind === "set" &&
      t1.fields.length == t2.fields.length &&
      t1.fields.reduce(
        (acc: boolean, field, i) =>
          acc &&
          field.name?.name === t2.fields[i].name?.name &&
          eqType(field.type, t2.fields[i].type),
        true
      )
    );
  } else {
    return checkAllCasesHandled(t1);
  }
}

function unify(e: Expr, source: Type, target: Type, casttype: CastType): Type {
  if (source.kind === "set") {
    if (target.kind === "set") {
      return unifySets(e, source, target, casttype);
    } else {
      return unifySetWithSimple(e, source, target, casttype);
    }
  } else {
    if (target.kind === "set") {
      return unifySetWithSimple(e, target, source, casttype);
    } else {
      return unifySimples(e, source, target, casttype);
    }
  }
}

function unifySets(
  e: Expr,
  source: SetT,
  target: SetT,
  casttype: CastType
): SetT {
  if (source.fields.length !== target.fields.length) {
    throw new TypeMismatch(e, { expected: source, actual: target });
  }
  const newFields = source.fields.map((sf, i) => {
    const tf = target.fields[i];
    const t = unifySimples(e, sf.type, tf.type, casttype);
    return {
      name: sf.name || tf.name,
      type: t,
    };
  });
  return {
    kind: "set",
    fields: newFields,
  };
}

function unifySetWithSimple(
  e: Expr,
  source: SetT,
  target: SimpleT,
  casttype: CastType
): SimpleT {
  // TODO add warning if no LIMIT 1
  if (source.fields.length === 0) {
    throw new TypeMismatch(
      e,
      { expected: source, actual: target },
      "Set has no fields"
    );
  }
  if (source.fields.length > 1) {
    throw new TypeMismatch(
      e,
      { expected: source, actual: target },
      "More than one row returned by a subquery used as an expression"
    );
  }
  return unifySimples(e, source.fields[0].type, target, casttype);
}

function unifySimples(
  e: Expr,
  source: SimpleT,
  target: SimpleT,
  type: CastType
): SimpleT {
  // T -> Nullable<T> is a universal cast
  if (source.kind === "nullable" && target.kind === "scalar") {
    return nullify(unifySimples(e, source.typevar, target, type));
  }
  if (target.kind === "nullable" && source.kind === "scalar") {
    return nullify(unifySimples(e, source, target.typevar, type));
  }

  if (target.kind === "anyscalar") {
    return source;
  }
  if (source.kind === "anyscalar") {
    return target;
  } else if (source.kind === "nullable") {
    if (target.kind === "nullable") {
      const res = unifySimples(e, source.typevar, target.typevar, type);
      return { ...source, typevar: res };
    } else {
      throw new TypeMismatch(e, { expected: source, actual: target });
    }
  } else if (source.kind === "array") {
    if (target.kind === "array" && source.subtype === target.subtype) {
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
  readonly froms: ReadonlyArray<{
    readonly name: Name;
    readonly type: SetT;
  }>;
  readonly decls: ReadonlyArray<{
    readonly name: Name;
    readonly type: Type;
    // | ScalarT // declare bindings and function parameters
    // | ParametrizedT<ScalarT> // declare bindings and function parameters
    // | SetT; // with, (temp tables?)
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
    return notnullable ? t_ : nullify(t_);
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
          throw new UnknownIdentifier(c.like, targetTable);
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

export function elabSelect(g: Global, c: Context, s: SelectStatement): SetT {
  if (s.type === "select") {
    const newC: Context = doFroms(g, c, s.from || []);

    if (s.where) {
      const t = elabExpr(g, newC, s.where);
      requireBoolean(s.where, t);
    }

    const fields = (s.columns || []).flatMap((c: SelectedColumn): Field[] => {
      const n = c.alias ? c.alias : deriveNameFromExpr(c.expr);

      const t = elabExpr(g, newC, c.expr);

      if (t.kind === "set") {
        if (t.fields.length === 0) {
          throw new KindMismatch(c.expr, t, "Set with no fields");
        } else if (t.fields.length === 1) {
          return [{ name: n, type: t.fields[0].type }];
        } else {
          // AFAIK, * is the only way to introduce multiple fields with one expression
          if (c.expr.type === "ref" && c.expr.name === "*") {
            return t.fields;
          } else {
            throw new KindMismatch(c.expr, t, "Set with more than one field");
          }
        }
      }

      return [{ name: n, type: t }];
    });
    return {
      kind: "set",
      fields,
    };
  } else if (s.type === "union" || s.type === "union all") {
    const typeL = elabSelect(g, c, s.left);
    const typeR = elabSelect(g, c, s.right);
    return unifySets(s, typeL, typeR, "implicit");
  } else if (s.type === "values") {
    return notImplementedYet(s);
  } else {
    return notImplementedYet(s);
  }
}

export function doCreateFunction(
  g: Global,
  c: Context,
  s: CreateFunctionStatement
): {
  name: QName;
  inputs: { name: Name; type: SimpleT }[];
  returns: Type | null;
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
      froms: c.froms,
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
      const returnType = elabStatement(g, contextForBody, lastStatement);

      return {
        name,
        inputs,
        returns: returnType,
        multipleRows: true, // todo
      };
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

class ErrorWithLocation extends Error {
  constructor(l: NodeLocation | undefined, m: string) {
    super(`${showLocation(l)}: ${m}`);
  }
}

class NotImplementedYet extends ErrorWithLocation {
  constructor(node: PGNode | null) {
    const m = node
      ? `: \n
${JSON.stringify(node)} @ ${node._location}`
      : "";
    super(node?._location, `NotImplementedYet: ${m}`);
  }
}

class UnknownField extends ErrorWithLocation {
  constructor(e: Expr, s: SetT, n: Name) {
    super(
      e._location,
      `UnknownField ${n.name} @ ${showLocation(
        n._location
      )} in ${JSON.stringify(s)}`
    );
  }
}
export class UnknownIdentifier extends ErrorWithLocation {
  constructor(e: PGNode, m: QName) {
    super(
      e._location,
      `UnknownIdentifier ${showQName(m)} @ ${showLocation(m._location)}`
    );
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
    } else if (t.kind === "anyscalar") {
      return "anyscalar";
    } else {
      return checkAllCasesHandled(t);
    }
  }
}
export class UnknownUnaryOp extends ErrorWithLocation {
  constructor(e: Expr, n: QName, t1: Type) {
    super(
      e._location,
      `Can't apply unary operator "${showQName(n)}" to ${printType(t1)}`
    );
  }
}
export class UnknownBinaryOp extends ErrorWithLocation {
  constructor(e: Expr, n: QName, t1: Type, t2: Type) {
    super(
      e._location,
      `Can't apply operator "${showQName(n)}" to ${printType(
        t1
      )} and ${printType(t2)}`
    );
  }
}
export class UnknownFunction extends ErrorWithLocation {
  constructor(e: Expr, n: QName) {
    super(e._location, `Unknown function "${showQName(n)}"`);
  }
}
export class InvalidArguments extends ErrorWithLocation {
  constructor(e: Expr, n: QName, argTs: Type[]) {
    const argsString = argTs.map((t) => printType(t)).join(", ");
    super(
      e._location,
      `Can't apply function "${showQName(n)}" to arguments: ${argsString}`
    );
  }
}
export class TypecheckerError extends ErrorWithLocation {
  constructor(e: Expr, m: string) {
    super(e._location, `Typechecker error: ${m}`);
  }
}
class AmbiguousIdentifier extends ErrorWithLocation {
  constructor(e: Expr, m: QName, sets: QName[]) {
    super(
      e._location,
      `AmbiguousIdentifier ${showQName(m)} @ ${showLocation(
        m._location
      )} present in ${JSON.stringify(sets)}`
    );
  }
}
class KindMismatch extends ErrorWithLocation {
  constructor(e: Expr, type: Type, errormsg: string) {
    super(e._location, `KindMismatch: ${e}: ${type}: ${errormsg}}`);
  }
}
export class TypeMismatch extends Error {
  constructor(
    e: Expr,
    ts: {
      expected: Type;
      actual: Type;
    },
    mess?: string
  ) {
    super(
      `
TypeMismatch:
${toSql.expr(e)} ${mess ? ": " + mess : ""}

Expected:
${JSON.stringify(ts.expected)}

Actual:
${JSON.stringify(ts.actual)}}
`
    );
  }
}

const warnings: [Expr, string][] = [];
function registerWarning(e: Expr, message: string) {
  warnings.push([e, message]);
}

function mergeHandledFroms(c: Context, handledFroms: HandledFrom[]): Context {
  return {
    ...c,
    froms: c.froms.concat(
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
      throw new UnknownIdentifier(f, f.name);
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
      const t = elabExpr(g, mergeHandledFroms(c, newHandledFroms), f.join.on);
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

function lookupInSet(s: SetT, name: Name): SimpleT | null {
  const found = s.fields.find((f) => f.name && f.name.name === name.name);
  if (found) {
    return found.type;
  } else {
    return null;
  }
}

function elabRef(c: Context, e: ExprRef): Type {
  if (e.name === "*") {
    return {
      kind: "set",
      fields: c.froms.reduce(
        (acc: Field[], from) => acc.concat(from.type.fields),
        []
      ),
    };
  } else {
    const tableName = e.table;
    if (tableName) {
      const table = c.froms.find((d) => eqQNames(d.name, tableName));
      if (!table) {
        throw new UnknownIdentifier(e, tableName);
      }
      if (!(table.type.kind === "set")) {
        throw new KindMismatch(e, table.type, "Expecting Set");
      }
      const field = lookupInSet(table.type, e);
      if (!field) {
        throw new UnknownField(e, table.type, e);
      }
      return field;
    } else {
      const foundFields: {
        set: QName;
        field: Name;
        type: SimpleT;
      }[] = mapPartial(c.froms, (t) => {
        const foundfield = lookupInSet(t.type, e);
        return foundfield ? { set: t.name, field: e, type: foundfield } : null;
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
          throw new UnknownIdentifier(e, e);
        } else if (foundIdentifiers.length === 1) {
          return foundIdentifiers[0].type;
        } else {
          throw new AmbiguousIdentifier(e, e, []);
        }
      } else if (foundFields.length === 1) {
        return foundFields[0].type;
      } else {
        throw new AmbiguousIdentifier(
          e,
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

export type unaryOp = {
  operand: SimpleT;
  result: SimpleT;
  name: QName;
  description: string;
};

function isNotEmpty<A>(a: A | null | undefined): a is A {
  return a !== null && a !== undefined;
}

function elabUnaryOp(g: Global, c: Context, e: ExprUnary): Type {
  const t1 = elabExpr(g, c, e.operand);

  if (t1.kind === "set") {
    throw new KindMismatch(e, t1, "Can't apply unary operator to set");
  }

  const found = builtinUnaryOperators
    .filter(function (op) {
      return eqQNames(
        {
          name: e.op,
          schema: e.opSchema,
        },
        op.name
      );
    })
    .map(function (op) {
      try {
        const res = unifySimples(e, t1, op.operand, "implicit");
        // If it's an exact match, so no type coersion, we want it higher on the resolution priority
        const score = eqType(res, t1) || eqType(res, nullify(t1)) ? 0 : 1;
        return [score, op] as const;
      } catch {
        return null;
      }
    })
    .filter(isNotEmpty)
    .sort((m1, m2) => (m1[0] > m2[0] ? 1 : -1))[0];

  if (!found) {
    throw new UnknownUnaryOp(e, { name: e.op, schema: e.opSchema }, t1);
  } else {
    const op = found[1];
    if (op.name.name.toLowerCase() === "is null" && !isNullable(t1)) {
      registerWarning(e, "IS NULL check but operand is not nullable");
    }
    return op.result;
  }
}
function elabBinaryOp(g: Global, c: Context, e: ExprBinary): Type {
  const t1 = elabExpr(g, c, e.left);
  const t2 = elabExpr(g, c, e.right);

  if (t1.kind === "set" || t2.kind === "set") {
    return notImplementedYet(e);
  }

  // Specific test on = NULL, because it's always False (I think?) and is a cause of a lot of bugs
  if (e.op === "=" && (e.left.type === "null" || e.right.type === "null")) {
    throw new Error(
      `Don't use \"= NULL\", use "IS NULL" instead @ ${showLocation(
        e._location
      )}`
    );
  }

  if (e.op === "IN" || e.op === "NOT IN") {
    // No generics, so special casing this operator
    unifySimples(e, t2, BuiltinTypeConstructors.List(t1), "implicit");
    return BuiltinTypes.Boolean;
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
    .map(function (op) {
      try {
        const res1 = unifySimples(e, t1, op.left, "implicit");
        const res2 = unifySimples(e, t2, op.right, "implicit");
        const score1 = eqType(res1, t1) || eqType(res1, nullify(t1)) ? 0 : 1;
        const score2 = eqType(res2, t2) || eqType(res2, nullify(t2)) ? 0 : 1;
        return [score1 + score2, op] as const;
      } catch {
        return null;
      }
    })
    .filter(isNotEmpty)
    .sort((m1, m2) => (m1[0] > m2[0] ? 1 : -1))[0];

  if (!found) {
    throw new UnknownBinaryOp(e, { name: e.op, schema: e.opSchema }, t1, t2);
  } else {
    return found[1].result;
  }
}

function elabCall(g: Global, c: Context, e: ExprCall): Type {
  const argTypes = e.args.map((arg) => elabExpr(g, c, arg));

  if (
    eqQNames(e.function, { name: "any" }) ||
    eqQNames(e.function, { name: "some" }) ||
    eqQNames(e.function, { name: "all" })
  ) {
    if (e.args.length !== 1) {
      throw new InvalidArguments(e, e.function, argTypes);
    }
    const t = argTypes[0];
    if (t.kind === "set") {
      throw new InvalidArguments(e, e.function, [t]);
    }
    const unifiedT = unifySimples(
      e,
      t,
      BuiltinTypeConstructors.Array(BuiltinTypes.AnyScalar),
      "implicit"
    );
    if (unifiedT.kind !== "array") {
      throw new TypecheckerError(e, "Expecting array type");
    } else {
      return unifiedT.typevar;
    }
  }
  if (
    eqQNames(e.function, { name: "coalesce" }) ||
    eqQNames(e.function, { name: "nullif" })
  ) {
    if (e.args.length === 0) {
      throw new InvalidArguments(e, e.function, []);
    }
    const types: [Expr, SimpleT][] = e.args
      .map((arg) => [arg, elabExpr(g, c, arg)] as const)
      .map(([arg, t]) => {
        if (t.kind === "set") {
          throw new InvalidArguments(e, e.function, [t]);
        } else {
          return [arg, t];
        }
      });
    const unifiedType = types.reduce(
      (acc, [arg, t]) => unifySimples(arg, acc, t, "implicit"),
      types[0][1]
    );
    if (eqQNames(e.function, { name: "coalesce" })) {
      if (types.some(([_arg, t]) => !isNullable(t))) {
        return unnullify(unifiedType);
      } else {
        return unifiedType;
      }
    } else {
      // nullable types already "win" unification, so nullif doesn't need special logic
      return unifiedType;
    }
  }

  throw new UnknownFunction(e, e.function);
}

function elabExpr(g: Global, c: Context, e: Expr): Type {
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
    return BuiltinTypes.Text;
  } else if (e.type === "unary") {
    return elabUnaryOp(g, c, e);
  } else if (e.type === "binary") {
    return elabBinaryOp(g, c, e);
  } else if (e.type === "null") {
    return BuiltinTypes.AnyScalar;
  } else if (e.type === "numeric") {
    return BuiltinTypes.Numeric;
  } else if (e.type === "list" || e.type === "array") {
    const typevars = e.expressions.map((subexpr) => elabExpr(g, c, subexpr));
    const typevar = typevars.reduce((acc: SimpleT, t: Type) => {
      if (t.kind === "set") {
        throw new Error(
          `Can't have sets inside lists / arrays @ ${e._location} `
        );
      } else {
        return unifySimples(e, t, acc, "implicit");
      }
    }, BuiltinTypes.AnyScalar);
    return e.type === "list"
      ? BuiltinTypeConstructors.List(typevar)
      : BuiltinTypeConstructors.Array(typevar);
  } else if (e.type === "call") {
    return elabCall(g, c, e);
  } else if (e.type === "array select") {
    const selectType = elabSelect(g, c, e.select);
    const t = unifySetWithSimple(
      e,
      selectType,
      BuiltinTypes.AnyScalar,
      "implicit"
    );
    return BuiltinTypeConstructors.Array(t);
  } else if (e.type === "default") {
    // ??
    return BuiltinTypes.AnyScalar;
  } else if (e.type === "extract") {
    const t = elabExpr(g, c, e.from);
    try {
      unify(e.from, t, BuiltinTypes.Interval, "implicit");
      return BuiltinTypes.Numeric;
    } catch {}
    try {
      unify(e.from, t, BuiltinTypes.Time, "implicit");
      return BuiltinTypes.Numeric;
    } catch {}
    unify(e.from, t, BuiltinTypes.Timestamp, "implicit");
    return BuiltinTypes.Numeric;
  } else if (e.type === "member") {
    const t = elabExpr(g, c, e.operand);
    // can also unify with jsonb but there are conversions between json and jsonb so it's OK
    unify(e.operand, t, BuiltinTypes.Json, "implicit");
    return BuiltinTypes.AnyScalar;
  } else if (e.type === "keyword") {
    if (e.keyword === "current_time") {
      return BuiltinTypes.Time;
    } else if (e.keyword === "current_date") {
      return BuiltinTypes.Date;
    } else if (
      e.keyword === "current_role" ||
      e.keyword === "current_timestamp" ||
      e.keyword === "localtimestamp" ||
      e.keyword === "localtime"
    ) {
      return BuiltinTypes.Timestamp;
    } else if (
      e.keyword === "current_catalog" ||
      e.keyword === "current_schema" ||
      e.keyword === "session_user" ||
      e.keyword === "user" ||
      e.keyword === "current_user"
    ) {
      return BuiltinTypes.Text;
    } else if (e.keyword === "distinct") {
      throw new Error("Don't know what to do with distinct keyword");
    } else {
      return checkAllCasesHandled(e.keyword);
    }
  } else if (e.type === "arrayIndex") {
    const arrayT = elabExpr(g, c, e.array);
    const indexT = elabExpr(g, c, e.index);
    const unifiedArrayT = unify(
      e.array,
      arrayT,
      BuiltinTypeConstructors.Array(BuiltinTypes.AnyScalar),
      "implicit"
    );
    unify(e.array, indexT, BuiltinTypes.Integer, "implicit");
    if (unifiedArrayT.kind === "set") {
      throw new TypeMismatch(e.array, {
        expected: arrayT,
        actual: BuiltinTypeConstructors.Array(BuiltinTypes.AnyScalar),
      });
    } else {
      const unnulified = unnullify(unifiedArrayT);
      if (unnulified.kind !== "array") {
        throw new TypeMismatch(e.array, {
          expected: arrayT,
          actual: BuiltinTypeConstructors.Array(BuiltinTypes.AnyScalar),
        });
      } else {
        return nullify(unnulified.typevar);
      }
    }
  } else if (e.type === "case") {
    if (e.value) {
      const valueT = elabExpr(g, c, e.value);
      const conditionTs: [Expr, Type][] = e.whens.map((whenExp) => [
        whenExp.when,
        elabExpr(g, c, whenExp.when),
      ]);
      conditionTs.reduce(
        (acc, [exp, conditionT]) => unify(exp, acc, conditionT, "implicit"),
        valueT
      );
    } else {
      const conditionTs: [Expr, Type][] = e.whens.map((whenExp) => [
        whenExp.when,
        elabExpr(g, c, whenExp.when),
      ]);
      conditionTs.forEach(([exp, conditionT]) =>
        unify(exp, BuiltinTypes.Boolean, conditionT, "implicit")
      );
    }
    if (e.whens.length === 0) {
      throw new Error("Not expecting CASE statement without when");
    }
    const whensT = e.whens.reduce(
      (acc: Type, whenExp) =>
        unify(whenExp.value, acc, elabExpr(g, c, whenExp.value), "implicit"),
      elabExpr(g, c, e.whens[0].value)
    );
    return e.else
      ? unify(e.else, whensT, elabExpr(g, c, e.else), "implicit")
      : whensT;
  } else if (
    e.type === "select" ||
    e.type === "union" ||
    e.type === "union all" ||
    e.type === "values" ||
    e.type === "with" ||
    e.type === "with recursive"
  ) {
    return elabSelect(g, c, e);
  } else {
    return notImplementedYet(e);
  }
}

function elabStatement(g: Global, c: Context, s: Statement): null | Type {
  if (
    s.type === "select" ||
    s.type === "union" ||
    s.type === "union all" ||
    s.type === "with" ||
    s.type === "with recursive" ||
    s.type === "values"
  ) {
    return elabExpr(g, c, s);
  } else {
    return notImplementedYet(s);
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
      type: nullify(c.type),
    })),
  };
}

function nullify(s: SimpleT): SimpleT {
  if (s.kind === "nullable") {
    return s;
  } else {
    return BuiltinTypeConstructors.Nullable(s);
  }
}

function unnullify(s: SimpleT): SimpleT {
  if (s.kind === "nullable") {
    return s.typevar;
  } else {
    return s;
  }
}

function checkAllCasesHandled(_: never): any {
  throw new Error("Oops didn't expect that");
}

function showQName(n: QName): string {
  return n.schema ? n.schema + "." + n.name : n.name;
}

function eqQNames<U extends QName, V extends QName>(u: U, v: V): boolean {
  return (
    u.name.toLowerCase() === v.name.toLowerCase() &&
    ((!u.schema && (v.schema === "dbo" || v.schema === "pg_catalog")) ||
      ((u.schema === "dbo" || u.schema === "pg_catalog") && !v.schema) ||
      (!u.schema && !v.schema) ||
      u.schema?.toLowerCase() === v.schema?.toLowerCase())
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
