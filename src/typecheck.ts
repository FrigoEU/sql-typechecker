import assert from "assert";
import { isNil } from "lodash";
import {
  AlterTableStatement,
  ColumnConstraint,
  CreateFunctionStatement,
  CreateMaterializedViewStatement,
  CreateTableStatement,
  CreateViewStatement,
  DataTypeDef,
  DeleteStatement,
  Expr,
  ExprBinary,
  ExprCall,
  ExprRef,
  ExprUnary,
  From,
  InsertStatement,
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
  UpdateStatement,
} from "pgsql-ast-parser";
import { Either, Left } from "purify-ts";
import { builtincasts } from "./builtincasts";
import { builtinoperators } from "./builtinoperators";
import { builtinUnaryOperators } from "./builtinunaryoperators";
import { normalizeOperatorName, normalizeTypeName } from "./normalize";

export type Type = SimpleT | RecordT;
export type AnyScalarT = {
  kind: "anyscalar";
};
export type NullableT<T extends SimpleT> = {
  kind: "nullable";
  typevar: T;
};
export type ArrayT<T> = {
  kind: "array";
  subtype: "array" | "list";
  typevar: T;
};
export type JsonKnownT = {
  kind: "jsonknown";
  record: RecordT;
};
export type ScalarT = {
  kind: "scalar";
  name: QName;
};
export type VoidT = {
  // represents nothing, so zero rows, like when doing an INSERT without RETURNING
  kind: "void";
};
export type SimpleT =
  | AnyScalarT
  | JsonKnownT
  | ScalarT
  | NullableT<any>
  | ArrayT<any>;

type Field = {
  name: Name | null;
  type: SimpleT;
  expr: Expr | null;
};
export type RecordT = {
  kind: "record";
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
  Float2: {
    kind: "scalar",
    name: { name: "float2" },
  },
  Float4: {
    kind: "scalar",
    name: { name: "float4" },
  },
  Float8: {
    kind: "scalar",
    name: { name: "float8" },
  },
  Real: {
    kind: "scalar",
    name: { name: "real" },
  },
  Double: {
    kind: "scalar",
    name: { name: "double" },
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
  Jsonb: {
    kind: "scalar",
    name: { name: "jsonb" },
  },
  Null: {
    kind: "scalar", // correct?
    name: { name: "null" },
  },
} as const;

const allNumericBuiltinTypes = [
  BuiltinTypes.Smallint,
  BuiltinTypes.Integer,
  BuiltinTypes.Bigint,
  BuiltinTypes.Real,
  BuiltinTypes.Double,
  BuiltinTypes.Numeric,
  BuiltinTypes.Float2,
  BuiltinTypes.Float4,
  BuiltinTypes.Float8,
];

function requireBoolean(e: Expr, t: Type): void {
  if (
    (t.kind === "scalar" && eqQNames(t.name, BuiltinTypes.Boolean.name)) ||
    (t.kind === "nullable" &&
      t.typevar.kind === "scalar" &&
      eqQNames(t.typevar.name, BuiltinTypes.Boolean.name))
  ) {
    return;
  } else {
    throw new TypeMismatch(e, {
      expected: BuiltinTypes.Boolean,
      actual: t,
    });
  }
}

export const BuiltinTypeConstructors = {
  Nullable: <T extends SimpleT>(t: T): NullableT<T> => ({
    kind: "nullable",
    typevar: t,
  }),
  Array: <T extends SimpleT>(t: T): ArrayT<T> => ({
    kind: "array",
    subtype: "array",
    typevar: t,
  }),
  List: <T extends SimpleT>(t: T): ArrayT<T> => ({
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
    readonly rel: RecordT;
    readonly primaryKey: Name[];
    readonly defaults: Name[];
  }>;
  readonly views: ReadonlyArray<{
    readonly name: QName;
    readonly rel: RecordT;
  }>;
  readonly domains: ReadonlyArray<{
    readonly name: QName;
    readonly type: SimpleT;
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
  } else if (t1.kind === "jsonknown") {
    return t2.kind === "jsonknown" && eqType(t1.record, t2.record);
  } else if (t1.kind === "record") {
    return (
      t2.kind === "record" &&
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

function unify(e: Expr, source: Type, target: Type): Type {
  if (source.kind === "record") {
    if (target.kind === "record") {
      return unifyRecords(e, source, target);
    } else {
      return unifyRecordWithSimple(e, source, target);
    }
  } else {
    if (target.kind === "record") {
      return unifyRecordWithSimple(e, target, source);
    } else {
      return unifySimples(e, source, target);
    }
  }
}

function cast(e: Expr, source: Type, target: Type, casttype: CastType): void {
  if (source.kind === "record") {
    if (target.kind === "record") {
      castRecords(e, source, target, casttype);
    } else {
      castRecordToSimple(e, source, target, casttype);
    }
  } else {
    if (target.kind === "record") {
      castSimpleToRecord(e, source, target, casttype);
    } else {
      castSimples(e, source, target, casttype);
    }
  }
}

function castRecords(
  e: Expr,
  source: RecordT,
  target: RecordT,
  casttype: CastType
): void {
  if (source.fields.length !== target.fields.length) {
    throw new TypeMismatch(e, { expected: source, actual: target });
  }
  source.fields.forEach((sf, i) => {
    const tf = target.fields[i];
    castSimples(e, sf.type, tf.type, casttype);
  });
}

function unifyRecords(e: Expr, source: RecordT, target: RecordT): RecordT {
  if (source.fields.length !== target.fields.length) {
    throw new TypeMismatch(e, { expected: source, actual: target });
  }
  const newFields = source.fields.map((sf, i) => {
    const tf: Field = target.fields[i];
    const t = unifySimples(tf.expr || e, sf.type, tf.type);
    return {
      name: sf.name || tf.name,
      type: t,
      expr: tf.expr,
    };
  });
  return {
    kind: "record",
    fields: newFields,
  };
}

function castRecordToSimple(
  e: Expr,
  source: RecordT,
  target: SimpleT,
  casttype: CastType
): void {
  // TODO add warning if no LIMIT 1
  if (source.fields.length === 0) {
    throw new TypeMismatch(
      e,
      { expected: source, actual: target },
      "Record has no fields"
    );
  }
  if (source.fields.length > 1) {
    throw new TypeMismatch(
      e,
      { expected: source, actual: target },
      "More than one row returned by a subquery used as an expression"
    );
  }
  castSimples(e, source.fields[0].type, target, casttype);
}

function castSimpleToRecord(
  e: Expr,
  source: SimpleT,
  target: RecordT,
  casttype: CastType
): void {
  // TODO add warning if no LIMIT 1
  if (target.fields.length === 0) {
    throw new TypeMismatch(
      e,
      { expected: source, actual: target },
      "Record has no fields"
    );
  }
  if (target.fields.length > 1) {
    throw new TypeMismatch(
      e,
      { expected: source, actual: target },
      "More than one row returned by a subquery used as an expression"
    );
  }
  castSimples(e, source, target.fields[0].type, casttype);
}

function unifyRecordWithSimple(
  e: Expr,
  source: RecordT,
  target: SimpleT
): SimpleT {
  // TODO add warning if no LIMIT 1
  if (source.fields.length === 0) {
    throw new TypeMismatch(
      e,
      { expected: source, actual: target },
      "Record has no fields"
    );
  }
  if (source.fields.length > 1) {
    throw new TypeMismatch(
      e,
      { expected: source, actual: target },
      "More than one row returned by a subquery used as an expression"
    );
  }
  return unifySimples(e, source.fields[0].type, target);
}

function castSimples(
  e: Expr,
  source: SimpleT,
  target: SimpleT,
  type: CastType
): void {
  // T -> Nullable<T> is a universal cast
  if (target.kind === "nullable" && source.kind !== "nullable") {
    return castSimples(e, source, target.typevar, type);
  }

  if (source.kind === "anyscalar") {
    // ok
    return;
  } else if (source.kind === "nullable") {
    if (target.kind === "nullable") {
      return castSimples(e, source.typevar, target.typevar, type);
    } else {
      throw new TypeMismatch(e, { expected: source, actual: target });
    }
  } else if (source.kind === "array") {
    if (target.kind === "array" && source.subtype === target.subtype) {
      return castSimples(e, source.typevar, target.typevar, type);
    } else {
      throw new TypeMismatch(e, { expected: source, actual: target });
    }
  } else if (source.kind === "scalar") {
    if (target.kind === "scalar") {
      return castScalars(e, source, target, type);
    } else {
      // simple - parametrized
      throw new TypeMismatch(e, { expected: source, actual: target });
    }
  } else if (source.kind === "jsonknown") {
    if (target.kind === "jsonknown") {
      for (let field of source.record.fields) {
        const matchingFieldInTarget = target.record.fields.find(
          (f) => f.name === field.name
        );
        if (!matchingFieldInTarget) {
          throw new TypeMismatch(
            e,
            { expected: source, actual: target },
            `Missing field ${field.name}`
          );
        } else {
          castSimples(e, field.type, matchingFieldInTarget.type, type);
        }
      }
      return;
    } else {
      // simple - parametrized
      throw new TypeMismatch(e, { expected: source, actual: target });
    }
  } else {
    return checkAllCasesHandled(source);
  }
}

// Get the "biggest" type back, if implicit casting is possible
function unifySimples(e: Expr, source: SimpleT, target: SimpleT): SimpleT {
  try {
    castSimples(e, source, target, "implicit");
    return target;
  } catch {
    castSimples(e, target, source, "implicit");
    return source;
  }
}

function unifyOverloadedCall(
  call: ExprCall,
  argTypes: Type[],
  overloads: {
    expectedArgs: SimpleT[];
    returnT: SimpleT;
  }[]
): SimpleT {
  // This is probably bad, among others for performance, as we use error handling for control flow here
  for (let overload of overloads) {
    try {
      const res = unifyCallGeneral(
        call,
        argTypes,
        overload.expectedArgs,
        overload.returnT
      );
      return res;
    } catch (err) {
      // do nothing, we try the next one
    }
  }
  throw new InvalidArguments(call, call.function, argTypes);
}

function unifyCallGeneral(
  call: ExprCall,
  argTypes: Type[],
  expectedArgs: SimpleT[],
  returnT: SimpleT
): SimpleT {
  if (argTypes.length !== expectedArgs.length) {
    throw new InvalidArguments(call, call.function, argTypes);
  }
  for (let i = 0; i < expectedArgs.length; i++) {
    const arg = argTypes[i];
    const expectedArg = expectedArgs[i];
    const simplifiedArg = toSimpleT(arg);
    if (simplifiedArg === null) {
      throw new CantReduceToSimpleT(call.args[i], arg);
    }
    unifySimples(call, simplifiedArg, expectedArg);
  }
  return returnT;
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
export type CastType = "implicit" | "assignment" | "explicit";
function castScalars(
  e: Expr,
  source: ScalarT,
  target: ScalarT,
  type: CastType
): void {
  // list casts = \dC+

  const matchingCast = findMatchingCast([source.name], source, target, type);
  if (matchingCast === null) {
    throw new TypeMismatch(e, { expected: target, actual: source });
  }
}

function findMatchingCast(
  visited: QName[],
  from: ScalarT,
  to: ScalarT,
  type: CastType
): {
  source: ScalarT;
  target: ScalarT;
  type: CastType;
} | null {
  const casts = builtincasts;

  if (eqQNames(from.name, to.name)) {
    return { source: from, target: to, type: "implicit" };
  } else {
    const halfMatching = casts.filter(
      (c) =>
        eqQNames(c.source.name, from.name) &&
        (c.type === type ||
          (c.type === "implicit" && type === "assignment") ||
          (c.type === "implicit" && type === "explicit")) &&
        !visited.some((v) => eqQNames(v, c.target.name))
    );

    const matchingCast = halfMatching.find((c) =>
      eqQNames(c.target.name, to.name)
    );
    if (!isNil(matchingCast)) {
      // ok
      return matchingCast;
    } else if (type === "explicit") {
      for (let halfM of halfMatching) {
        const found = findMatchingCast(
          visited.concat(from.name),
          halfM.target,
          to,
          type
        );
        if (!isNil(found)) {
          return found;
        }
      }
      return null;
    } else {
      return null;
    }
  }
}

// Lexical scoping
export type Context = {
  readonly froms: ReadonlyArray<{
    // used in INSERT as well, name is not great
    readonly name: Name;
    readonly type: RecordT;
  }>;
  readonly decls: ReadonlyArray<{
    readonly name: Name;
    readonly type:
      | Type
      | VoidT /* with statement can return bindings of type void */;
    // | ScalarT // declare bindings and function parameters
    // | ParametrizedT<ScalarT> // declare bindings and function parameters
    // | RecordT; // with, (temp tables?)
  }>;
};

export function notImplementedYet(node: PGNode | null): any {
  throw new NotImplementedYet(node);
}

function mkType(t: DataTypeDef, cs: ColumnConstraint[]): SimpleT {
  if (t.kind === "array") {
    if (t.arrayOf.kind === "array") {
      throw new Error("Array or array not supported");
    } else {
      return BuiltinTypeConstructors.Array({
        kind: "scalar",
        name: { ...t.arrayOf, name: normalizeTypeName(t.arrayOf.name) },
      });
    }
  } else {
    const t_: ScalarT = {
      kind: "scalar",
      name: { ...t, name: normalizeTypeName(t.name) },
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
  const fields = s.columns.reduce(function (acc: Field[], c) {
    if (c.kind === "like table") {
      const targetTable = c.like;
      const found = g.tables.find((t) => eqQNames(t.name, targetTable));
      if (!found) {
        throw new UnknownIdentifier(c.like, targetTable);
      }
      return acc.concat(found.rel.fields);
    } else {
      return acc.concat({
        name: c.name,
        type: mkType(c.dataType, c.constraints || []),
        expr: {
          type: "null",
          _location: c._location,
        },
      });
    }
  }, []);

  const primaryKey = (function () {
    const primaryKeyConstraint = mapPartial(s.constraints || [], (c) =>
      c.type === "primary key" ? c : null
    );
    if (primaryKeyConstraint.length > 0) {
      return primaryKeyConstraint[0].columns;
    }
    const columnWithPrimaryKey = mapPartial(s.columns, (c) =>
      c.kind === "column" &&
      (c.constraints || []).some(
        (constr: ColumnConstraint) => constr.type === "primary key"
      )
        ? c
        : null
    );
    if (columnWithPrimaryKey.length > 0) {
      return columnWithPrimaryKey.map((c) => c.name);
    } else {
      return [];
    }
  })();

  const defaults = mapPartial(s.columns, (col) => {
    if (col.kind !== "column") {
      return null;
    }
    const t = mkType(col.dataType, col.constraints || []);
    if (t.kind === "scalar" && t.name.name.toLowerCase() === "serial") {
      return col;
    }
    if ((col.constraints || []).some((constr) => constr.type === "default")) {
      return col;
    } else {
      return null;
    }
  });

  return {
    ...g,
    tables: g.tables.concat({
      name: s.name,
      primaryKey,
      defaults: defaults.map((c) => c.name),
      rel: {
        kind: "record",
        fields,
      },
    }),
  };
}
function doCreateView(
  _g: Global,
  s: CreateViewStatement | CreateMaterializedViewStatement
): Global {
  return _g;
  // return notImplementedYet(s);
}
function doAlterTable(_g: Global, s: AlterTableStatement): Global {
  return notImplementedYet(s);
}

function deriveNameFromExpr(expr: Expr): Name | null {
  if (expr.type === "ref") {
    return { name: expr.name };
  } else if (expr.type === "call") {
    return expr.function;
  } else if (expr.type === "parameter") {
    return null;
  } else {
    // return notImplementedYet(expr);
    return null;
  }
}

// WITH ... INSERT is also a SelectStatement. So this will return RecordT or VoidT I think...
export function elabSelect(
  g: Global,
  c: Context,
  s: SelectStatement
): RecordT | VoidT {
  if (s.type === "select") {
    const newC = ((): Context => {
      const newC_: Context = addFromsToScope(g, c, s, s.from || []);

      const inferredNullability = s.where
        ? inferNullability(newC_, s.where)
        : [];

      return {
        ...newC_,
        froms: newC_.froms.map((fr) => ({
          name: fr.name,
          type: {
            kind: "record",
            fields: fr.type.fields.map((fi) => {
              const foundNullabilityInference = inferredNullability.find(
                (inf) =>
                  eqQNames(inf.fromName, fr.name) &&
                  inf.fieldName === fi.name?.name
              );
              if (foundNullabilityInference && isNullable(fi.type)) {
                const t =
                  foundNullabilityInference.isNull === true
                    ? BuiltinTypes.Null
                    : unnullify(fi.type);
                return { name: fi.name, type: t, expr: fi.expr };
              } else {
                return fi;
              }
            }),
          },
        })),
      };
    })();

    if (s.where) {
      const t = elabExpr(g, newC, s.where);
      requireBoolean(s.where, t);
    }

    const names: string[] = [];
    const fields = (s.columns || []).flatMap((c: SelectedColumn): Field[] => {
      const n = c.alias ? c.alias : deriveNameFromExpr(c.expr);
      // if (n === null) {
      //   throw new UnableToDeriveFieldName(c.expr);
      // }
      if (!isNil(n)) {
        if (names.includes(n.name)) {
          throw new DuplicateFieldNames(c.expr, n.name);
        }
        names.push(n.name);
      }

      const t = elabExpr(g, newC, c.expr);

      if (t.kind === "record") {
        if (t.fields.length === 0) {
          throw new KindMismatch(c.expr, t, "Record with no fields");
        } else if (t.fields.length === 1) {
          if (c.expr.type === "ref" && c.expr.name === "*") {
            return t.fields;
          } else {
            return [{ name: n, type: t.fields[0].type, expr: c.expr }];
          }
        } else {
          // AFAIK, * is the only way to introduce multiple fields with one expression
          if (c.expr.type === "ref" && c.expr.name === "*") {
            return t.fields;
          } else {
            throw new KindMismatch(
              c.expr,
              t,
              "Record with more than one field"
            );
          }
        }
      }

      return [{ name: n, type: t, expr: c.expr }];
    });

    return {
      kind: "record",
      fields,
    };
  } else if (s.type === "union" || s.type === "union all") {
    const typeL = elabSelect(g, c, s.left);
    const typeR = elabSelect(g, c, s.right);
    if (typeL.kind === "void") {
      throw new KindMismatch(
        s.left,
        typeL,
        "Can't union a statement that returns nothing"
      );
    }
    if (typeR.kind === "void") {
      throw new KindMismatch(
        s.right,
        typeR,
        "Can't union a statement that returns nothing"
      );
    }
    return unifyRecords(s, typeL, typeR);
  } else if (s.type === "values") {
    const typesPerRow: RecordT[] = s.values.map((exprs) => {
      const fields = exprs.map((exp) => {
        const t_ = elabExpr(g, c, exp);
        const t = toSimpleT(t_);
        if (t === null) {
          throw new CantReduceToSimpleT(exp, t_);
        } else {
          return { name: null, type: t, expr: exp };
        }
      });
      return {
        kind: "record",
        fields: fields,
      };
    });
    return typesPerRow.reduce(
      (acc: RecordT, t: RecordT) => unifyRecords(s, acc, t),
      typesPerRow[0]
    );
  } else if (s.type === "with") {
    const resultingContext = s.bind.reduce((c, bind) => {
      const t = elabStatement(g, c, bind.statement);
      return {
        ...c,
        decls: c.decls.concat({
          name: bind.alias,
          type: t || { kind: "void" },
        }),
      };
    }, c);
    const res = elabStatement(g, resultingContext, s.in);
    if (res.kind !== "void" && res.kind !== "record") {
      return {
        kind: "record",
        fields: [
          {
            name: null,
            type: res,
            expr: s,
          },
        ],
      };
    } else {
      return res;
    }
  } else if (s.type === "with recursive") {
    return notImplementedYet(s);
  } else {
    return checkAllCasesHandled(s.type);
  }
}

function elabInsert(
  g: Global,
  c: Context,
  s: InsertStatement
): VoidT | RecordT {
  const insertingInto: null | {
    readonly name: QName;
    readonly rel: RecordT;
  } = g.tables.find((t) => eqQNames(t.name, s.into)) || null;
  if (!insertingInto) {
    throw new UnknownIdentifier(s, s.into);
  }

  const nameToAddInContext = s.into.alias || s.into.name;
  const newContext = {
    ...c,
    froms: c.froms.concat({
      name: { name: nameToAddInContext },
      type: insertingInto.rel,
    }),
  };

  const columns: Field[] = s.columns
    ? s.columns.map((c) => {
        const foundField = insertingInto.rel.fields.find((f) => {
          if (!f.name) {
            throw new Error("Assertion error: Table field without name");
          }
          return eqQNames(c, f.name);
        });
        if (!foundField) {
          throw new UnknownIdentifier(s, c);
        }
        return foundField;
      })
    : insertingInto.rel.fields;

  const insertT = elabSelect(g, newContext, s.insert);

  if (insertT.kind === "void") {
    throw new ColumnsMismatch(s.insert, {
      expected: columns.length,
      actual: 0,
    });
  }

  if (insertT.fields.length !== columns.length) {
    throw new ColumnsMismatch(s.insert, {
      expected: columns.length,
      actual: insertT.fields.length,
    });
  }

  insertT.fields.forEach((insertField, i) => {
    const col = columns[i];

    cast(
      insertField.expr || s.insert,
      insertField.type,
      col.type,
      "assignment"
    );
  });

  if (s.returning) {
    return {
      kind: "record",
      fields: s.returning.map((selectedCol) => {
        const t_ = elabExpr(g, newContext, selectedCol.expr);
        const t = toSimpleT(t_);
        if (!t) {
          throw new KindMismatch(
            selectedCol.expr,
            t_,
            "Need simple type here, not a record"
          );
        } else {
          return {
            name: selectedCol.alias || deriveNameFromExpr(selectedCol.expr),
            type: t,
            expr: selectedCol.expr,
          };
        }
      }),
    };
  } else {
    return { kind: "void" };
  }

  // TODO: typecheck s.onConflict
}

function elabDeleteOrUpdate(
  g: Global,
  c: Context,
  s: DeleteStatement | UpdateStatement
): VoidT | RecordT {
  const tableName = s.type === "delete" ? s.from : s.table;
  const tableDef: null | {
    readonly name: QName;
    readonly rel: RecordT;
  } = g.tables.find((t) => eqQNames(t.name, tableName)) || null;

  if (!tableDef) {
    throw new UnknownIdentifier(s, tableName);
  }
  const nameToAddInContext = tableName.alias || tableName.name;
  const newContext = {
    ...c,
    froms: c.froms.concat({
      name: { name: nameToAddInContext },
      type: tableDef.rel,
    }),
  };

  if (s.where) {
    const whereT = elabExpr(g, newContext, s.where);
    cast(s.where, whereT, BuiltinTypes.Boolean, "implicit");
  }

  if (s.returning) {
    return {
      kind: "record",
      fields: s.returning.map((selectedCol) => {
        const t_ = elabExpr(g, newContext, selectedCol.expr);
        const t = toSimpleT(t_);
        if (!t) {
          throw new KindMismatch(
            selectedCol.expr,
            t_,
            "Need simple type here, not a record"
          );
        } else {
          return {
            name: selectedCol.alias || deriveNameFromExpr(selectedCol.expr),
            type: t,
            expr: selectedCol.expr,
          };
        }
      }),
    };
  } else {
    return { kind: "void" };
  }
}

function toSimpleT(t: Type): SimpleT | null {
  if (t.kind === "record") {
    if (t.fields.length === 1) {
      return t.fields[0].type;
    } else {
      return null;
    }
  } else {
    return t;
  }
}

export type functionType = {
  name: QName;
  inputs: { name: Name; type: SimpleT }[];
  returns: Type | VoidT;
  multipleRows: boolean;
  code: string;
  language: string;
};

export function doCreateFunction(
  g: Global,
  c: Context,
  s: CreateFunctionStatement
): functionType {
  const name = s.name;
  console.log(`Typechecking function: ${name.name}`);
  if (!s.language) {
    throw new Error(
      "Please provide language for function at " + showLocation(s._location)
    );
  }
  if (s.code === undefined) {
    throw new ErrorWithLocation(
      s._location,
      "Function definition without body"
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
          // !!!!!!!!!!!!
          // Default rule of THIS typechecker:  params are NOT NULL
          // , unless defined as eg: (myname int default null)
          // !!!!!!!!!!!!
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

    // TODO adjust locations based on location of "s.code"
    const body = parse(s.code, { locationTracking: true });

    if (body.length === 0) {
      // empty function body
      return {
        name,
        inputs,
        returns: { kind: "void" },
        multipleRows: false,
        code: s.code,
        language: s.language.name,
      };
    } else {
      // TODO check rest of body for type errors
      const lastStatement = body[body.length - 1];
      const returnType = elabStatement(g, contextForBody, lastStatement);

      const unifiedReturnType = (function (): Type | VoidT {
        const location =
          s.returns?.type._location || s.name._location || s._location;
        const dummyExpr = {
          // TODO!
          _location: location,
          type: "null" as const,
        };

        if (returnType.kind === "void") {
          if (
            !s.returns ||
            (s.returns.type.kind === undefined &&
              s.returns.type.name === "void")
          ) {
            return { kind: "void" };
          } else if (s.returns.type.kind === "table") {
            throw new Error("RETURNS TABLE is not supported yet");
          } else {
            const annotatedType = mkType(s.returns.type, []);
            throw new KindMismatch(
              dummyExpr,
              annotatedType,
              "Function returns void"
            );
          }
        }
        if (!s.returns) {
          throw new KindMismatch(
            dummyExpr,
            { kind: "void" },
            "Function needs return type"
          );
        } else if (s.returns.type.kind === "table") {
          throw new Error("RETURNS TABLE is not supported yet");
        } else if (
          s.returns.type.kind === undefined &&
          s.returns.type.name === "record"
        ) {
          if (returnType.kind === "record") {
            return returnType;
          } else {
            throw new KindMismatch(
              dummyExpr,
              returnType,
              "Function returns record type but type annotation disagrees"
            );
          }
        } else {
          const annotatedType = mkType(s.returns.type, [
            { type: "not null" } /* not sure about this one */,
          ]);
          try {
            return unify(dummyExpr, returnType, annotatedType);
          } catch (err) {
            const mess = err instanceof Error ? err.message : "";
            if (err instanceof TypeMismatch) {
              throw new TypeMismatch(
                dummyExpr,
                { expected: err.expected, actual: err.actual },
                "Function return type mismatch"
              );
            } else {
              throw new ErrorWithLocation(
                location,
                "Function return type mismatch: \n" + mess
              );
            }
          }
        }
      })();

      return {
        name,
        inputs,
        returns: unifiedReturnType,
        multipleRows: (s.returns && s.returns.setof) || false,
        code: s.code,
        language: s.language.name,
      };
    }
  } else {
    return notImplementedYet(s);
  }
}

type HandledFrom = { name: QName; rel: RecordT };
type Nullable<T> = T | null;

function findRel(g: Global, c: Context, e: Expr, n: QName): Nullable<RecordT> {
  const d = c.decls.find((d) => eqQNames(d.name, n));
  if (d) {
    if (d.type.kind === "record") {
      return d.type;
    } else {
      throw new KindMismatch(e, d.type, "Expecting a record or table");
    }
  } else {
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
}

function showLocation(loc: NodeLocation | undefined): string {
  if (!loc) {
    return "??";
  } else {
    return loc.start + " - " + loc.end;
  }
}

export class ErrorWithLocation extends Error {
  public l: NodeLocation | undefined;
  constructor(l: NodeLocation | undefined, m: string) {
    super(m);
    this.l = l;
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
  constructor(e: Expr, _s: RecordT, n: Name) {
    super(e._location, `UnknownField ${n.name}`);
  }
}
export class UnknownIdentifier extends ErrorWithLocation {
  constructor(e: PGNode, m: QName) {
    super(e._location, `UnknownIdentifier ${showQName(m)}`);
  }
}
export class CantReduceToSimpleT extends ErrorWithLocation {
  constructor(e: PGNode, m: Type) {
    super(e._location, `Can't reduce to simple type: ${showType(m)}`);
  }
}

export function showType(t: Type): string {
  if (t.kind === "record") {
    return (
      "{" +
      t.fields
        .map(
          (f) =>
            (f.name === null ? `"?": ` : `"${f.name.name}": `) +
            showType(f.type)
        )
        .join(", ") +
      "}"
    );
  } else {
    if (t.kind === "array") {
      return "(" + showType(t.typevar) + ")" + "[]";
    } else if (t.kind === "nullable") {
      return showType(t.typevar) + " | null";
    } else if (t.kind === "scalar") {
      return t.name.name;
    } else if (t.kind === "jsonknown") {
      return (
        "{\n" +
        t.record.fields
          .map((f) => `  ${f.name?.name}: ${showType(f.type)}`)
          .join(",\n") +
        "\n}"
      );
    } else if (t.kind === "anyscalar") {
      return "anyscalar";
    } else {
      return checkAllCasesHandled(t);
    }
  }
}
export function showSqlType(t: Type): string {
  if (t.kind === "record") {
    return (
      "{" +
      t.fields
        .map(
          (f) =>
            (f.name === null ? `"?" ` : `"${f.name.name}" `) + showType(f.type)
        )
        .join(", ") +
      "}"
    );
  } else {
    if (t.kind === "array") {
      return "(" + showSqlType(t.typevar) + ")" + "[]";
    } else if (t.kind === "nullable") {
      return showSqlType(t.typevar) + " DEFAULT NULL";
    } else if (t.kind === "scalar") {
      return t.name.name;
    } else if (t.kind === "jsonknown") {
      return "json";
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
      `Can't apply unary operator "${showQName(n)}" to ${showType(t1)}`
    );
  }
}
export class UnknownBinaryOp extends ErrorWithLocation {
  constructor(e: Expr, n: QName, t1: Type, t2: Type) {
    super(
      e._location,
      `Can't apply operator "${showQName(n)}" to ${showType(t1)} and ${showType(
        t2
      )}`
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
    const argsString = argTs.map((t) => showType(t)).join(", ");
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
  constructor(e: Expr, m: QName, records: QName[]) {
    super(
      e._location,
      `AmbiguousIdentifier ${showQName(m)} @ ${showLocation(
        m._location
      )} present in ${JSON.stringify(records)}`
    );
  }
}
class ColumnsMismatch extends ErrorWithLocation {
  constructor(e: Expr, opts: { expected: number; actual: number }) {
    super(
      e._location,
      `ColumnsMismatch: Expecting ${opts.expected} columns, got ${opts.actual} columns`
    );
  }
}
class KindMismatch extends ErrorWithLocation {
  constructor(e: Expr, type: Type | VoidT, errormsg: string) {
    super(
      e._location,
      `
KindMismatch:
${toSql.expr(e)}

${errormsg}}

Type: 
${JSON.stringify(type)}
`
    );
  }
}
class UnableToDeriveFieldName extends ErrorWithLocation {
  constructor(e: Expr) {
    super(
      e._location,
      `Unable to derive field name for expression ${e}, please provide an alias with <expr> AS <name>`
    );
  }
}
class DuplicateFieldNames extends ErrorWithLocation {
  constructor(e: Expr, name: string) {
    super(
      e._location,
      `Duplicate column names: expression:

${toSql.expr(e)}

has field name

"${name}"

but this name already exists in the statement. Alias this column with

<expr> AS <name>`
    );
  }
}

export class TypeMismatch extends ErrorWithLocation {
  public expected: Type;
  public actual: Type;
  public mess?: string;
  constructor(
    e: Expr,
    ts: {
      expected: Type;
      actual: Type;
    },
    mess?: string
  ) {
    super(
      e._location,
      `
TypeMismatch:
${toSql.expr(e)}

${mess ? mess : ""}

Expected:
${JSON.stringify(ts.expected)}

Actual:
${JSON.stringify(ts.actual)}}
`
    );

    this.expected = ts.expected;
    this.actual = ts.actual;
    this.mess = mess;
  }
}

export class CannotCast extends ErrorWithLocation {
  public from: Type;
  public to: Type;
  constructor(
    e: Expr,
    ts: {
      from: Type;
      to: Type;
    }
  ) {
    super(
      e._location,
      `
Cannot cast:
${JSON.stringify(ts.from)}

to
${JSON.stringify(ts.to)}}

in expr:
${toSql.expr(e)}
`
    );

    this.from = ts.from;
    this.to = ts.to;
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
  e: Expr,
  handledFroms: HandledFrom[],
  f: From
): HandledFrom[] {
  function getHandledFrom(f: From): HandledFrom {
    if (f.type === "statement") {
      const t = elabSelect(g, c, f.statement);
      if (t.kind === "void") {
        throw new KindMismatch(
          f.statement,
          t,
          "Can't bind a statement that returns void in a FROM statement"
        );
      }
      return {
        name: {
          name: f.alias,
          _location: f._location,
        },
        rel: t,
      };
    } else if (f.type === "call") {
      return notImplementedYet(f);
    } else if (f.type === "table") {
      if ((f.name.columnNames || []).length > 0) {
        notImplementedYet(f);
      }
      const foundRel = findRel(g, c, e, f.name);
      if (!foundRel) {
        throw new UnknownIdentifier(f, f.name);
      }
      return {
        name: {
          name: f.name.alias || f.name.name,
          _location: f.name._location,
        },
        rel: foundRel,
      };
    } else {
      return checkAllCasesHandled(f);
    }
  }

  const newHandledFrom_ = getHandledFrom(f);

  const newHandledFrom =
    f.join && (f.join.type === "FULL JOIN" || f.join.type === "LEFT JOIN")
      ? { ...newHandledFrom_, rel: nullifyRecord(newHandledFrom_.rel) }
      : newHandledFrom_;

  const newHandledFroms_ =
    f.join && (f.join.type === "FULL JOIN" || f.join.type === "RIGHT JOIN")
      ? handledFroms.map((fr) => ({ ...fr, rel: nullifyRecord(fr.rel) }))
      : handledFroms;

  const newHandledFroms = newHandledFroms_.concat(newHandledFrom);

  if (f.join?.on) {
    const t = elabExpr(g, mergeHandledFroms(c, newHandledFroms), f.join.on);
    requireBoolean(f.join.on, t);
  }

  return newHandledFroms;
}
function addFromsToScope(
  g: Global,
  c: Context,
  e: Expr,
  froms: From[]
): Context {
  const inFroms: HandledFrom[] = froms.reduce(function (
    acc: HandledFrom[],
    f: From
  ) {
    return doSingleFrom(g, c, e, acc, f);
  },
  []);
  return mergeHandledFroms(c, inFroms);
}

function lookupInRecord(s: RecordT, name: Name): SimpleT | null {
  const found = s.fields.find((f) => f.name && f.name.name === name.name);
  if (found) {
    return found.type;
  } else {
    return null;
  }
}

function elabRef(c: Context, e: ExprRef): Type {
  if (e.name === "*") {
    const tab = e.table;
    if (tab !== undefined) {
      const found = c.froms.find((f) => eqQNames(f.name, tab));
      if (!found) {
        throw new UnknownIdentifier(e, tab);
      } else {
        return found.type;
      }
    } else {
      return {
        kind: "record",
        fields: c.froms.reduce(
          (acc: Field[], from) => acc.concat(from.type.fields),
          []
        ),
      };
    }
  } else {
    const found = lookupRef(c, e);
    if (found instanceof Error) {
      throw found;
    } else {
      return found.type;
    }
  }
}

function lookupRef(
  c: Context,
  e: ExprRef
):
  | Error
  | {
      from: null | {
        fromName: QName;
        fieldName: string;
      };
      type: SimpleT;
    } {
  assert(e.name !== "*");
  const tableName = e.table;
  if (tableName) {
    const table = c.froms.find((d) => eqQNames(d.name, tableName));
    if (!table) {
      return new UnknownIdentifier(e, tableName);
    }
    if (!(table.type.kind === "record")) {
      return new KindMismatch(e, table.type, "Expecting Record");
    }
    const field = lookupInRecord(table.type, e);
    if (!field) {
      return new UnknownField(e, table.type, e);
    }
    return {
      type: field,
      from: {
        fromName: tableName,
        fieldName: e.name,
      },
    };
  } else {
    const foundFields: {
      fromName: QName;
      field: Name;
      type: SimpleT;
    }[] = mapPartial(c.froms, (t) => {
      const foundfield = lookupInRecord(t.type, e);
      return foundfield
        ? { fromName: t.name, field: e, type: foundfield }
        : null;
    });

    const foundIdentifiers = mapPartial(c.decls, (t) => {
      if (t.type.kind === "record" || t.type.kind === "void") {
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
        return new UnknownIdentifier(e, e);
      } else if (foundIdentifiers.length === 1) {
        return { type: foundIdentifiers[0].type, from: null };
      } else {
        return new AmbiguousIdentifier(e, e, []);
      }
    } else if (foundFields.length === 1) {
      return {
        type: foundFields[0].type,
        from: {
          fromName: foundFields[0].fromName,
          fieldName: foundFields[0].field.name,
        },
      };
    } else {
      return new AmbiguousIdentifier(
        e,
        e,
        foundFields.map((f) => f.fromName)
      );
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

function elabAnyCall(
  e: Expr,
  name: QName,
  nullPolicy: "CALLED ON NULL INPUT" | "STRICT", // RETURNS NULL ON NULL INPUT = STRICT
  sourceTypes: Type[],
  targetTypes: Type[]
): {
  nullifyResultType: boolean;
  score: number; // amount of coersions we had to do gets you into minus, so higher score is better
} {
  if (sourceTypes.length !== targetTypes.length) {
    throw new InvalidArguments(e, name, sourceTypes);
  }
  const { score, anySourceIsNullable } = sourceTypes.reduce(
    function (acc, sourceT, i) {
      const targetT = targetTypes[i];
      if (sourceT.kind === "nullable") {
        cast(e, sourceT.typevar, targetT, "implicit");
        const score = eqType(sourceT.typevar, targetT) ? 0 : -1;
        return {
          score: acc.score + score,
          anySourceIsNullable: true,
        };
      } else {
        cast(e, sourceT, targetT, "implicit");
        const score = eqType(sourceT, targetT) ? 0 : -1;
        return {
          score: acc.score + score,
          anySourceIsNullable: acc.anySourceIsNullable || false,
        };
      }
    },
    {
      score: 0 as number,
      anySourceIsNullable: false as boolean,
    }
  );
  return {
    score,
    nullifyResultType: nullPolicy === "STRICT" && anySourceIsNullable,
  };
}

function elabUnaryOp(g: Global, c: Context, e: ExprUnary): Type {
  const t1_ = elabExpr(g, c, e.operand);

  const t1 = toSimpleT(t1_);
  if (t1 === null) {
    throw new CantReduceToSimpleT(e, t1_);
  }

  if (e.op === "IS NULL" || e.op === "IS NOT NULL") {
    if (!isNullable(t1)) {
      registerWarning(e, "IS (NOT) NULL check but operand is not nullable");
    }
    return BuiltinTypes.Boolean;
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
        const { nullifyResultType, score } = elabAnyCall(
          e,
          op.name,
          "STRICT", // TODO?
          [t1],
          [op.operand]
        );
        return [score, op, nullifyResultType] as const;
      } catch {
        return null;
      }
    })
    .filter(isNotEmpty)
    .sort((m1, m2) => (m1[0] > m2[0] ? -1 : 1))[0];

  if (!found) {
    throw new UnknownUnaryOp(e, { name: e.op, schema: e.opSchema }, t1);
  } else {
    const op = found[1];
    return found[2] ? nullify(op.result) : op.result;
  }
}
function elabBinaryOp(g: Global, c: Context, e: ExprBinary): Type {
  const t1_ = elabExpr(g, c, e.left);
  const t2_ = elabExpr(g, c, e.right);

  const t1 = toSimpleT(t1_);
  const t2 = toSimpleT(t2_);

  if (t1 === null) {
    throw new CantReduceToSimpleT(e, t1_);
  }
  if (t2 === null) {
    throw new CantReduceToSimpleT(e, t2_);
  }

  // Specific test on = NULL, because it's always False (I think?) and is a cause of a lot of bugs
  if (e.op === "=" && (e.left.type === "null" || e.right.type === "null")) {
    throw new Error(
      `Don't use \"= NULL\", use "IS NULL" instead @ ${showLocation(
        e._location
      )}`
    );
  }

  // TODO use elabAnyCall?
  if (e.op === "IN" || e.op === "NOT IN") {
    // No generics, so special casing this operator
    castSimples(e, t2, BuiltinTypeConstructors.List(t1), "implicit");
    return BuiltinTypes.Boolean;
  }

  const found = builtinoperators
    .concat(
      g.domains.map((d) => ({
        name: { schema: "pg_catalog", name: "=" },
        left: { kind: "scalar", name: d.name },
        right: { kind: "scalar", name: d.name },
        result: { kind: "scalar", name: { name: "boolean" } },
        description: "equal",
      }))
    )
    .filter(function (op) {
      return eqQNames(
        {
          name: normalizeOperatorName(e.op),
          schema: e.opSchema,
        },
        op.name
      );
    })
    // TODO do this only once?
    .sort(function (op) {
      // prefer operators on same type
      // mostly (only?) if one of the operators is "anyscalar" (= NULL expr)
      if (eqType(op.left, op.right)) {
        return -1;
      } else {
        return 0;
      }
    })
    .map(function (op) {
      try {
        const res = elabAnyCall(
          e,
          op.name,
          "STRICT" /* TODO ? */,
          [t1, t2],
          [op.left, op.right]
        );
        return {
          ...res,
          op,
        };
      } catch {
        return null;
      }
    })
    .filter(isNotEmpty)
    .sort((m1, m2) => (m1.score > m2.score ? -1 : 1));

  if (found.length === 0) {
    throw new UnknownBinaryOp(e, { name: e.op, schema: e.opSchema }, t1, t2);
  } else {
    const best = found[0];
    return best.nullifyResultType ? nullify(best.op.result) : best.op.result;
  }
}

function elabCall(g: Global, c: Context, e: ExprCall): Type {
  const argTypes = e.args.map((arg) => elabExpr(g, c, arg));

  if (
    eqQNames(e.function, { name: "json_build_object" }) ||
    eqQNames(e.function, { name: "jsonb_build_object" })
  ) {
    // string -> any -> {[string]: any} (+-)
    if (e.args.length % 2 === 0) {
      const record: RecordT = { kind: "record", fields: [] };
      for (let i = 0; i < e.args.length; i += 2) {
        const key = e.args[i];
        if (key.type !== "string") {
          throw new TypeMismatch(
            e.args[i],
            { expected: BuiltinTypes.Text, actual: argTypes[i] },
            "Json keys can only be string literals (for now?)"
          );
        }
        const valT = argTypes[i + 1];
        const valTSimple = toSimpleT(valT);
        if (valTSimple === null) {
          throw new CantReduceToSimpleT(e.args[i], argTypes[i]);
        }
        record.fields.push({
          name: { name: key.value },
          type: valTSimple,
          expr: e.args[i],
        });
      }
      return { kind: "jsonknown", record: record };
    } else {
      throw new InvalidArguments(e, e.function, argTypes);
    }
  }

  if (eqQNames(e.function, { name: "array_agg" })) {
    // any -> any[]
    if (e.args.length === 1) {
      return { kind: "array", subtype: "array", typevar: argTypes[0] };
    } else {
      throw new InvalidArguments(e, e.function, argTypes);
    }
  }

  if (eqQNames(e.function, { name: "nextval" })) {
    return unifyCallGeneral(
      e,
      argTypes,
      [BuiltinTypes.Text],
      BuiltinTypes.Bigint
    );
  }

  if (eqQNames(e.function, { name: "now" })) {
    return unifyCallGeneral(e, argTypes, [], BuiltinTypes.Timestamp);
  }

  if (
    eqQNames(e.function, { name: "any" }) ||
    eqQNames(e.function, { name: "some" }) ||
    eqQNames(e.function, { name: "all" })
  ) {
    // any[] -> any
    if (e.args.length !== 1) {
      throw new InvalidArguments(e, e.function, argTypes);
    }
    const t_ = argTypes[0];
    const t = toSimpleT(t_);
    if (t === null) {
      throw new CantReduceToSimpleT(e.args[0], argTypes[0]);
    }
    const unifiedT = unifySimples(
      e,
      t,
      BuiltinTypeConstructors.Array(BuiltinTypes.AnyScalar)
    );
    if (unifiedT.kind !== "array") {
      throw new TypecheckerError(e, "Expecting array type");
    } else {
      return unifiedT.typevar;
    }
  }

  if (eqQNames(e.function, { name: "sum" })) {
    return unifyOverloadedCall(e, argTypes, [
      { expectedArgs: [BuiltinTypes.Integer], returnT: BuiltinTypes.Bigint },
      { expectedArgs: [BuiltinTypes.Smallint], returnT: BuiltinTypes.Bigint },
      { expectedArgs: [BuiltinTypes.Bigint], returnT: BuiltinTypes.Numeric },
      { expectedArgs: [BuiltinTypes.Numeric], returnT: BuiltinTypes.Numeric },
      { expectedArgs: [BuiltinTypes.Real], returnT: BuiltinTypes.Real },
      { expectedArgs: [BuiltinTypes.Double], returnT: BuiltinTypes.Double },
      { expectedArgs: [BuiltinTypes.Float2], returnT: BuiltinTypes.Double },
      { expectedArgs: [BuiltinTypes.Float4], returnT: BuiltinTypes.Double },
      { expectedArgs: [BuiltinTypes.Float8], returnT: BuiltinTypes.Double },
    ]);
  }

  if (eqQNames(e.function, { name: "avg" })) {
    return unifyOverloadedCall(e, argTypes, [
      { expectedArgs: [BuiltinTypes.Integer], returnT: BuiltinTypes.Numeric },
      { expectedArgs: [BuiltinTypes.Smallint], returnT: BuiltinTypes.Numeric },
      { expectedArgs: [BuiltinTypes.Bigint], returnT: BuiltinTypes.Numeric },
      { expectedArgs: [BuiltinTypes.Numeric], returnT: BuiltinTypes.Numeric },
      { expectedArgs: [BuiltinTypes.Real], returnT: BuiltinTypes.Real },
      { expectedArgs: [BuiltinTypes.Double], returnT: BuiltinTypes.Double },
      { expectedArgs: [BuiltinTypes.Float2], returnT: BuiltinTypes.Double },
      { expectedArgs: [BuiltinTypes.Float4], returnT: BuiltinTypes.Double },
      { expectedArgs: [BuiltinTypes.Float8], returnT: BuiltinTypes.Double },
    ]);
  }

  if (
    eqQNames(e.function, { name: "max" }) ||
    eqQNames(e.function, { name: "min" })
  ) {
    return unifyOverloadedCall(
      e,
      argTypes,
      allNumericBuiltinTypes.map((t) => ({ expectedArgs: [t], returnT: t }))
    );
  }

  if (eqQNames(e.function, { name: "count" })) {
    return unifyCallGeneral(
      e,
      argTypes,
      [BuiltinTypes.AnyScalar],
      BuiltinTypes.Bigint
    );
  }

  if (
    eqQNames(e.function, { name: "coalesce" }) ||
    eqQNames(e.function, { name: "nullif" })
  ) {
    // nullable<A> -> A -> A
    if (e.args.length === 0) {
      throw new InvalidArguments(e, e.function, []);
    }
    const types: [Expr, SimpleT][] = e.args
      .map((arg) => [arg, elabExpr(g, c, arg)] as const)
      .map(([arg, t_]) => {
        const t = toSimpleT(t_);
        if (t === null) {
          throw new CantReduceToSimpleT(arg, t_);
        } else {
          return [arg, t];
        }
      });
    const unifiedType = types.reduce(
      (acc, [arg, t]) => unifySimples(arg, acc, t),
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
    if (e.value.trim() === "{}") {
      return BuiltinTypeConstructors.Array(BuiltinTypes.AnyScalar);
    } else {
      return BuiltinTypes.Text;
    }
  } else if (e.type === "unary") {
    return elabUnaryOp(g, c, e);
  } else if (e.type === "binary") {
    return elabBinaryOp(g, c, e);
  } else if (e.type === "null") {
    return BuiltinTypeConstructors.Nullable(BuiltinTypes.AnyScalar);
  } else if (e.type === "numeric") {
    return BuiltinTypes.Numeric;
  } else if (e.type === "list" || e.type === "array") {
    const typevar = e.expressions.reduce((acc: SimpleT, subexpr: Expr) => {
      const t_ = elabExpr(g, c, subexpr);
      const t = toSimpleT(t_);
      if (t === null) {
        throw new CantReduceToSimpleT(e, t_);
      } else {
        return unifySimples(e, t, acc);
      }
    }, BuiltinTypes.AnyScalar);
    return e.type === "list"
      ? BuiltinTypeConstructors.List(typevar)
      : BuiltinTypeConstructors.Array(typevar);
  } else if (e.type === "call") {
    return elabCall(g, c, e);
  } else if (e.type === "array select") {
    const selectType = elabSelect(g, c, e.select);
    if (selectType.kind === "void") {
      throw new KindMismatch(
        e.select,
        selectType,
        "Select in array select can't return void"
      );
    }
    const t = unifyRecordWithSimple(e, selectType, BuiltinTypes.AnyScalar);
    return BuiltinTypeConstructors.Array(t);
  } else if (e.type === "default") {
    // ??
    return BuiltinTypes.AnyScalar;
  } else if (e.type === "extract") {
    function timeIsValid(s: string) {
      return [
        "hour",
        "minute",
        "second",
        "microseconds",
        "milliseconds",
      ].includes(s.toLowerCase());
    }
    function intervalIsValid(s: string) {
      return (
        timeIsValid(s) ||
        ["century", "epoch", "decade", "year", "month", "day"].includes(
          s.toLowerCase()
        )
      );
    }
    // TODO use elabAnyCall?
    const t = elabExpr(g, c, e.from);
    try {
      cast(e.from, t, BuiltinTypes.Timestamp, "implicit");
    } catch (err) {
      try {
        if (intervalIsValid(e.field.name)) {
          cast(e.from, t, BuiltinTypes.Interval, "implicit");
        } else {
          throw err;
        }
      } catch (err) {
        if (timeIsValid(e.field.name)) {
          cast(e.from, t, BuiltinTypes.Time, "implicit");
        } else {
          throw err;
        }
      }
    }
    return BuiltinTypes.Numeric;
  } else if (e.type === "member") {
    const t = elabExpr(g, c, e.operand);
    try {
      cast(
        e.operand,
        t,
        BuiltinTypeConstructors.Nullable(BuiltinTypes.Json),
        "implicit"
      );
    } catch {
      cast(
        e.operand,
        t,
        BuiltinTypeConstructors.Nullable(BuiltinTypes.Jsonb),
        "implicit"
      );
    }
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
    const unifiedArrayT_ = unify(
      e.array,
      arrayT,
      BuiltinTypeConstructors.Array(BuiltinTypes.AnyScalar)
    );
    cast(e.array, indexT, BuiltinTypes.Integer, "implicit");
    const unifiedArrayT = toSimpleT(unifiedArrayT_);

    if (unifiedArrayT === null) {
      throw new CantReduceToSimpleT(e.array, unifiedArrayT_);
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
        (acc, [exp, conditionT]) => unify(exp, acc, conditionT),
        valueT
      );
    } else {
      const conditionTs: [Expr, Type][] = e.whens.map((whenExp) => [
        whenExp.when,
        elabExpr(g, c, whenExp.when),
      ]);
      conditionTs.forEach(([exp, conditionT]) =>
        requireBoolean(exp, conditionT)
      );
    }
    if (e.whens.length === 0) {
      throw new Error("Not expecting CASE statement without when");
    }
    const whensT = e.whens.reduce(
      (acc: Type, whenExp) =>
        unify(whenExp.value, acc, elabExpr(g, c, whenExp.value)),
      elabExpr(g, c, e.whens[0].value)
    );
    return e.else ? unify(e.else, whensT, elabExpr(g, c, e.else)) : whensT;
  } else if (
    e.type === "select" ||
    e.type === "union" ||
    e.type === "union all" ||
    e.type === "values" ||
    e.type === "with" ||
    e.type === "with recursive"
  ) {
    const t = elabSelect(g, c, e);
    if (t.kind === "void") {
      throw new KindMismatch(
        e,
        t,
        "Select as an expression needs to return something"
      );
    }
    return t;
  } else if (e.type === "ternary") {
    const valueT = elabExpr(g, c, e.value);
    const hiT = elabExpr(g, c, e.hi);
    const loT = elabExpr(g, c, e.lo);
    cast(e, valueT, loT, "implicit");
    cast(e, valueT, hiT, "implicit");
    return BuiltinTypes.Boolean;
  } else if (e.type === "substring" || e.type === "overlay") {
    const valueT = elabExpr(g, c, e.value);
    const fromT = e.from ? elabExpr(g, c, e.from) : BuiltinTypes.Integer;
    const forT = e.for ? elabExpr(g, c, e.for) : BuiltinTypes.Integer;
    const res = elabAnyCall(
      e,
      { name: e.type },
      "STRICT",
      [valueT, fromT, forT],
      [BuiltinTypes.Text, BuiltinTypes.Integer, BuiltinTypes.Integer]
    );
    return res.nullifyResultType
      ? nullify(BuiltinTypes.Text)
      : BuiltinTypes.Text;
  } else if (e.type === "constant") {
    throw new Error("Haven't been able to simulate this yet");
  } else if (e.type === "cast") {
    const operandT = elabExpr(g, c, e.operand);
    const toT = mkType(e.to, []);
    try {
      cast(e, operandT, toT, "explicit");
    } catch (err) {
      throw new CannotCast(e, { from: operandT, to: toT });
    }
    if (isNullable(operandT)) {
      return toT;
    } else {
      return unnullify(toT);
    }
  } else {
    return checkAllCasesHandled(e.type);
  }
}

function inferNullability(
  c: Context,
  e: Expr
): { fromName: QName; fieldName: string; isNull: boolean }[] {
  if (e.type === "unary") {
    if (e.op === "NOT") {
      return inferNullability(c, e).map((judg) => ({
        ...judg,
        isNull: !judg.isNull,
      }));
    }
    if (e.op === "IS NULL" || e.op === "IS NOT NULL") {
      if (e.operand.type === "ref") {
        const found = lookupRef(c, e.operand);
        if (found instanceof Error) {
          return [];
        } else {
          if (found.from === null) {
            return [];
          } else {
            return [
              { ...found.from, isNull: e.op === "IS NULL" ? true : false },
            ];
          }
        }
      }
    }
    return [];
  } else if (e.type === "binary" && e.op === "AND") {
    return inferNullability(c, e.left).concat(inferNullability(c, e.right));
  } else {
    return [];
  }
}

function elabStatement(g: Global, c: Context, s: Statement): VoidT | Type {
  if (
    s.type === "select" ||
    s.type === "union" ||
    s.type === "union all" ||
    s.type === "with" ||
    s.type === "with recursive" ||
    s.type === "values"
  ) {
    return elabExpr(g, c, s);
  } else if (s.type === "insert") {
    return elabInsert(g, c, s);
  } else if (s.type === "delete" || s.type === "update") {
    return elabDeleteOrUpdate(g, c, s);
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
      } else if (a.type === "create domain") {
        return {
          ...acc,
          domains: acc.domains.concat({
            name: a.name,
            type: mkType(a.dataType, [{ type: "not null" }]),
          }),
        };
      } else {
        return acc;
      }
    },
    { tables: [], views: [], domains: [] }
  );
}

function nullifyRecord(s: RecordT): RecordT {
  return {
    kind: "record",
    fields: s.fields.map((c) => ({
      ...c,
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

export function checkAllCasesHandled(_: never): any {
  throw new Error("Oops didn't expect that");
}

export function showQName(n: QName): string {
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
