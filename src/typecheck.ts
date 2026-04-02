import assert from "assert";
import { isNil, orderBy } from "lodash-es";
import {
  type Node,
  type RawStmt,
  type SelectStmt,
  type InsertStmt,
  type UpdateStmt,
  type DeleteStmt,
  type CreateStmt,
  type ViewStmt,
  type AlterTableStmt,
  type CreateDomainStmt,
  type CreateEnumStmt,
  type CreateTableAsStmt,
  type CreateFunctionStmt,
  type ResTarget,
  type RangeVar,
  type FuncCall,
  type A_Expr,
  type ColumnRef,
  type TypeName,
  type TypeCast,
  type CaseExpr,
  type BoolExpr,
  type NullTest,
  type SubLink,
  type A_ArrayExpr,
  type A_Indirection,
  type SQLValueFunction,
  type JoinExpr,
  type RangeSubselect,
  type RangeFunction,
  type ColumnDef,
  type Constraint,
  type FunctionParameter,
  type Name,
  type QName,
  parseStatements,
  getColumnRef,
  getTypeName,
  getQNameFromNodes,
  getOperatorName,
  getOperatorSchema,
  rangeVarToQName,
  rangeVarAlias,
  extractFunctionOptions,
  nodeToSql,
  nodeLocation,
  A_Expr_Kind,
  BoolExprType,
  SetOperation,
  JoinType,
  SubLinkType,
  NullTestType,
  SQLValueFunctionOp,
  ConstrType,
  AlterTableType,
  FunctionParameterMode,
  enumEq,
} from "./pg-ast.ts";
import { builtincasts } from "./builtincasts.ts";
import { builtinoperators } from "./builtinoperators.ts";
import { builtinUnaryOperators } from "./builtinunaryoperators.ts";
import { normalizeOperatorName, normalizeTypeName } from "./normalize.ts";

export type Type = SimpleT | RecordT;
export type AnyScalarT = {
  kind: "anyscalar";
};
export type NullableT<T extends SimpleT> = {
  kind: "nullable";
  typevar: T;
};
export type ArrayT<T extends SimpleT> = {
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
  domain?: {
    realtype: SimpleT;
  };
  isEnum?: { values: string[] };
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

export type Field = {
  name: Name | null;
  type: SimpleT;
  _expr?: Node;
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
  Bytea: {
    kind: "scalar",
    name: { name: "bytea" },
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
    name: { name: "double precision" },
  },
  Text: {
    kind: "scalar",
    name: { name: "text" },
  },
  Tsvector: {
    kind: "scalar",
    name: { name: "tsvector" },
  },
  Tsquery: {
    kind: "scalar",
    name: { name: "tsquery" },
  },
  Date: {
    kind: "scalar",
    name: { name: "date" },
  },
  Money: {
    kind: "scalar",
    name: { name: "money" },
  },
  Time: {
    kind: "scalar",
    name: { name: "time" },
  },
  Timestamp: {
    kind: "scalar",
    name: { name: "timestamp without time zone" },
  },
  TimestampRange: {
    kind: "scalar",
    name: { name: "tsrange" },
  },
  TimestampMultiRange: {
    kind: "scalar",
    name: { name: "tsmultirange" },
  },
  TimestampTz: {
    kind: "scalar",
    name: { name: "timestamp with time zone" },
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

export const AnyScalar: AnyScalarT = {
  kind: "anyscalar",
};

const builtinTypeNames = new Set(
  Object.values(BuiltinTypes).map((v) => v.name.name.toLowerCase())
);

type Cast = { source: ScalarT; target: ScalarT; type: CastType };
type CastIndex = Map<string, Cast[]>;
const castIndexCache = new WeakMap<Global, CastIndex>();

function getCastIndex(g: Global): CastIndex {
  const cached = castIndexCache.get(g);
  if (cached) return cached;

  const allCasts: Cast[] = builtincasts.concat(
    g.domains.map((d) => ({
      source: d.realtype.kind === "scalar" ? d.realtype : BuiltinTypes.Null,
      target: { kind: "scalar" as const, name: d.name },
      type: "assignment" as const,
    }))
  );
  const index: CastIndex = new Map();
  for (const c of allCasts) {
    const key = c.source.name.name.toLowerCase();
    const existing = index.get(key);
    if (existing) existing.push(c);
    else index.set(key, [c]);
  }
  castIndexCache.set(g, index);
  return index;
}

type OperatorIndex = Map<string, binaryOp[]>;
const operatorIndexCache = new WeakMap<Global, OperatorIndex>();

function getOperatorIndex(g: Global): OperatorIndex {
  const cached = operatorIndexCache.get(g);
  if (cached) return cached;

  const allOps: binaryOp[] = builtinoperators
    .concat(
      g.domains.flatMap((d) => {
        const numericType = allNumericBuiltinTypes.find((t) =>
          eqType(t, d.realtype)
        );
        if (!isNil(numericType)) {
          return makeBuiltinBinaryOperatorsForNumericDomain({
            kind: "scalar" as const,
            name: d.name,
          });
        } else {
          return [];
        }
      })
    )
    .concat(
      g.domains.map((d) => ({
        name: { schema: "pg_catalog", name: "=" },
        left: { kind: "scalar" as const, name: d.name },
        right: { kind: "scalar" as const, name: d.name },
        result: { kind: "scalar" as const, name: { name: "boolean" } },
        description: "equal",
      }))
    )
    .concat(
      g.domains.map((d) => ({
        name: { schema: "pg_catalog", name: "<>" },
        left: { kind: "scalar" as const, name: d.name },
        right: { kind: "scalar" as const, name: d.name },
        result: { kind: "scalar" as const, name: { name: "boolean" } },
        description: "equal",
      }))
    )
    .concat(
      g.enums.map((d) => ({
        name: { schema: "pg_catalog", name: "=" },
        left: { kind: "scalar" as const, name: d.name },
        right: { kind: "scalar" as const, name: d.name },
        result: { kind: "scalar" as const, name: { name: "boolean" } },
        description: "equal",
      }))
    )
    .concat(
      g.enums.map((d) => ({
        name: { schema: "pg_catalog", name: "<>" },
        left: { kind: "scalar" as const, name: d.name },
        right: { kind: "scalar" as const, name: d.name },
        result: { kind: "scalar" as const, name: { name: "boolean" } },
        description: "equal",
      }))
    );

  const index: OperatorIndex = new Map();
  for (const op of allOps) {
    const key = op.name.name.toLowerCase();
    const existing = index.get(key);
    if (existing) existing.push(op);
    else index.set(key, [op]);
  }
  operatorIndexCache.set(g, index);
  return index;
}

const allNumericBuiltinTypes: ScalarT[] = [
  BuiltinTypes.Smallint,
  BuiltinTypes.Integer,
  BuiltinTypes.Bigint,
  BuiltinTypes.Real,
  BuiltinTypes.Double,
  BuiltinTypes.Numeric,
  BuiltinTypes.Float2,
  BuiltinTypes.Float4,
  BuiltinTypes.Float8,
  BuiltinTypes.Money,
];

function requireBoolean(e: Node, t: Type): void {
  if (
    (t.kind === "scalar" && eqQNames(t.name, BuiltinTypes.Boolean.name)) ||
    (t.kind === "nullable" &&
      t.typevar.kind === "scalar" &&
      eqQNames(t.typevar.name, BuiltinTypes.Boolean.name))
  ) {
    return;
  } else {
    throw new TypeMismatch(
      e,
      {
        expected: BuiltinTypes.Boolean,
        actual: t,
      },
      "Requiring boolean"
    );
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
    readonly realtype: SimpleT;
  }>;
  readonly enums: ReadonlyArray<{
    readonly name: QName;
    readonly values: string[];
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

function unify(g: Global, e: Node, source: Type, target: Type): Type {
  if (source.kind === "record") {
    if (target.kind === "record") {
      return unifyRecords(g, e, source, target);
    } else {
      return unifyRecordWithSimple(g, e, source, target);
    }
  } else {
    if (target.kind === "record") {
      return unifyRecordWithSimple(g, e, target, source);
    } else {
      return unifySimplesOrThrow(g, e, source, target);
    }
  }
}

function castOrThrow(
  g: Global,
  e: Node,
  source: Type,
  target: Type,
  casttype: CastType
): void {
  throwIfError(cast(g, e, source, target, casttype));
}

function cast(
  g: Global,
  e: Node,
  source: Type,
  target: Type,
  casttype: CastType
): null | ErrorWithLocation {
  if (source.kind === "record") {
    if (target.kind === "record") {
      return castRecords(g, e, source, target, casttype);
    } else {
      return castRecordToSimple(g, e, source, target, casttype);
    }
  } else {
    if (target.kind === "record") {
      return castSimpleToRecord(g, e, source, target, casttype);
    } else {
      return castSimples(g, e, source, target, casttype);
    }
  }
}

function castRecords(
  g: Global,
  e: Node,
  source: RecordT,
  target: RecordT,
  casttype: CastType
): null | ErrorWithLocation {
  if (source.fields.length !== target.fields.length) {
    return new TypeMismatch(
      e,
      { expected: source, actual: target },
      "Amount of fields is not the same"
    );
  }
  let i = 0;
  for (const sf of source.fields) {
    const tf = target.fields[i];
    const res = castSimples(g, e, sf.type, tf.type, casttype);
    if (res instanceof ErrorWithLocation) {
      return res;
    }
    i++;
  }
  return null;
}

function unifyRecords(
  g: Global,
  e: Node,
  source: RecordT,
  target: RecordT
): RecordT {
  if (source.fields.length !== target.fields.length) {
    throw new TypeMismatch(
      e,
      { expected: source, actual: target },
      "Amount of fields is not the same"
    );
  }
  const newFields = source.fields.map((sf, i) => {
    const tf: Field = target.fields[i];
    const t = unifySimplesOrThrow(g, tf._expr || e, sf.type, tf.type);
    return {
      name: sf.name || tf.name,
      type: t,
      _expr: tf._expr,
    };
  });
  return {
    kind: "record",
    fields: newFields,
  };
}

function castRecordToSimple(
  g: Global,
  e: Node,
  source: RecordT,
  target: SimpleT,
  casttype: CastType
): null | ErrorWithLocation {
  // TODO add warning if no LIMIT 1
  if (source.fields.length === 0) {
    return new TypeMismatch(
      e,
      { expected: source, actual: target },
      "Record has no fields"
    );
  }
  if (source.fields.length > 1) {
    return new TypeMismatch(
      e,
      { expected: source, actual: target },
      "More than one row returned by a subquery used as an expression"
    );
  }
  return castSimples(g, e, source.fields[0].type, target, casttype);
}

function castSimpleToRecord(
  g: Global,
  e: Node,
  source: SimpleT,
  target: RecordT,
  casttype: CastType
): null | ErrorWithLocation {
  // TODO add warning if no LIMIT 1
  if (target.fields.length === 0) {
    return new TypeMismatch(
      e,
      { expected: source, actual: target },
      "Record has no fields"
    );
  }
  if (target.fields.length > 1) {
    return new TypeMismatch(
      e,
      { expected: source, actual: target },
      "More than one row returned by a subquery used as an expression"
    );
  }
  return castSimples(g, e, source, target.fields[0].type, casttype);
}

function unifyRecordWithSimple(
  g: Global,
  e: Node,
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
  return unifySimplesOrThrow(g, e, source.fields[0].type, target);
}

function castSimples(
  g: Global,
  e: Node,
  source: SimpleT,
  target: SimpleT,
  type: CastType
): null | ErrorWithLocation {
  // T -> Nullable<T> is a universal cast
  if (target.kind === "nullable" && source.kind !== "nullable") {
    return castSimples(g, e, source, target.typevar, type);
  }

  if (source.kind === "anyscalar") {
    // ok
    return null;
  } else if (source.kind === "nullable") {
    if (target.kind === "nullable") {
      return castSimples(g, e, source.typevar, target.typevar, type);
    } else {
      return new TypeMismatch(
        e,
        { expected: source, actual: target },
        "Nullability is different"
      );
    }
  } else if (source.kind === "array") {
    if (target.kind === "array" && source.subtype === target.subtype) {
      return castSimples(g, e, source.typevar, target.typevar, type);
    } else {
      return new TypeMismatch(
        e,
        { expected: source, actual: target },
        "Can't unify array with non-array"
      );
    }
  } else if (source.kind === "scalar") {
    if (target.kind === "scalar") {
      return castScalars(g, e, source, target, type);
    } else {
      // simple - parametrized
      return new TypeMismatch(
        e,
        { expected: source, actual: target },
        "Can't unify scalar with non-scalar"
      );
    }
  } else if (source.kind === "jsonknown") {
    if (target.kind === "jsonknown") {
      for (let field of source.record.fields) {
        const matchingFieldInTarget = target.record.fields.find(
          (f) => f.name === field.name
        );
        if (!matchingFieldInTarget) {
          return new TypeMismatch(
            e,
            { expected: source, actual: target },
            `Missing field ${field.name}`
          );
        } else {
          return castSimples(
            g,
            e,
            field.type,
            matchingFieldInTarget.type,
            type
          );
        }
      }
      return null;
    } else {
      // simple - parametrized
      return new TypeMismatch(
        e,
        { expected: source, actual: target },
        "Can't unify JSON with non-JSON"
      );
    }
  } else {
    return checkAllCasesHandled(source);
  }
}

// Get the "biggest" type back, if implicit casting is possible
function unifySimplesOrThrow(
  g: Global,
  e: Node,
  source: SimpleT,
  target: SimpleT
): SimpleT {
  return throwIfError(unifySimples(g, e, source, target));
}

// Get the "biggest" type back, if implicit casting is possible
function unifySimples(
  g: Global,
  e: Node,
  source: SimpleT,
  target: SimpleT
): SimpleT | ErrorWithLocation {
  const err = castSimples(g, e, source, target, "implicit");
  if (err === null) {
    return target;
  } else {
    const err2 = castSimples(g, e, target, source, "implicit");
    if (err2 === null) {
      return source;
    } else {
      return err; // Think this is the best one to return?
    }
  }
}

function unifyOverloadedCall(
  g: Global,
  call: Node,
  funcName: QName,
  args: Node[],
  argTypes: Type[],
  overloads: {
    expectedArgs: SimpleT[];
    returnT: SimpleT;
  }[]
): SimpleT {
  // This is probably bad, among others for performance, as we use error handling for control flow here
  for (let overload of orderBy(
    overloads,
    // Hack to prefer overloads with exact type
    (ol) => (eqType(ol.expectedArgs[0], argTypes[0]) ? 2 : 1),
    ["desc"]
  )) {
    const res = unifyCallGeneral(
      g,
      call,
      funcName,
      args,
      argTypes,
      overload.expectedArgs,
      overload.returnT
    );
    if (res instanceof ErrorWithLocation) {
      // do nothing, we try the next one
    } else {
      return res;
    }
  }
  throw new InvalidArguments(call, funcName, argTypes);
}

function unifyCallGeneralOrThrow(
  g: Global,
  call: Node,
  funcName: QName,
  args: Node[],
  argTypes: Type[],
  expectedArgs: SimpleT[],
  returnT: SimpleT
): SimpleT {
  return throwIfError(
    unifyCallGeneral(g, call, funcName, args, argTypes, expectedArgs, returnT)
  );
}

function unifyCallGeneral(
  g: Global,
  call: Node,
  funcName: QName,
  args: Node[],
  argTypes: Type[],
  expectedArgs: SimpleT[],
  returnT: SimpleT
): SimpleT | ErrorWithLocation {
  if (argTypes.length !== expectedArgs.length) {
    return new InvalidArguments(call, funcName, argTypes);
  }
  for (let i = 0; i < expectedArgs.length; i++) {
    const arg = argTypes[i];
    const expectedArg = expectedArgs[i];
    const simplifiedArg = toSimpleT(arg);
    if (simplifiedArg === null) {
      return new CantReduceToSimpleT(args[i], arg);
    }
    const err = unifySimples(g, call, simplifiedArg, expectedArg);
    if (err instanceof ErrorWithLocation) {
      return err;
    }
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
  g: Global,
  e: Node,
  source: ScalarT,
  target: ScalarT,
  type: CastType
): null | ErrorWithLocation {
  // list casts = \dC+

  // You can cast text to anything, but it might throw
  // We need this for literal input, like '1 day'::interval
  if (type === "explicit" && eqType(source, BuiltinTypes.Text)) {
    return null;
  }
  const matchingCast = findMatchingCast(g, [source.name], source, target, type);
  if (matchingCast === null) {
    return new TypeMismatch(
      e,
      { expected: target, actual: source },
      "Couldn't find matching cast"
    );
  }
  return null;
}

function findMatchingCast(
  g: Global,
  visited: QName[],
  from: ScalarT,
  to: ScalarT,
  type: CastType
): {
  source: ScalarT;
  target: ScalarT;
  type: CastType;
} | null {
  const castIndex = getCastIndex(g);

  const foundDomainFrom = g.domains.find((d) => eqQNames(d.name, from.name));
  if (
    foundDomainFrom &&
    foundDomainFrom.realtype.kind === "scalar" &&
    eqQNames(foundDomainFrom.realtype.name, to.name) &&
    type === "explicit"
  ) {
    // domain(int)::int
    return { source: from, target: to, type: "implicit" };
  }

  if (eqQNames(from.name, to.name)) {
    return { source: from, target: to, type: "implicit" };
  } else {
    const fromKey = from.name.name.toLowerCase();
    const castsForSource = castIndex.get(fromKey) || [];
    const halfMatching = castsForSource.filter(
      (c) =>
        (c.type === type ||
          (c.type === "implicit" && type === "assignment") ||
          (c.type === "assignment" && type === "explicit") ||
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
          g,
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
    referenceCounter?: number;
    readonly type:
      | Type
      | VoidT /* with statement can return bindings of type void */;
    // | ScalarT // declare bindings and function parameters
    // | ParametrizedT<ScalarT> // declare bindings and function parameters
    // | RecordT; // with, (temp tables?)
  }>;
};

export function notImplementedYet(node: any): any {
  throw new NotImplementedYet(node);
}

function mkType(g: Global, tn: TypeName, constraints: Constraint[]): SimpleT {
  const typeInfo = getTypeName(tn);
  let t_;
  if (typeInfo.isArray) {
    const elTypeName = normalizeTypeName(typeInfo.name);
    const scalarT = checkType(g, tn.location, elTypeName);
    t_ = BuiltinTypeConstructors.Array(scalarT);
  } else {
    const typeName = normalizeTypeName(typeInfo.name);
    t_ = checkType(g, tn.location, typeName);
  }
  const notnullable = constraints.some(
    (c) => enumEq(c.contype, ConstrType, ConstrType.CONSTR_NOTNULL) || enumEq(c.contype, ConstrType, ConstrType.CONSTR_PRIMARY)
  );
  return notnullable ? t_ : nullify(t_);
}

function checkType(
  g: Global,
  l: number | undefined,
  name: string
): ScalarT {
  const foundDom = g.domains.find((d) => d.name.name === name);
  if (foundDom) {
    return {
      kind: "scalar",
      name: { _location: l, name: name },
      domain: {
        realtype: foundDom.realtype,
      },
    };
  }

  const foundEnum = g.enums.find((d) => d.name.name === name);
  if (foundEnum) {
    return {
      kind: "scalar",
      name: { _location: l, name: name },
      isEnum: {
        values: foundEnum.values,
      },
    };
  }

  if (builtinTypeNames.has(name)) {
    return {
      kind: "scalar",
      name: { _location: l, name: name },
    };
  }
  throw new UnknownIdentifier(l, { name });
}

function doCreateTable(g: Global, s: CreateStmt): Global {
  if ((s.inhRelations || []).length !== 0) {
    return notImplementedYet(s);
  }
  const tableElts = s.tableElts || [];
  const fields = tableElts.reduce(function (acc: Field[], elt) {
    if ("TableLikeClause" in elt) {
      const tlc = elt.TableLikeClause;
      const targetTable = rangeVarToQName(tlc.relation!);
      const found = g.tables.find((t) => eqQNames(t.name, targetTable));
      if (!found) {
        throw new UnknownIdentifier(tlc.relation?.location, targetTable);
      }
      return acc.concat(found.rel.fields);
    } else if ("ColumnDef" in elt) {
      const col = elt.ColumnDef;
      const constraints = extractConstraints(col.constraints || []);
      return acc.concat({
        name: { name: col.colname || "" },
        type: mkType(g, col.typeName!, constraints),
      });
    } else {
      return acc;
    }
  }, []);

  const primaryKey = (function () {
    // Check table-level constraints
    const tableConstraints = (s.constraints || [])
      .filter((n): n is { Constraint: Constraint } => "Constraint" in n)
      .map((n) => n.Constraint);
    const pkConstraint = tableConstraints.find(
      (c) => enumEq(c.contype, ConstrType, ConstrType.CONSTR_PRIMARY)
    );
    if (pkConstraint) {
      return (pkConstraint.keys || []).map((k): Name => {
        if ("String" in k) {
          return { name: k.String.sval || "" };
        }
        return { name: "" };
      });
    }
    // Check column-level constraints
    const columnsWithPK = tableElts.filter((elt) => {
      if (!("ColumnDef" in elt)) return false;
      const col = elt.ColumnDef;
      return extractConstraints(col.constraints || []).some(
        (c) => enumEq(c.contype, ConstrType, ConstrType.CONSTR_PRIMARY)
      );
    });
    if (columnsWithPK.length > 0) {
      return columnsWithPK.map((elt) => {
        const col = (elt as { ColumnDef: ColumnDef }).ColumnDef;
        return { name: col.colname || "" } as Name;
      });
    }
    return [];
  })();

  const defaults = mapPartial(tableElts, (elt) => {
    if (!("ColumnDef" in elt)) return null;
    const col = elt.ColumnDef;
    const constraints = extractConstraints(col.constraints || []);
    const t = mkType(g, col.typeName!, constraints);
    if (t.kind === "scalar" && t.name.name.toLowerCase() === "serial") {
      return col;
    }
    if (constraints.some((c) => enumEq(c.contype, ConstrType, ConstrType.CONSTR_DEFAULT))) {
      return col;
    }
    return null;
  });

  const tableName = rangeVarToQName(s.relation!);
  return {
    ...g,
    tables: g.tables.concat({
      name: tableName,
      primaryKey,
      defaults: defaults.map((c) => ({ name: c.colname || "" })),
      rel: {
        kind: "record",
        fields,
      },
    }),
  };
}

function extractConstraints(nodes: Node[]): Constraint[] {
  return nodes
    .filter((n): n is { Constraint: Constraint } => "Constraint" in n)
    .map((n) => n.Constraint);
}
function doCreateView(g: Global, s: ViewStmt): Global {
  const queryNode = s.query;
  if (!queryNode || !("SelectStmt" in queryNode)) {
    throw new ErrorWithLocation(s.view?.location, "View without query");
  }
  const sel = elabSelect(
    g,
    { froms: [], decls: [] },
    queryNode.SelectStmt,
    null
  );
  if (sel.kind === "void") {
    throw new ErrorWithLocation(s.view?.location, "View returns void");
  }
  const viewName = rangeVarToQName(s.view!);
  return {
    ...g,
    views: g.views.concat({
      name: viewName,
      rel: sel,
    }),
  };
}

function doCreateMaterializedView(g: Global, s: CreateTableAsStmt): Global {
  const queryNode = s.query;
  if (!queryNode || !("SelectStmt" in queryNode)) {
    throw new ErrorWithLocation(undefined, "Materialized view without query");
  }
  const sel = elabSelect(
    g,
    { froms: [], decls: [] },
    queryNode.SelectStmt,
    null
  );
  if (sel.kind === "void") {
    throw new ErrorWithLocation(undefined, "Materialized view returns void");
  }
  const viewName = rangeVarToQName(s.into?.rel!);
  return {
    ...g,
    views: g.views.concat({
      name: viewName,
      rel: sel,
    }),
  };
}
function doAlterTable(g: Global, s: AlterTableStmt): Global {
  const cmds = s.cmds || [];
  const allHandled = cmds.every((cmdNode) => {
    if (!("AlterTableCmd" in cmdNode)) return false;
    const cmd = cmdNode.AlterTableCmd;
    return (
      enumEq(cmd.subtype, AlterTableType, AlterTableType.AT_AddConstraint) ||
      enumEq(cmd.subtype, AlterTableType, AlterTableType.AT_DropConstraint) ||
      enumEq(cmd.subtype, AlterTableType, AlterTableType.AT_ChangeOwner)
    );
  });
  if (allHandled) {
    return g;
  }
  return notImplementedYet(s);
}

function deriveNameFromExpr(expr: Node): Name | null {
  if ("ColumnRef" in expr) {
    const ref = getColumnRef(expr.ColumnRef);
    return { name: ref.column };
  } else if ("FuncCall" in expr) {
    const qname = getQNameFromNodes(expr.FuncCall.funcname || []);
    // pg_catalog functions (extract, overlaps, etc.) are internal representations
    // of SQL syntax; don't derive a name from them
    if (qname.schema === "pg_catalog") {
      return null;
    }
    return qname;
  } else if ("CoalesceExpr" in expr) {
    return { name: "coalesce" };
  } else if ("NullIfExpr" in expr) {
    return { name: "nullif" };
  } else if ("MinMaxExpr" in expr) {
    const op = (expr.MinMaxExpr as any).op;
    return { name: op === "IS_GREATEST" || op === 0 ? "greatest" : "least" };
  } else if ("A_Expr" in expr) {
    const ae = expr.A_Expr;
    if (enumEq(ae.kind, A_Expr_Kind, A_Expr_Kind.AEXPR_NULLIF)) {
      return { name: "nullif" };
    }
    return null;
  } else if ("ParamRef" in expr) {
    return null;
  } else {
    return null;
  }
}

// WITH ... INSERT is also a SelectStatement. So this will return RecordT or VoidT I think...
export function elabSelect(
  g: Global,
  c: Context,
  s: SelectStmt,
  columnNames: Name[] | null
): RecordT | VoidT {
  // WITH clause
  if (s.withClause) {
    if (s.withClause.recursive) {
      return notImplementedYet(s);
    }
    const ctes = s.withClause.ctes || [];
    const resultingContext = ctes.reduce((ctx, cteNode) => {
      if (!("CommonTableExpr" in cteNode)) return ctx;
      const cte = cteNode.CommonTableExpr;
      if (!cte.ctequery) return ctx;
      const innerStmt = cte.ctequery;
      const t = elabStatementNode(g, ctx, innerStmt);
      return {
        ...ctx,
        decls: ctx.decls.concat({
          name: { name: cte.ctename || "" },
          type: t || { kind: "void" },
        }),
      };
    }, c);
    // Elab the main statement (same SelectStmt but without withClause)
    const mainSelect: SelectStmt = { ...s, withClause: undefined };
    const res = elabSelectOrStatement(g, resultingContext, mainSelect);
    if (res.kind !== "void" && res.kind !== "record") {
      return {
        kind: "record",
        fields: [{ name: null, type: res, _expr: { SelectStmt: s } }],
      };
    } else {
      return res;
    }
  }

  // UNION / INTERSECT / EXCEPT
  if (s.op !== undefined && !enumEq(s.op, SetOperation, SetOperation.SETOP_NONE)) {
    if (!s.larg || !s.rarg) {
      throw new Error("Set operation without left/right args");
    }
    const typeL = elabSelect(g, c, s.larg, null);
    const typeR = elabSelect(g, c, s.rarg, null);
    const dummyNode: Node = { SelectStmt: s };
    if (typeL.kind === "void") {
      throw new KindMismatch(dummyNode, typeL, "Can't union a statement that returns nothing");
    }
    if (typeR.kind === "void") {
      throw new KindMismatch(dummyNode, typeR, "Can't union a statement that returns nothing");
    }
    return unifyRecords(g, dummyNode, typeL, typeR);
  }

  // VALUES
  if (s.valuesLists && s.valuesLists.length > 0) {
    const dummyNode: Node = { SelectStmt: s };
    const typesPerRow: RecordT[] = s.valuesLists.map((rowNode) => {
      // Each row is a List node
      const exprs: Node[] = "List" in rowNode ? (rowNode.List.items || []) : [];
      const fields = exprs.map((exp, i) => {
        const t_ = elabExpr(g, c, exp);
        const t = toSimpleT(t_);
        if (t === null) {
          throw new CantReduceToSimpleT(exp, t_);
        } else {
          const colName = (columnNames ? columnNames[i] : null) || null;
          return { name: colName, type: t, _expr: exp };
        }
      });
      return { kind: "record" as const, fields };
    });
    return typesPerRow.reduce(
      (acc: RecordT, t: RecordT) => unifyRecords(g, dummyNode, acc, t),
      typesPerRow[0]
    );
  }

  // Regular SELECT
  const newC = ((): Context => {
    const newC_: Context = addFromsToScope(g, c, s.fromClause || []);
    const inferredNullability = s.whereClause
      ? inferNullability(newC_, s.whereClause)
      : [];
    return {
      ...newC_,
      froms: newC_.froms.map((fr) => ({
        name: fr.name,
        type: {
          kind: "record" as const,
          fields: fr.type.fields.map((fi) => {
            const foundNullabilityInference = inferredNullability.find(
              (inf) =>
                eqQNames(inf.fromName, fr.name) &&
                inf.fieldName === fi.name?.name
            );
            if (foundNullabilityInference && isNullable(fi.type)) {
              const t =
                foundNullabilityInference.isNull === true
                  ? fi.type
                  : unnullify(fi.type);
              return { name: fi.name, type: t, _expr: fi._expr };
            } else {
              return fi;
            }
          }),
        },
      })),
    };
  })();

  if (s.whereClause) {
    const t = elabExpr(g, newC, s.whereClause);
    requireBoolean(s.whereClause, t);
  }

  const names: string[] = [];
  const targetList = s.targetList || [];
  const fields = targetList.flatMap((resTargetNode): Field[] => {
    if (!("ResTarget" in resTargetNode)) return [];
    const rt = resTargetNode.ResTarget;
    const val = rt.val;
    if (!val) return [];
    const alias = rt.name ? { name: rt.name } : null;
    const n = alias || deriveNameFromExpr(val);

    if (!isNil(n)) {
      if (names.includes(n.name)) {
        throw new DuplicateFieldNames(val, n.name);
      }
      names.push(n.name);
    }

    const t = elabExpr(g, newC, val);

    if (t.kind === "record") {
      if (t.fields.length === 0) {
        throw new KindMismatch(val, t, "Record with no fields");
      } else if (t.fields.length === 1) {
        if ("ColumnRef" in val) {
          const ref = getColumnRef(val.ColumnRef);
          if (ref.column === "*") return t.fields;
        }
        return [{ name: n, type: t.fields[0].type, _expr: val }];
      } else {
        if ("ColumnRef" in val) {
          const ref = getColumnRef(val.ColumnRef);
          if (ref.column === "*") return t.fields;
        }
        throw new KindMismatch(val, t, "Record with more than one field");
      }
    }

    return [{ name: n, type: t, _expr: val }];
  });

  if (s.limitCount) {
    const t = elabExpr(g, newC, s.limitCount);
    unify(g, s.limitCount, t, BuiltinTypes.Integer);
  }

  if (s.limitOffset) {
    const t = elabExpr(g, newC, s.limitOffset);
    unify(g, s.limitOffset, t, BuiltinTypes.Integer);
  }

  return { kind: "record", fields };
}

// Helper to elab a SelectStmt that might have a with clause, returning VoidT or Type
function elabSelectOrStatement(
  g: Global,
  c: Context,
  s: SelectStmt
): VoidT | Type {
  // If the select has a selectStmt (InsertStmt etc nested), dispatch through elabStatementNode
  return elabSelect(g, c, s, null);
}

function elabInsert(
  g: Global,
  c: Context,
  s: InsertStmt
): VoidT | RecordT {
  const intoRV = s.relation!;
  const intoName = rangeVarToQName(intoRV);
  const insertingInto: null | {
    readonly name: QName;
    readonly rel: RecordT;
  } = g.tables.find((t) => eqQNames(t.name, intoName)) || null;
  if (!insertingInto) {
    throw new UnknownIdentifier(intoRV.location, intoName);
  }

  const aliasName = rangeVarAlias(intoRV) || intoName.name;
  const newContext = {
    ...c,
    froms: c.froms.concat({
      name: { name: aliasName },
      type: insertingInto.rel,
    }),
  };

  const dummyNode: Node = { InsertStmt: s };

  const columns: Field[] = s.cols
    ? s.cols.map((colNode) => {
        if (!("ResTarget" in colNode)) throw new Error("Expected ResTarget in INSERT cols");
        const rt = colNode.ResTarget;
        const colName: QName = { name: rt.name || "" };
        const foundField = insertingInto.rel.fields.find((f) => {
          if (!f.name) throw new Error("Assertion error: Table field without name");
          return eqQNames(colName, f.name);
        });
        if (!foundField) {
          throw new UnknownIdentifier(rt.location, colName);
        }
        return foundField;
      })
    : insertingInto.rel.fields;

  // The selectStmt contains the VALUES or SELECT
  if (!s.selectStmt || !("SelectStmt" in s.selectStmt)) {
    throw new ColumnsMismatch(dummyNode, { expected: columns.length, actual: 0 });
  }
  const insertSelect = s.selectStmt.SelectStmt;
  const insertT = elabSelect(g, c, insertSelect, null);

  if (insertT.kind === "void") {
    throw new ColumnsMismatch(dummyNode, { expected: columns.length, actual: 0 });
  }

  if (insertT.fields.length !== columns.length) {
    throw new ColumnsMismatch(dummyNode, {
      expected: columns.length,
      actual: insertT.fields.length,
    });
  }

  insertT.fields.forEach((insertField, i) => {
    const col = columns[i];
    castOrThrow(
      g,
      insertField._expr || dummyNode,
      insertField.type,
      col.type,
      "assignment"
    );
  });

  if (s.returningList && s.returningList.length > 0) {
    return {
      kind: "record",
      fields: s.returningList.map((rtNode) => {
        if (!("ResTarget" in rtNode)) throw new Error("Expected ResTarget in RETURNING");
        const rt = rtNode.ResTarget;
        const val = rt.val!;
        const t_ = elabExpr(g, newContext, val);
        const t = toSimpleT(t_);
        if (!t) {
          throw new KindMismatch(val, t_, "Need simple type here, not a record");
        }
        return {
          name: (rt.name ? { name: rt.name } : null) || deriveNameFromExpr(val),
          type: t,
          _expr: val,
        };
      }),
    };
  } else {
    return { kind: "void" };
  }
}

function elabDelete(
  g: Global,
  c: Context,
  s: DeleteStmt
): VoidT | RecordT {
  const rv = s.relation!;
  const tableName = rangeVarToQName(rv);
  const tableDef = g.tables.find((t) => eqQNames(t.name, tableName)) || null;
  if (!tableDef) {
    throw new UnknownIdentifier(rv.location, tableName);
  }
  const aliasName = rangeVarAlias(rv) || tableName.name;
  const newContext = {
    ...c,
    froms: c.froms.concat({
      name: { name: aliasName },
      type: tableDef.rel,
    }),
  };

  if (s.whereClause) {
    const whereT = elabExpr(g, newContext, s.whereClause);
    requireBoolean(s.whereClause, whereT);
  }

  return elabReturningList(g, newContext, s.returningList);
}

function elabUpdate(
  g: Global,
  c: Context,
  s: UpdateStmt
): VoidT | RecordT {
  const rv = s.relation!;
  const tableName = rangeVarToQName(rv);
  const tableDef = g.tables.find((t) => eqQNames(t.name, tableName)) || null;
  if (!tableDef) {
    throw new UnknownIdentifier(rv.location, tableName);
  }
  const aliasName = rangeVarAlias(rv) || tableName.name;
  const newC_ = {
    ...c,
    froms: c.froms.concat({
      name: { name: aliasName },
      type: tableDef.rel,
    }),
  };

  const newContext =
    s.fromClause && s.fromClause.length > 0
      ? addFromsToScope(g, newC_, s.fromClause)
      : newC_;

  for (let rtNode of s.targetList || []) {
    if (!("ResTarget" in rtNode)) continue;
    const rt = rtNode.ResTarget;
    const colName: QName = { name: rt.name || "" };
    const val = rt.val;
    if (!val) continue;
    const t = elabExpr(g, newContext, val);
    const field = tableDef.rel.fields.find(
      (f) => f.name && eqQNames(f.name, colName)
    );
    if (!field) {
      throw new UnknownField(val, tableDef.rel, colName);
    }
    const simpleT = toSimpleT(t);
    if (simpleT === null) {
      throw new KindMismatch(val, t, "");
    }
    unifySimplesOrThrow(g, val, field.type, simpleT);
  }

  if (s.whereClause) {
    const whereT = elabExpr(g, newContext, s.whereClause);
    requireBoolean(s.whereClause, whereT);
  }

  return elabReturningList(g, newContext, s.returningList);
}

function elabReturningList(
  g: Global,
  c: Context,
  returningList: Node[] | undefined
): VoidT | RecordT {
  if (returningList && returningList.length > 0) {
    return {
      kind: "record",
      fields: returningList.map((rtNode) => {
        if (!("ResTarget" in rtNode)) throw new Error("Expected ResTarget");
        const rt = rtNode.ResTarget;
        const val = rt.val!;
        const t_ = elabExpr(g, c, val);
        const t = toSimpleT(t_);
        if (!t) {
          throw new KindMismatch(val, t_, "Need simple type here, not a record");
        }
        return {
          name: (rt.name ? { name: rt.name } : null) || deriveNameFromExpr(val),
          type: t,
          _expr: val,
        };
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
  s: CreateFunctionStmt
): functionType {
  const name = getQNameFromNodes(s.funcname || []);
  const funcOpts = extractFunctionOptions(s);
  const language = funcOpts.language;
  const code = funcOpts.code;
  if (!language) {
    throw new Error(`Please provide language for function ${showQName(name)}`);
  }
  if (code === undefined) {
    throw new ErrorWithLocation(undefined, "Function definition without body");
  }
  if (language.toLowerCase() === "sql") {
    const params = (s.parameters || [])
      .filter((n): n is { FunctionParameter: FunctionParameter } => "FunctionParameter" in n)
      .map((n) => n.FunctionParameter)
      .filter((p) => !p.mode || enumEq(p.mode, FunctionParameterMode, FunctionParameterMode.FUNC_PARAM_IN) || enumEq(p.mode, FunctionParameterMode, FunctionParameterMode.FUNC_PARAM_DEFAULT));

    const inputs = params.map((arg) => {
      if (!arg.name) {
        throw new Error(
          "Please provide name for all function arguments for " + showQName(name)
        );
      }
      const paramT = mkType(g, arg.argType!, [{ contype: ConstrType.CONSTR_NOTNULL } as unknown as Constraint]);
      // Default rule: params are NOT NULL unless default is null
      if (arg.defexpr) {
        const defNode = arg.defexpr;
        // Check for DEFAULT NULL
        if ("A_Const" in defNode && defNode.A_Const.isnull) {
          return {
            name: { name: arg.name },
            type: nullify(paramT),
            referenceCounter: 0,
          };
        }
        // Check for DEFAULT '{NULL}' (string) for nullable arrays
        if (
          "A_Const" in defNode &&
          defNode.A_Const.sval &&
          defNode.A_Const.sval.sval?.toLowerCase() === "{null}" &&
          paramT.kind === "array"
        ) {
          return {
            name: { name: arg.name },
            type: nullifyArray(paramT),
            referenceCounter: 0,
          };
        }
        // Check for DEFAULT ARRAY[NULL] for nullable arrays
        if ("A_ArrayExpr" in defNode && paramT.kind === "array") {
          const elts = defNode.A_ArrayExpr.elements || [];
          if (elts.length > 0 && "A_Const" in elts[0] && elts[0].A_Const.isnull) {
            return {
              name: { name: arg.name },
              type: nullifyArray(paramT),
              referenceCounter: 0,
            };
          }
        }
      }
      return {
        name: { name: arg.name },
        type: paramT,
        referenceCounter: 0,
      };
    });
    const contextForBody: Context = {
      froms: c.froms,
      decls: c.decls.concat(inputs),
    };

    const bodyStatements = parseStatements(code);

    if (bodyStatements.length === 0) {
      return {
        name,
        inputs,
        returns: { kind: "void" },
        multipleRows: false,
        code,
        language,
      };
    } else {
      const lastStatement = bodyStatements[bodyStatements.length - 1];
      const returnType = elabStatementNode(g, contextForBody, lastStatement.stmt!);

      const returnTypeName = s.returnType;
      const isSetof = s.returnType ? (function () {
        // Check if returnType has setof by checking if it has arrayBounds or the setof field
        // In the new AST, setof is indicated in the CreateFunctionStmt itself
        // Actually, the returnType in CreateFunctionStmt is a TypeName which has setof field
        return (s.returnType as any)?.setof === true;
      })() : false;

      const unifiedReturnType = (function (): Type | VoidT {
        const location = returnTypeName?.location || name._location;
        const dummyExpr: Node = { A_Const: { isnull: true, location } };

        if (returnType.kind === "void") {
          if (!returnTypeName) {
            return { kind: "void" };
          }
          const retTypeInfo = getTypeName(returnTypeName);
          if (retTypeInfo.name === "void") {
            return { kind: "void" };
          }
          const annotatedType = mkType(g, returnTypeName, []);
          throw new KindMismatch(dummyExpr, annotatedType, "Function returns void");
        }
        if (!returnTypeName) {
          throw new KindMismatch(dummyExpr, { kind: "void" }, "Function needs return type");
        }
        const retTypeInfo = getTypeName(returnTypeName);
        if (retTypeInfo.name === "record") {
          if (returnType.kind === "record") {
            return returnType;
          } else {
            throw new KindMismatch(
              dummyExpr,
              returnType,
              "Function returns record type but type annotation disagrees"
            );
          }
        }
        const annotatedType = mkType(g, returnTypeName, [
          { contype: ConstrType.CONSTR_NOTNULL } as unknown as Constraint,
        ]);
        try {
          return unify(g, dummyExpr, returnType, annotatedType);
        } catch (err) {
          const mess = err instanceof ErrorWithLocation ? err.message : "";
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
      })();

      if (returnTypeName) {
        const retTypeInfo = getTypeName(returnTypeName);
        if (retTypeInfo.name === "record") {
          if (unifiedReturnType.kind !== "record") {
            throw new ErrorWithLocation(
              undefined,
              `Function should return record, but returns ${JSON.stringify(unifiedReturnType)}`
            );
          }
        }
      }

      const unusedArgument = inputs.find((inp) => inp.referenceCounter === 0);
      if (unusedArgument) {
        throw new Error(`Unused argument ${showQName(unusedArgument.name)}`);
      }

      return {
        name,
        inputs: inputs.map((inp) => ({ name: inp.name, type: inp.type })),
        returns: unifiedReturnType,
        multipleRows: isSetof,
        code,
        language,
      };
    }
  } else {
    return notImplementedYet(s);
  }
}

type Joined = { name: QName; rel: RecordT };
type Nullable<T> = T | null;

function findRel(g: Global, c: Context, fromNode: Node, n: QName): Nullable<RecordT> {
  const d = c.decls.find((d) => eqQNames(d.name, n));
  if (d) {
    if (d.type.kind === "record") {
      return d.type;
    } else {
      throw new KindMismatch_From(fromNode, d.type, "Expecting a record or table");
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

function showLocation(loc: number | undefined): string {
  if (loc === undefined) {
    return "??";
  } else {
    return String(loc);
  }
}

export class ErrorWithLocation {
  public l: number | undefined;
  public message: string;
  constructor(l: number | undefined, m: string) {
    this.message = m;
    this.l = l;
  }
}

class NotImplementedYet extends ErrorWithLocation {
  constructor(node: any) {
    const m = node
      ? `: \n${JSON.stringify(node).slice(0, 500)}`
      : "";
    super(nodeLocation(node), `NotImplementedYet: ${m}`);
  }
}

class UnknownField extends ErrorWithLocation {
  constructor(e: Node | number | undefined, s: RecordT, n: Name | QName) {
    const loc = typeof e === "number" || e === undefined ? e : nodeLocation(e);
    super(
      loc,
      `UnknownField ${n.name}.
Keys present:
${s.fields
  .map((f) => (f.name?.name || "") + ": " + showType(f.type))
  .join("\n")}`
    );
  }
}
export class UnknownIdentifier extends ErrorWithLocation {
  constructor(e: Node | number | undefined, m: QName) {
    const loc = typeof e === "number" || e === undefined ? e : nodeLocation(e);
    super(loc, `UnknownIdentifier ${showQName(m)}`);
  }
}
export class CantReduceToSimpleT extends ErrorWithLocation {
  constructor(e: Node, m: Type) {
    super(nodeLocation(e), `Can't reduce to simple type: ${showType(m)}`);
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
  constructor(e: Node, n: QName, t1: Type) {
    super(
      nodeLocation(e),
      `Can't apply unary operator "${showQName(n)}" to ${showType(t1)}`
    );
  }
}
export class UnknownBinaryOp extends ErrorWithLocation {
  constructor(e: Node, n: QName, t1: Type, t2: Type) {
    super(
      nodeLocation(e),
      `Can't apply operator "${showQName(n)}" to ${showType(t1)} and ${showType(t2)}`
    );
  }
}
export class UnknownFunction extends ErrorWithLocation {
  constructor(e: Node, n: QName) {
    super(nodeLocation(e), `Unknown function "${showQName(n)}"`);
  }
}
export class InvalidArguments extends ErrorWithLocation {
  constructor(e: Node, n: QName, argTs: Type[], reason?: string) {
    const argsString = argTs.map((t) => showType(t)).join(", ");
    super(
      nodeLocation(e),
      `Can't apply function "${showQName(n)}" to arguments: ${argsString}. ${reason || ""}`
    );
  }
}
export class TypecheckerError extends ErrorWithLocation {
  constructor(e: Node, m: string) {
    super(nodeLocation(e), `Typechecker error: ${m}`);
  }
}
class AmbiguousIdentifier extends ErrorWithLocation {
  constructor(e: Node, m: QName, records: QName[]) {
    super(
      nodeLocation(e),
      `AmbiguousIdentifier ${showQName(m)} @ ${showLocation(m._location)} present in ${JSON.stringify(records)}`
    );
  }
}
class ColumnsMismatch extends ErrorWithLocation {
  constructor(e: Node, opts: { expected: number; actual: number }) {
    super(
      nodeLocation(e),
      `ColumnsMismatch: Expecting ${opts.expected} columns, got ${opts.actual} columns`
    );
  }
}
class KindMismatch extends ErrorWithLocation {
  constructor(e: Node, type: Type | VoidT, errormsg: string) {
    super(
      nodeLocation(e),
      `
KindMismatch:
${nodeToSql(e)}

${errormsg}}

Type:
${JSON.stringify(type)}
`
    );
  }
}
class KindMismatch_From extends ErrorWithLocation {
  constructor(f: Node, type: Type | VoidT, errormsg: string) {
    super(
      nodeLocation(f),
      `
KindMismatch_From:
${nodeToSql(f)}

${errormsg}}

Type:
${JSON.stringify(type)}
`
    );
  }
}
class DuplicateFieldNames extends ErrorWithLocation {
  constructor(e: Node, name: string) {
    super(
      nodeLocation(e),
      `Duplicate column names: expression:

${nodeToSql(e)}

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
    e: Node,
    ts: {
      expected: Type;
      actual: Type;
    },
    mess?: string
  ) {
    super(
      nodeLocation(e),
      `
TypeMismatch:
${nodeToSql(e)}

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
    e: Node,
    ts: {
      from: Type;
      to: Type;
    }
  ) {
    super(
      nodeLocation(e),
      `
Cannot cast:
${JSON.stringify(ts.from)}

to
${JSON.stringify(ts.to)}}

in expr:
${nodeToSql(e)}
`
    );

    this.from = ts.from;
    this.to = ts.to;
  }
}

const warnings: [Node, string][] = [];
function registerWarning(e: Node, message: string) {
  warnings.push([e, message]);
}

function mergeJoined(c: Context, handledFroms: Joined[]): Context {
  return {
    ...c,
    froms: handledFroms
      .map(function (f) {
        return {
          name: f.name,
          type: f.rel,
        };
      })
      .concat(c.froms),
  };
}

function doSingleFrom(
  g: Global,
  c: Context,
  currentJoined: Joined[],
  f: Node
): Joined[] {
  // Handle JoinExpr by recursively processing left and right
  if ("JoinExpr" in f) {
    const je = f.JoinExpr;
    // Process left side first
    let joined = currentJoined;
    if (je.larg) {
      joined = doSingleFrom(g, c, joined, je.larg);
    }
    // Process right side
    if (je.rarg) {
      joined = doSingleFrom(g, c, joined, je.rarg);
    }
    // Process ON clause
    if (je.quals) {
      const t = elabExpr(g, mergeJoined(c, joined), je.quals);
      requireBoolean(je.quals, t);
    }
    // Handle nullification for LEFT/RIGHT/FULL joins
    // For LEFT JOIN: right side gets nullified
    // For RIGHT JOIN: left side gets nullified
    // For FULL JOIN: both sides get nullified
    if (enumEq(je.jointype, JoinType, JoinType.JOIN_LEFT) || enumEq(je.jointype, JoinType, JoinType.JOIN_FULL)) {
      // Nullify the last-added joined (the right side)
      if (joined.length > 0) {
        const last = joined[joined.length - 1];
        joined = joined.slice(0, -1).concat({ ...last, rel: nullifyRecord(last.rel) });
      }
    }
    if (enumEq(je.jointype, JoinType, JoinType.JOIN_RIGHT) || enumEq(je.jointype, JoinType, JoinType.JOIN_FULL)) {
      // Nullify all existing (the left side)
      joined = joined.map((j, i) =>
        i < joined.length - 1 ? { ...j, rel: nullifyRecord(j.rel) } : j
      );
    }
    return joined;
  }

  function getJoined(f: Node): Joined {
    if ("RangeSubselect" in f) {
      const rs = f.RangeSubselect;
      const cWithLateral = rs.lateral ? mergeJoined(c, currentJoined) : c;
      if (!rs.subquery || !("SelectStmt" in rs.subquery)) {
        throw new Error("RangeSubselect without SelectStmt");
      }
      // Extract column aliases from the alias if present
      const columnNames = rs.alias?.colnames
        ? rs.alias.colnames.map((n: Node): Name => {
            if ("String" in n) return { name: n.String.sval || "" };
            return { name: "" };
          })
        : null;
      const t = elabSelect(g, cWithLateral, rs.subquery.SelectStmt, columnNames);
      if (t.kind === "void") {
        throw new KindMismatch(
          f,
          t,
          "Can't bind a statement that returns void in a FROM statement"
        );
      }
      return {
        name: { name: rs.alias?.aliasname || "" },
        rel: t,
      };
    } else if ("RangeFunction" in f) {
      return notImplementedYet(f);
    } else if ("RangeVar" in f) {
      const rv = f.RangeVar;
      const tableName = rangeVarToQName(rv);
      const foundRel = findRel(g, c, f, tableName);
      if (!foundRel) {
        throw new UnknownIdentifier(f, tableName);
      }
      return {
        name: {
          name: rangeVarAlias(rv) || tableName.name,
          _location: rv.location,
        },
        rel: foundRel,
      };
    } else {
      return notImplementedYet(f);
    }
  }

  const newJoined = getJoined(f);
  return currentJoined.concat(newJoined);
}

function addFromsToScope(g: Global, c: Context, froms: Node[]): Context {
  const inFroms: Joined[] = froms.reduce(function (acc: Joined[], f: Node) {
    return doSingleFrom(g, c, acc, f);
  }, []);
  return mergeJoined(c, inFroms);
}

function lookupInRecord(s: RecordT, name: Name): SimpleT | null {
  const found = s.fields.find((f) => f.name && f.name.name === name.name);
  if (found) {
    return found.type;
  } else {
    return null;
  }
}

function elabRef(c: Context, e: Node, ref: ColumnRef): Type {
  const info = getColumnRef(ref);
  if (info.column === "*") {
    if (info.table !== undefined) {
      const tab: QName = { name: info.table };
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
    return throwIfError(lookupRef(c, e, info)).type;
  }
}

function lookupRef(
  c: Context,
  e: Node,
  info: { table?: string; column: string }
):
  | ErrorWithLocation
  | {
      from: null | {
        fromName: QName;
        fieldName: string;
      };
      type: SimpleT;
    } {
  assert(info.column !== "*");
  const colName: Name = { name: info.column };
  if (info.table) {
    const tableName: QName = { name: info.table };
    const table = c.froms.find((d) => eqQNames(d.name, tableName));
    if (!table) {
      return new UnknownIdentifier(e, tableName);
    }
    if (!(table.type.kind === "record")) {
      return new KindMismatch(e, table.type, "Expecting Record");
    }
    const field = lookupInRecord(table.type, colName);
    if (!field) {
      return new UnknownField(e, table.type, colName);
    }
    return {
      type: field,
      from: {
        fromName: tableName,
        fieldName: info.column,
      },
    };
  } else {
    const foundFields: {
      fromName: QName;
      field: Name;
      type: SimpleT;
    }[] = mapPartial(c.froms, (t) => {
      const foundfield = lookupInRecord(t.type, colName);
      return foundfield
        ? { fromName: t.name, field: colName, type: foundfield }
        : null;
    });

    const qname: QName = { name: info.column };
    const foundIdentifiers = mapPartial(c.decls, (t) => {
      if (t.type.kind === "record" || t.type.kind === "void") {
        return null;
      } else {
        return t.name.name === info.column
          ? { name: t.name.name, type: t.type, decl: t }
          : null;
      }
    });

    if (foundFields.length === 0) {
      if (foundIdentifiers.length === 0) {
        return new UnknownIdentifier(e, qname);
      } else if (foundIdentifiers.length === 1) {
        if (!isNil(foundIdentifiers[0].decl.referenceCounter)) {
          foundIdentifiers[0].decl.referenceCounter += 1;
        }
        return { type: foundIdentifiers[0].type, from: null };
      } else {
        return new AmbiguousIdentifier(e, qname, []);
      }
    } else if (foundFields.length === 1) {
      if (foundIdentifiers.length > 0) {
        return new AmbiguousIdentifier(e, qname, []);
      }
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
        qname,
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
  description?: string;
};

export type unaryOp = {
  operand: SimpleT;
  result: SimpleT;
  name: QName;
  description?: string;
};

function isNotEmpty<A>(a: A | null | undefined): a is A {
  return a !== null && a !== undefined;
}

function elabAnyCall(
  g: Global,
  e: Node,
  name: QName,
  nullPolicy: "CALLED ON NULL INPUT" | "STRICT", // RETURNS NULL ON NULL INPUT = STRICT
  sourceTypes: Type[],
  targetTypes: Type[]
):
  | ErrorWithLocation
  | {
      nullifyResultType: boolean;
      score: number; // amount of coersions we had to do gets you into minus, so higher score is better
    } {
  if (sourceTypes.length !== targetTypes.length) {
    return new InvalidArguments(
      e,
      name,
      sourceTypes,
      `Number of arguments: ${sourceTypes.length} vs ${targetTypes.length}`
    );
  }

  let anySourceIsNullable = false;
  let score = 0;

  let i = 0;
  for (const sourceT of sourceTypes) {
    const targetT = targetTypes[i];
    if (sourceT.kind === "nullable") {
      const castErr = cast(g, e, sourceT.typevar, targetT, "implicit");
      if (castErr) {
        return castErr;
      }
      const newScore = eqType(sourceT.typevar, targetT) ? 0 : -1;
      score = score + newScore;
      anySourceIsNullable = true;
    } else {
      const castErr = cast(g, e, sourceT, targetT, "implicit");
      if (castErr) {
        return castErr;
      }
      const newScore = eqType(sourceT, targetT) ? 0 : -1;
      score = score + newScore;
    }
    i++;
  }

  return {
    score,
    nullifyResultType: nullPolicy === "STRICT" && anySourceIsNullable,
  };
}

function elabNullTest(g: Global, c: Context, e: Node, nt: NullTest): Type {
  const arg = nt.arg!;
  const t1_ = elabExpr(g, c, arg);
  const t1 = toSimpleT(t1_);
  if (t1 === null) {
    throw new CantReduceToSimpleT(e, t1_);
  }
  if (!isNullable(t1)) {
    registerWarning(e, "IS (NOT) NULL check but operand is not nullable");
  }
  return BuiltinTypes.Boolean;
}

function elabBoolExpr(g: Global, c: Context, e: Node, be: BoolExpr): Type {
  if (enumEq(be.boolop, BoolExprType, BoolExprType.NOT_EXPR)) {
    const operand = (be.args || [])[0];
    if (!operand) throw new Error("NOT without operand");
    const t1_ = elabExpr(g, c, operand);
    const t1 = toSimpleT(t1_);
    if (t1 === null) {
      throw new CantReduceToSimpleT(e, t1_);
    }
    // Try as unary NOT operator
    const found = builtinUnaryOperators
      .filter((op) => eqQNames({ name: "NOT" }, op.name))
      .map((op) => {
        const res = elabAnyCall(g, e, op.name, "STRICT", [t1], [op.operand]);
        if (res instanceof ErrorWithLocation) return null;
        return [res.score, op, res.nullifyResultType] as const;
      })
      .filter(isNotEmpty)
      .sort((m1, m2) => (m1[0] > m2[0] ? -1 : 1))[0];
    if (!found) {
      throw new UnknownUnaryOp(e, { name: "NOT" }, t1);
    }
    const op = found[1];
    return found[2] ? nullify(op.result) : op.result;
  }
  // AND / OR
  const args = be.args || [];
  let resultT: Type = elabExpr(g, c, args[0]);
  requireBoolean(args[0], resultT);
  for (let i = 1; i < args.length; i++) {
    const t = elabExpr(g, c, args[i]);
    requireBoolean(args[i], t);
  }
  return BuiltinTypes.Boolean;
}
function elabAExpr(g: Global, c: Context, e: Node, ae: A_Expr): Type {
  const opName = getOperatorName(ae.name || []);
  const opSchema = getOperatorSchema(ae.name || []);

  // Handle IN / NOT IN
  if (enumEq(ae.kind, A_Expr_Kind, A_Expr_Kind.AEXPR_IN)) {
    const left = ae.lexpr!;
    const right = ae.rexpr!;
    const t1_ = elabExpr(g, c, left);
    const t2_ = elabExpr(g, c, right);
    const t1 = toSimpleT(t1_);
    const t2 = toSimpleT(t2_);
    if (t1 === null) throw new CantReduceToSimpleT(e, t1_);
    if (t2 === null) throw new CantReduceToSimpleT(e, t2_);
    throwIfError(
      castSimples(g, e, t2, BuiltinTypeConstructors.List(t1), "implicit")
    );
    return BuiltinTypes.Boolean;
  }

  // Handle BETWEEN
  if (enumEq(ae.kind, A_Expr_Kind, A_Expr_Kind.AEXPR_BETWEEN) || enumEq(ae.kind, A_Expr_Kind, A_Expr_Kind.AEXPR_NOT_BETWEEN)) {
    const value = ae.lexpr!;
    // rexpr is a List with lo and hi
    const rangeList = ae.rexpr!;
    const valueT = elabExpr(g, c, value);
    if ("List" in rangeList) {
      const items = rangeList.List.items || [];
      if (items.length >= 2) {
        const loT = elabExpr(g, c, items[0]);
        const hiT = elabExpr(g, c, items[1]);
        castOrThrow(g, e, valueT, loT, "implicit");
        castOrThrow(g, e, valueT, hiT, "implicit");
      }
    }
    return BuiltinTypes.Boolean;
  }

  // Handle NULLIF (A_Expr_Kind.AEXPR_NULLIF)
  if (enumEq(ae.kind, A_Expr_Kind, A_Expr_Kind.AEXPR_NULLIF)) {
    const left = ae.lexpr!;
    const right = ae.rexpr!;
    const t1 = elabExpr(g, c, left);
    const t2 = elabExpr(g, c, right);
    const s1 = toSimpleT(t1);
    const s2 = toSimpleT(t2);
    if (s1 === null) throw new CantReduceToSimpleT(e, t1);
    if (s2 === null) throw new CantReduceToSimpleT(e, t2);
    unifySimplesOrThrow(g, e, s1, s2);
    return nullify(s1);
  }

  // Handle = ANY(...) / = ALL(...)  (AEXPR_OP_ANY / AEXPR_OP_ALL)
  if (enumEq(ae.kind, A_Expr_Kind, A_Expr_Kind.AEXPR_OP_ANY) || enumEq(ae.kind, A_Expr_Kind, A_Expr_Kind.AEXPR_OP_ALL)) {
    const left = ae.lexpr!;
    const right = ae.rexpr!;
    const tLeft_ = elabExpr(g, c, left);
    const tLeft = toSimpleT(tLeft_);
    if (tLeft === null) throw new CantReduceToSimpleT(e, tLeft_);
    const tRight_ = elabExpr(g, c, right);
    const tRight = toSimpleT(tRight_);
    if (tRight === null) throw new CantReduceToSimpleT(e, tRight_);
    // Right side should be an array; compare left with element type
    if (tRight.kind === "array") {
      unifySimplesOrThrow(g, e, tLeft, tRight.typevar);
    } else {
      unifySimplesOrThrow(g, e, tLeft, tRight);
    }
    return BuiltinTypes.Boolean;
  }

  // Regular binary op (AEXPR_OP)
  const left = ae.lexpr;
  const right = ae.rexpr;

  // Unary operator (prefix)
  if (!left && right) {
    const t1_ = elabExpr(g, c, right);
    const t1 = toSimpleT(t1_);
    if (t1 === null) throw new CantReduceToSimpleT(e, t1_);

    const found = builtinUnaryOperators
      .filter((op) => eqQNames({ name: opName, schema: opSchema }, op.name))
      .map((op) => {
        const res = elabAnyCall(g, e, op.name, "STRICT", [t1], [op.operand]);
        if (res instanceof ErrorWithLocation) return null;
        return [res.score, op, res.nullifyResultType] as const;
      })
      .filter(isNotEmpty)
      .sort((m1, m2) => (m1[0] > m2[0] ? -1 : 1))[0];

    if (!found) {
      throw new UnknownUnaryOp(e, { name: opName, schema: opSchema }, t1);
    }
    const op = found[1];
    return found[2] ? nullify(op.result) : op.result;
  }

  if (!left || !right) {
    throw new Error("Binary operator missing operand");
  }

  const t1_ = elabExpr(g, c, left);
  const t2_ = elabExpr(g, c, right);
  const t1 = toSimpleT(t1_);
  const t2 = toSimpleT(t2_);
  if (t1 === null) throw new CantReduceToSimpleT(e, t1_);
  if (t2 === null) throw new CantReduceToSimpleT(e, t2_);

  // = NULL check
  if (opName === "=" && (("A_Const" in left && left.A_Const.isnull) || ("A_Const" in right && right.A_Const.isnull))) {
    throw new ErrorWithLocation(
      ae.location,
      `Don't use \"= NULL\", use "IS NULL" instead`
    );
  }

  if (
    (opName === "=" || opName === "!=" || opName === "<>" ||
     opName === "@>" || opName === "<@" || opName === "&&") &&
    t1.kind === "array" && t2.kind === "array"
  ) {
    unifySimplesOrThrow(g, e, t1.typevar, t2.typevar);
    return BuiltinTypes.Boolean;
  }

  if (
    opName === "-" &&
    t1.kind === "scalar" && eqQNames(t1.name, BuiltinTypes.TimestampMultiRange.name) &&
    t2.kind === "scalar" && eqQNames(t2.name, BuiltinTypes.TimestampMultiRange.name)
  ) {
    return BuiltinTypes.TimestampMultiRange;
  }

  if (opName === "||") {
    if (t1.kind === "array" && t2.kind !== "array") {
      unifySimplesOrThrow(g, e, t1.typevar, t2);
      return t1;
    }
  }

  // JSON operators -> and ->>
  if (opName === "->" || opName === "->>") {
    try {
      castOrThrow(g, left, t1_, BuiltinTypeConstructors.Nullable(BuiltinTypes.Json), "implicit");
    } catch {
      castOrThrow(g, left, t1_, BuiltinTypeConstructors.Nullable(BuiltinTypes.Jsonb), "implicit");
    }
    return opName === "->>" ? BuiltinTypes.Text : AnyScalar;
  }

  if (opName === "OVERLAPS") {
    unifySimplesOrThrow(g, e, t1, BuiltinTypeConstructors.List(AnyScalar));
    unifySimplesOrThrow(g, e, t2, BuiltinTypeConstructors.List(AnyScalar));
    unifySimplesOrThrow(g, e, t1, t2);
    return BuiltinTypes.Boolean;
  }

  const opKey = normalizeOperatorName(opName).toLowerCase();
  const opsForName = getOperatorIndex(g).get(opKey) || [];

  const found = opsForName
    .sort((op) => eqType(op.left, op.right) ? -1 : 0)
    .map((op) => {
      const res = elabAnyCall(g, e, op.name, "STRICT", [t1, t2], [op.left, op.right]);
      if (res instanceof ErrorWithLocation) return null;
      return { ...res, op };
    })
    .filter(isNotEmpty)
    .sort((m1, m2) => (m1.score > m2.score ? -1 : 1));

  if (found.length === 0) {
    throw new UnknownBinaryOp(e, { name: opName, schema: opSchema }, t1, t2);
  }
  const best = found[0];
  return best.nullifyResultType ? nullify(best.op.result) : best.op.result;
}

// Map pg_catalog internal function names to their SQL-facing names
const pgCatalogAliases: Record<string, string> = {
  btrim: "trim",
  lpad: "lpad",
  rpad: "rpad",
};

function elabCall(g: Global, c: Context, e: Node, fc: FuncCall): Type {
  let funcName = getQNameFromNodes(fc.funcname || []);
  // The real PG parser rewrites some SQL functions to pg_catalog.internal_name
  if (funcName.schema === "pg_catalog") {
    const alias = pgCatalogAliases[funcName.name];
    if (alias) {
      funcName = { name: alias };
    } else {
      // Strip pg_catalog schema for general lookup
      funcName = { name: funcName.name, _location: funcName._location };
    }
  }
  const args = fc.args || [];
  const argTypes = args.map((arg) => elabExpr(g, c, arg));

  if (
    eqQNames(funcName, { name: "json_build_object" }) ||
    eqQNames(funcName, { name: "jsonb_build_object" })
  ) {
    if (args.length % 2 === 0) {
      const record: RecordT = { kind: "record", fields: [] };
      for (let i = 0; i < args.length; i += 2) {
        const key = args[i];
        if (!("A_Const" in key) || !key.A_Const.sval) {
          throw new TypeMismatch(
            args[i],
            { expected: BuiltinTypes.Text, actual: argTypes[i] },
            "Json keys can only be string literals (for now?)"
          );
        }
        const valT = argTypes[i + 1];
        const valTSimple = toSimpleT(valT);
        if (valTSimple === null) {
          throw new CantReduceToSimpleT(args[i], argTypes[i]);
        }
        record.fields.push({
          name: { name: key.A_Const.sval.sval || "" },
          type: valTSimple,
          _expr: args[i],
        });
      }
      return { kind: "jsonknown", record: record };
    } else {
      throw new InvalidArguments(e, funcName, argTypes);
    }
  }

  if (eqQNames(funcName, { name: "array_agg" })) {
    if (args.length === 1) {
      const subt = argTypes[0];
      if (subt.kind === "record") {
        throw new ErrorWithLocation(nodeLocation(args[0]), "Can't have record type inside array");
      }
      return BuiltinTypeConstructors.Nullable(BuiltinTypeConstructors.Array(subt));
    } else {
      throw new InvalidArguments(e, funcName, argTypes);
    }
  }

  if (eqQNames(funcName, { name: "trim" })) {
    return unifyOverloadedCall(g, e, funcName, args, argTypes, [
      { expectedArgs: [BuiltinTypes.Text], returnT: BuiltinTypes.Text },
    ]);
  }

  if (eqQNames(funcName, { name: "row_number" })) {
    return BuiltinTypes.Integer;
  }

  if (eqQNames(funcName, { name: "tsmultirange" })) {
    return BuiltinTypes.TimestampMultiRange;
  }

  if (eqQNames(funcName, { name: "starts_with" })) {
    return unifyCallGeneralOrThrow(g, e, funcName, args, argTypes,
      [BuiltinTypes.Text, BuiltinTypes.Text], BuiltinTypes.Boolean);
  }

  if (
    eqQNames(funcName, { name: "left" }) ||
    eqQNames(funcName, { name: "right" })
  ) {
    return unifyCallGeneralOrThrow(g, e, funcName, args, argTypes,
      [BuiltinTypes.Text, BuiltinTypes.Integer], BuiltinTypes.Text);
  }

  if (eqQNames(funcName, { name: "length" })) {
    return unifyCallGeneralOrThrow(g, e, funcName, args, argTypes,
      [BuiltinTypes.Text], BuiltinTypes.Integer);
  }

  if (eqQNames(funcName, { name: "tsrange" })) {
    return unifyCallGeneralOrThrow(g, e, funcName, args, argTypes,
      [BuiltinTypes.Timestamp, BuiltinTypes.Timestamp], BuiltinTypes.TimestampRange);
  }

  if (eqQNames(funcName, { name: "range_agg" })) {
    return unifyCallGeneralOrThrow(g, e, funcName, args, argTypes,
      [BuiltinTypes.TimestampRange], BuiltinTypes.TimestampMultiRange);
  }

  if (eqQNames(funcName, { name: "generate_series" })) {
    return unifyOverloadedCall(g, e, funcName, args, argTypes, [
      { expectedArgs: [BuiltinTypes.Integer, BuiltinTypes.Integer], returnT: BuiltinTypes.Integer },
      { expectedArgs: [BuiltinTypes.Integer, BuiltinTypes.Integer, BuiltinTypes.Integer], returnT: BuiltinTypes.Integer },
      { expectedArgs: [BuiltinTypes.Timestamp, BuiltinTypes.Timestamp, BuiltinTypes.Interval], returnT: BuiltinTypes.Timestamp },
      { expectedArgs: [BuiltinTypes.Date, BuiltinTypes.Date, BuiltinTypes.Interval], returnT: BuiltinTypes.Date },
    ]);
  }

  if (eqQNames(funcName, { name: "to_char" })) {
    if (isNullable(argTypes[0])) {
      return nullify(
        unifyOverloadedCall(g, e, funcName, args, [unnullify(argTypes[0] as SimpleT)], [
          { expectedArgs: [BuiltinTypes.Numeric], returnT: BuiltinTypes.Text },
          { expectedArgs: [BuiltinTypes.Interval], returnT: BuiltinTypes.Text },
          { expectedArgs: [BuiltinTypes.Timestamp], returnT: BuiltinTypes.Text },
          { expectedArgs: [BuiltinTypes.Date], returnT: BuiltinTypes.Text },
        ])
      );
    } else {
      return unifyOverloadedCall(g, e, funcName, args, [argTypes[0]], [
        { expectedArgs: [BuiltinTypes.Integer], returnT: BuiltinTypes.Text },
        { expectedArgs: [BuiltinTypes.Interval], returnT: BuiltinTypes.Text },
        { expectedArgs: [BuiltinTypes.Timestamp], returnT: BuiltinTypes.Text },
        { expectedArgs: [BuiltinTypes.Date], returnT: BuiltinTypes.Text },
      ]);
    }
  }

  if (eqQNames(funcName, { name: "nextval" })) {
    return unifyCallGeneralOrThrow(g, e, funcName, args, argTypes,
      [BuiltinTypes.Text], BuiltinTypes.Bigint);
  }

  if (eqQNames(funcName, { name: "now" })) {
    return unifyCallGeneralOrThrow(g, e, funcName, args, argTypes, [], BuiltinTypes.Timestamp);
  }

  if (
    eqQNames(funcName, { name: "any" }) ||
    eqQNames(funcName, { name: "some" }) ||
    eqQNames(funcName, { name: "all" })
  ) {
    if (args.length !== 1) throw new InvalidArguments(e, funcName, argTypes);
    const t_ = argTypes[0];
    const t = toSimpleT(t_);
    if (t === null) throw new CantReduceToSimpleT(args[0], argTypes[0]);
    const unifiedT = unifySimplesOrThrow(g, e, t, BuiltinTypeConstructors.Array(AnyScalar));
    if (unifiedT.kind !== "array") throw new TypecheckerError(e, "Expecting array type");
    return unifiedT.typevar;
  }

  if (eqQNames(funcName, { name: "array_length" })) {
    if (args.length !== 2) throw new InvalidArguments(e, funcName, argTypes);
    const t1 = toSimpleT(argTypes[0]);
    if (t1 === null) throw new CantReduceToSimpleT(args[0], argTypes[0]);
    if (t1.kind === "nullable") {
      if (t1.typevar.kind !== "array") throw new TypecheckerError(e, `Expecting array type instead of ${t1.kind}`);
    } else if (t1.kind !== "array") {
      throw new TypecheckerError(e, `Expecting array type instead of ${t1.kind}`);
    }
    const t2 = toSimpleT(argTypes[1]);
    if (t2 === null) throw new CantReduceToSimpleT(args[1], argTypes[1]);
    unifySimplesOrThrow(g, e, t2, BuiltinTypes.Integer);
    return t1.kind === "nullable" ? BuiltinTypeConstructors.Nullable(BuiltinTypes.Integer) : BuiltinTypes.Integer;
  }

  if (eqQNames(funcName, { name: "array_position" })) {
    if (args.length !== 2) throw new InvalidArguments(e, funcName, argTypes);
    const t1 = toSimpleT(argTypes[0]);
    if (t1 === null) throw new CantReduceToSimpleT(args[0], argTypes[0]);
    const t2 = toSimpleT(argTypes[1]);
    if (t2 === null) throw new CantReduceToSimpleT(args[1], argTypes[1]);
    if (t1.kind !== "array") throw new TypecheckerError(e, `Expecting array type instead of ${t1.kind}`);
    unifySimplesOrThrow(g, e, t1.typevar, t2);
    return BuiltinTypeConstructors.Nullable(BuiltinTypes.Integer);
  }

  if (eqQNames(funcName, { name: "sum" })) {
    return unifyOverloadedCall(g, e, funcName, args, argTypes, [
      { expectedArgs: [BuiltinTypes.Integer], returnT: BuiltinTypes.Bigint },
      { expectedArgs: [BuiltinTypes.Smallint], returnT: BuiltinTypes.Bigint },
      { expectedArgs: [BuiltinTypes.Bigint], returnT: BuiltinTypes.Numeric },
      { expectedArgs: [BuiltinTypes.Numeric], returnT: BuiltinTypes.Numeric },
      { expectedArgs: [BuiltinTypes.Real], returnT: BuiltinTypes.Real },
      { expectedArgs: [BuiltinTypes.Double], returnT: BuiltinTypes.Double },
      { expectedArgs: [BuiltinTypes.Float2], returnT: BuiltinTypes.Double },
      { expectedArgs: [BuiltinTypes.Float4], returnT: BuiltinTypes.Double },
      { expectedArgs: [BuiltinTypes.Float8], returnT: BuiltinTypes.Double },
      { expectedArgs: [BuiltinTypes.Money], returnT: BuiltinTypes.Money },
      ...g.domains
        .filter((d) => allNumericBuiltinTypes.some((t) => eqType(t, d.realtype)))
        .flatMap((d) => {
          const asSimpleT = { kind: "scalar" as const, name: d.name };
          return { expectedArgs: [asSimpleT], returnT: asSimpleT };
        }),
    ]);
  }

  if (eqQNames(funcName, { name: "avg" })) {
    return unifyOverloadedCall(g, e, funcName, args, argTypes, [
      { expectedArgs: [BuiltinTypes.Integer], returnT: BuiltinTypes.Numeric },
      { expectedArgs: [BuiltinTypes.Smallint], returnT: BuiltinTypes.Numeric },
      { expectedArgs: [BuiltinTypes.Bigint], returnT: BuiltinTypes.Numeric },
      { expectedArgs: [BuiltinTypes.Numeric], returnT: BuiltinTypes.Numeric },
      { expectedArgs: [BuiltinTypes.Real], returnT: BuiltinTypes.Real },
      { expectedArgs: [BuiltinTypes.Double], returnT: BuiltinTypes.Double },
      { expectedArgs: [BuiltinTypes.Float2], returnT: BuiltinTypes.Double },
      { expectedArgs: [BuiltinTypes.Float4], returnT: BuiltinTypes.Double },
      { expectedArgs: [BuiltinTypes.Float8], returnT: BuiltinTypes.Double },
      { expectedArgs: [BuiltinTypes.Money], returnT: BuiltinTypes.Money },
    ]);
  }

  if (eqQNames(funcName, { name: "round" })) {
    return unifyOverloadedCall(g, e, funcName, args, argTypes, [
      { expectedArgs: [BuiltinTypes.Real], returnT: BuiltinTypes.Real },
      { expectedArgs: [BuiltinTypes.Numeric], returnT: BuiltinTypes.Numeric },
      { expectedArgs: [BuiltinTypes.Numeric, BuiltinTypes.Integer], returnT: BuiltinTypes.Numeric },
    ]);
  }

  if (eqQNames(funcName, { name: "least" }) || eqQNames(funcName, { name: "greatest" })) {
    const { unifiedType, types } = unifyAllArgumentsVariadic();
    return types.some(([_, t]) => !isNullable(t)) ? unnullify(unifiedType) : unifiedType;
  }

  if (eqQNames(funcName, { name: "max" }) || eqQNames(funcName, { name: "min" })) {
    return unifyOverloadedCall(g, e, funcName, args, argTypes,
      allNumericBuiltinTypes
        .concat([BuiltinTypes.Date, BuiltinTypes.Time, BuiltinTypes.Timestamp, BuiltinTypes.TimestampTz])
        .flatMap((t) => [{ expectedArgs: [t], returnT: nullify(t) }])
    );
  }

  if (eqQNames(funcName, { name: "to_tsvector" })) {
    return unifyCallGeneralOrThrow(g, e, funcName, args, argTypes, [BuiltinTypes.Text], BuiltinTypes.Tsvector);
  }
  if (eqQNames(funcName, { name: "to_tsquery" })) {
    return unifyCallGeneralOrThrow(g, e, funcName, args, argTypes, [BuiltinTypes.Text], BuiltinTypes.Tsquery);
  }

  if (eqQNames(funcName, { name: "upper" }) || eqQNames(funcName, { name: "lower" })) {
    return unifyCallGeneralOrThrow(g, e, funcName, args, argTypes, [BuiltinTypes.Text], BuiltinTypes.Text);
  }

  if (eqQNames(funcName, { name: "bool_and" }) || eqQNames(funcName, { name: "bool_or" })) {
    return unifyCallGeneralOrThrow(g, e, funcName, args, argTypes, [BuiltinTypes.Boolean], BuiltinTypes.Boolean);
  }

  if (eqQNames(funcName, { name: "count" })) {
    return BuiltinTypes.Bigint;
  }

  // EXTRACT handled as a FuncCall in new parser
  if (eqQNames(funcName, { name: "date_part" }) || eqQNames(funcName, { name: "extract" })) {
    if (args.length >= 2) {
      const fieldT = elabExpr(g, c, args[0]);
      const fromT = elabExpr(g, c, args[1]);
      // Extract the field name for validation
      const fieldName = ("A_Const" in args[0] && args[0].A_Const.sval)
        ? args[0].A_Const.sval.sval?.toLowerCase() : null;
      const timeOnlyFields = ["hour", "minute", "second", "milliseconds", "microseconds", "epoch",
        "timezone", "timezone_hour", "timezone_minute"];
      try {
        castOrThrow(g, args[1], fromT, BuiltinTypes.Timestamp, "implicit");
      } catch {
        try {
          castOrThrow(g, args[1], fromT, BuiltinTypes.Interval, "implicit");
        } catch {
          // Time type only supports time-related fields
          if (fieldName && !timeOnlyFields.includes(fieldName)) {
            throw new TypeMismatch(
              args[1],
              { expected: BuiltinTypes.Timestamp, actual: fromT },
              `Can't extract '${fieldName}' from time type`
            );
          }
          castOrThrow(g, args[1], fromT, BuiltinTypes.Time, "implicit");
        }
      }
      return BuiltinTypes.Numeric;
    }
  }

  // substring / overlay
  if (eqQNames(funcName, { name: "substring" }) || eqQNames(funcName, { name: "overlay" })) {
    const argTs = args.map((a) => elabExpr(g, c, a));
    // Expect (text, int, int) with some args optional
    const expectedArgs = [BuiltinTypes.Text, BuiltinTypes.Integer, BuiltinTypes.Integer].slice(0, argTs.length);
    const res = throwIfError(
      elabAnyCall(g, e, funcName, "STRICT", argTs, expectedArgs)
    );
    return res.nullifyResultType ? nullify(BuiltinTypes.Text) : BuiltinTypes.Text;
  }

  if (
    eqQNames(funcName, { name: "coalesce" }) ||
    eqQNames(funcName, { name: "nullif" })
  ) {
    if (args.length === 0) throw new InvalidArguments(e, funcName, []);
    const { unifiedType, types } = unifyAllArgumentsVariadic();
    if (eqQNames(funcName, { name: "coalesce" })) {
      return types.some(([_arg, t]) => !isNullable(t)) ? unnullify(unifiedType) : unifiedType;
    } else {
      return unifiedType;
    }
  }

  // OVERLAPS is parsed as a FuncCall to pg_catalog.overlaps in the new parser
  if (eqQNames(funcName, { name: "overlaps" })) {
    // OVERLAPS takes 4 args: (start1, end1, start2, end2)
    if (args.length !== 4) throw new InvalidArguments(e, funcName, args.map(a => elabExpr(g, c, a)));
    const t1 = elabExpr(g, c, args[0]);
    const t2 = elabExpr(g, c, args[1]);
    const t3 = elabExpr(g, c, args[2]);
    const t4 = elabExpr(g, c, args[3]);
    const s1 = toSimpleT(t1); if (s1 === null) throw new CantReduceToSimpleT(args[0], t1);
    const s2 = toSimpleT(t2); if (s2 === null) throw new CantReduceToSimpleT(args[1], t2);
    const s3 = toSimpleT(t3); if (s3 === null) throw new CantReduceToSimpleT(args[2], t3);
    const s4 = toSimpleT(t4); if (s4 === null) throw new CantReduceToSimpleT(args[3], t4);
    // Unify left pair and right pair
    const leftT = unifySimplesOrThrow(g, e, s1, s2);
    const rightT = unifySimplesOrThrow(g, e, s3, s4);
    // Both pairs must be compatible
    unifySimplesOrThrow(g, e, leftT, rightT);
    return BuiltinTypes.Boolean;
  }

  throw new UnknownFunction(e, funcName);

  function unifyAllArgumentsVariadic() {
    const types: [Node, SimpleT][] = args
      .map((arg) => [arg, elabExpr(g, c, arg)] as const)
      .map(([arg, t_]) => {
        const t = toSimpleT(t_);
        if (t === null) throw new CantReduceToSimpleT(arg, t_);
        return [arg, t];
      });
    const unifiedType = types.reduce(
      (acc, [arg, t]) => unifySimplesOrThrow(g, arg, acc, t),
      types[0][1]
    );
    return { unifiedType, types };
  }
}

function elabExpr(g: Global, c: Context, e: Node): Type {
  if ("ColumnRef" in e) {
    return elabRef(c, e, e.ColumnRef);
  } else if ("ParamRef" in e) {
    return notImplementedYet(e);
  } else if ("A_Const" in e) {
    const ac = e.A_Const;
    if (ac.ival) return BuiltinTypes.Integer;
    if (ac.boolval) return BuiltinTypes.Boolean;
    if (ac.sval) {
      if ((ac.sval.sval || "").trim() === "{}") {
        return BuiltinTypeConstructors.Array(AnyScalar);
      }
      return BuiltinTypes.Text;
    }
    if (ac.isnull) return BuiltinTypeConstructors.Nullable(AnyScalar);
    if (ac.fval) return BuiltinTypes.Numeric;
    // Fallback for empty A_Const
    return BuiltinTypeConstructors.Nullable(AnyScalar);
  } else if ("BoolExpr" in e) {
    return elabBoolExpr(g, c, e, e.BoolExpr);
  } else if ("NullTest" in e) {
    return elabNullTest(g, c, e, e.NullTest);
  } else if ("A_Expr" in e) {
    return elabAExpr(g, c, e, e.A_Expr);
  } else if ("FuncCall" in e) {
    return elabCall(g, c, e, e.FuncCall);
  } else if ("TypeCast" in e) {
    const tc = e.TypeCast;
    const operandT = elabExpr(g, c, tc.arg!);
    const toT = mkType(g, tc.typeName!, []);
    try {
      castOrThrow(g, e, operandT, toT, "explicit");
    } catch (err) {
      throw new CannotCast(e, { from: operandT, to: toT });
    }
    if (isNullable(operandT)) {
      return toT;
    } else {
      return unnullify(toT);
    }
  } else if ("A_ArrayExpr" in e) {
    const elements = e.A_ArrayExpr.elements || [];
    const typevar = elements.reduce((acc: SimpleT, subexpr: Node) => {
      const t_ = elabExpr(g, c, subexpr);
      const t = toSimpleT(t_);
      if (t === null) {
        throw new CantReduceToSimpleT(e, t_);
      }
      return unifySimplesOrThrow(g, e, t, acc);
    }, AnyScalar);
    return BuiltinTypeConstructors.Array(typevar);
  } else if ("List" in e) {
    // List node (used for IN expressions etc)
    const items = e.List.items || [];
    const typevar = items.reduce((acc: SimpleT, subexpr: Node) => {
      const t_ = elabExpr(g, c, subexpr);
      const t = toSimpleT(t_);
      if (t === null) {
        throw new CantReduceToSimpleT(e, t_);
      }
      return unifySimplesOrThrow(g, e, t, acc);
    }, AnyScalar);
    return BuiltinTypeConstructors.List(typevar);
  } else if ("SubLink" in e) {
    const sl = e.SubLink;
    if (enumEq(sl.subLinkType, SubLinkType, SubLinkType.EXISTS_SUBLINK)) {
      // EXISTS (subquery) -> boolean
      if (sl.subselect && "SelectStmt" in sl.subselect) {
        elabSelect(g, c, sl.subselect.SelectStmt, null);
      }
      return BuiltinTypes.Boolean;
    } else if (enumEq(sl.subLinkType, SubLinkType, SubLinkType.ARRAY_SUBLINK)) {
      // ARRAY(subquery) -> array
      if (!sl.subselect || !("SelectStmt" in sl.subselect)) {
        throw new Error("ARRAY sublink without select");
      }
      const selectType = elabSelect(g, c, sl.subselect.SelectStmt, null);
      if (selectType.kind === "void") {
        throw new KindMismatch(e, selectType, "Select in array select can't return void");
      }
      const t = unifyRecordWithSimple(g, e, selectType, AnyScalar);
      return BuiltinTypeConstructors.Array(t);
    } else if (enumEq(sl.subLinkType, SubLinkType, SubLinkType.EXPR_SUBLINK)) {
      // Scalar subquery
      if (!sl.subselect || !("SelectStmt" in sl.subselect)) {
        throw new Error("EXPR sublink without select");
      }
      const t = elabSelect(g, c, sl.subselect.SelectStmt, null);
      if (t.kind === "void") {
        throw new KindMismatch(e, t, "Select as an expression needs to return something");
      }
      return t;
    } else if (enumEq(sl.subLinkType, SubLinkType, SubLinkType.ANY_SUBLINK)) {
      // ANY/SOME (subquery)
      if (sl.subselect && "SelectStmt" in sl.subselect) {
        elabSelect(g, c, sl.subselect.SelectStmt, null);
      }
      return BuiltinTypes.Boolean;
    } else {
      return notImplementedYet(e);
    }
  } else if ("SetToDefault" in e) {
    return AnyScalar;
  } else if ("SQLValueFunction" in e) {
    const svf = e.SQLValueFunction;
    const opNum = (SQLValueFunctionOp as any)[svf.op as any];
    switch (opNum) {
      case SQLValueFunctionOp.SVFOP_CURRENT_TIME:
      case SQLValueFunctionOp.SVFOP_CURRENT_TIME_N:
        return BuiltinTypes.Time;
      case SQLValueFunctionOp.SVFOP_CURRENT_DATE:
        return BuiltinTypes.Date;
      case SQLValueFunctionOp.SVFOP_LOCALTIMESTAMP:
      case SQLValueFunctionOp.SVFOP_LOCALTIMESTAMP_N:
      case SQLValueFunctionOp.SVFOP_LOCALTIME:
      case SQLValueFunctionOp.SVFOP_LOCALTIME_N:
      case SQLValueFunctionOp.SVFOP_CURRENT_ROLE:
        return BuiltinTypes.Timestamp;
      case SQLValueFunctionOp.SVFOP_CURRENT_TIMESTAMP:
      case SQLValueFunctionOp.SVFOP_CURRENT_TIMESTAMP_N:
        return BuiltinTypes.TimestampTz;
      case SQLValueFunctionOp.SVFOP_CURRENT_CATALOG:
      case SQLValueFunctionOp.SVFOP_CURRENT_SCHEMA:
      case SQLValueFunctionOp.SVFOP_SESSION_USER:
      case SQLValueFunctionOp.SVFOP_USER:
      case SQLValueFunctionOp.SVFOP_CURRENT_USER:
        return BuiltinTypes.Text;
      default:
        return notImplementedYet(e);
    }
  } else if ("A_Indirection" in e) {
    // Array index: arr[i]
    const ai = e.A_Indirection;
    const arrayT = elabExpr(g, c, ai.arg!);
    // Check if indirection contains array subscripts
    const indices = ai.indirection || [];
    if (indices.length > 0 && "A_Indices" in indices[0]) {
      const idx = (indices[0] as any).A_Indices;
      const indexNode = idx.uidx || idx.lidx;
      if (indexNode) {
        const indexT = elabExpr(g, c, indexNode);
        castOrThrow(g, e, indexT, BuiltinTypes.Integer, "implicit");
      }
      const unifiedArrayT_ = unify(g, ai.arg!, arrayT, BuiltinTypeConstructors.Array(AnyScalar));
      const unifiedArrayT = toSimpleT(unifiedArrayT_);
      if (unifiedArrayT === null) {
        throw new CantReduceToSimpleT(ai.arg!, unifiedArrayT_);
      }
      const unnulified = unnullify(unifiedArrayT);
      if (unnulified.kind !== "array") {
        throw new TypeMismatch(
          ai.arg!,
          { expected: arrayT, actual: BuiltinTypeConstructors.Array(AnyScalar) },
          "Can't get array index from non-array type"
        );
      }
      return nullify(unnulified.typevar);
    }
    return notImplementedYet(e);
  } else if ("CaseExpr" in e) {
    const ce = e.CaseExpr;
    const whens = (ce.args || [])
      .filter((n): n is { CaseWhen: import("./pg-ast.ts").CaseWhen } => "CaseWhen" in n)
      .map((n) => n.CaseWhen);

    if (ce.arg) {
      // CASE <value> WHEN ...
      const valueT = elabExpr(g, c, ce.arg);
      const conditionTs: [Node, Type][] = whens.map((w) => [w.expr!, elabExpr(g, c, w.expr!)]);
      conditionTs.reduce(
        (acc, [exp, conditionT]) => unify(g, exp, acc, conditionT),
        valueT
      );
    } else {
      // CASE WHEN <bool> ...
      const conditionTs: [Node, Type][] = whens.map((w) => [w.expr!, elabExpr(g, c, w.expr!)]);
      conditionTs.forEach(([exp, conditionT]) => requireBoolean(exp, conditionT));
    }
    if (whens.length === 0) {
      throw new Error("Not expecting CASE statement without when");
    }
    const whensT = whens.reduce(
      (acc: Type, w) => unify(g, w.result!, acc, elabExpr(g, c, w.result!)),
      elabExpr(g, c, whens[0].result!)
    );
    return ce.defresult ? unify(g, ce.defresult, whensT, elabExpr(g, c, ce.defresult)) : whensT;
  } else if ("SelectStmt" in e) {
    const t = elabSelect(g, c, e.SelectStmt, null);
    if (t.kind === "void") {
      throw new KindMismatch(e, t, "Select as an expression needs to return something");
    }
    return t;
  } else if ("CoalesceExpr" in e) {
    const args = e.CoalesceExpr.args || [];
    if (args.length === 0) {
      throw new InvalidArguments(e, { name: "coalesce" }, []);
    }
    const types: [Node, SimpleT][] = args.map((arg) => {
      const t_ = elabExpr(g, c, arg);
      const t = toSimpleT(t_);
      if (t === null) throw new CantReduceToSimpleT(arg, t_);
      return [arg, t];
    });
    const unifiedType = types.reduce(
      (acc, [arg, t]) => unifySimplesOrThrow(g, arg, acc, t),
      types[0][1]
    );
    if (types.some(([_, t]) => !isNullable(t))) {
      return unnullify(unifiedType);
    }
    return unifiedType;
  } else if ("BooleanTest" in e) {
    const bt = e.BooleanTest;
    if (bt.arg) {
      const t = elabExpr(g, c, bt.arg);
      requireBoolean(bt.arg, t);
    }
    return BuiltinTypes.Boolean;
  } else if ("NullIfExpr" in e) {
    const args = (e.NullIfExpr as any).args || [];
    if (args.length !== 2) throw new Error("NULLIF needs 2 args");
    const t1_ = elabExpr(g, c, args[0]);
    const t2_ = elabExpr(g, c, args[1]);
    const t1 = toSimpleT(t1_);
    const t2 = toSimpleT(t2_);
    if (t1 === null) throw new CantReduceToSimpleT(args[0], t1_);
    if (t2 === null) throw new CantReduceToSimpleT(args[1], t2_);
    unifySimplesOrThrow(g, e, t1, t2);
    return nullify(t1);
  } else if ("MinMaxExpr" in e) {
    const mm = e.MinMaxExpr as any;
    const args: Node[] = mm.args || [];
    if (args.length === 0) throw new Error("GREATEST/LEAST needs at least 1 arg");
    const types: [Node, SimpleT][] = args.map((arg) => {
      const t_ = elabExpr(g, c, arg);
      const t = toSimpleT(t_);
      if (t === null) throw new CantReduceToSimpleT(arg, t_);
      return [arg, t];
    });
    const unifiedType = types.reduce(
      (acc, [arg, t]) => unifySimplesOrThrow(g, arg, acc, t),
      types[0][1]
    );
    // If any arg is NOT nullable, result is not nullable (same as COALESCE)
    if (types.some(([_, t]) => !isNullable(t))) {
      return unnullify(unifiedType);
    }
    return unifiedType;
  } else {
    return notImplementedYet(e);
  }
}

function inferNullability(
  c: Context,
  e: Node
): { fromName: QName; fieldName: string; isNull: boolean }[] {
  if ("BoolExpr" in e) {
    const be = e.BoolExpr;
    if (enumEq(be.boolop, BoolExprType, BoolExprType.NOT_EXPR)) {
      const operand = (be.args || [])[0];
      if (!operand) return [];
      return inferNullability(c, operand).map((judg) => ({
        ...judg,
        isNull: !judg.isNull,
      }));
    }
    if (enumEq(be.boolop, BoolExprType, BoolExprType.AND_EXPR)) {
      const args = be.args || [];
      return args.flatMap((arg) => inferNullability(c, arg));
    }
    return [];
  }
  if ("NullTest" in e) {
    const nt = e.NullTest;
    const arg = nt.arg;
    if (arg && "ColumnRef" in arg) {
      const info = getColumnRef(arg.ColumnRef);
      if (info.column === "*") return [];
      const found = lookupRef(c, arg, info);
      if (found instanceof ErrorWithLocation) return [];
      if (found.from === null) return [];
      return [
        { ...found.from, isNull: enumEq(nt.nulltesttype, NullTestType, NullTestType.IS_NULL) },
      ];
    }
    return [];
  }
  return [];
}

// Dispatch a Node (the stmt field of a RawStmt) to the right elab function
function elabStatementNode(g: Global, c: Context, stmtNode: Node): VoidT | Type {
  if ("SelectStmt" in stmtNode) {
    return elabExpr(g, c, stmtNode);
  } else if ("InsertStmt" in stmtNode) {
    return elabInsert(g, c, stmtNode.InsertStmt);
  } else if ("DeleteStmt" in stmtNode) {
    return elabDelete(g, c, stmtNode.DeleteStmt);
  } else if ("UpdateStmt" in stmtNode) {
    return elabUpdate(g, c, stmtNode.UpdateStmt);
  } else {
    return notImplementedYet(stmtNode);
  }
}

export function parseSetupScripts(g: Global, ast: import("./pg-ast.ts").RawStmt[]): Global {
  return ast.reduce((acc: Global, rawStmt): Global => {
    const stmtNode = rawStmt.stmt;
    if (!stmtNode) return acc;

    if ("CreateStmt" in stmtNode) {
      const cs = stmtNode.CreateStmt;
      // Skip temporary tables
      if (cs.relation?.relpersistence === "t") return acc;
      return doCreateTable(acc, cs);
    } else if ("ViewStmt" in stmtNode) {
      return doCreateView(acc, stmtNode.ViewStmt);
    } else if ("CreateTableAsStmt" in stmtNode) {
      return doCreateMaterializedView(acc, stmtNode.CreateTableAsStmt);
    } else if ("AlterTableStmt" in stmtNode) {
      return doAlterTable(acc, stmtNode.AlterTableStmt);
    } else if ("CreateDomainStmt" in stmtNode) {
      const ds = stmtNode.CreateDomainStmt;
      const domName = getQNameFromNodes(ds.domainname || []);
      return {
        ...acc,
        domains: acc.domains.concat({
          name: domName,
          realtype: mkType(acc, ds.typeName!, [{ contype: ConstrType.CONSTR_NOTNULL } as unknown as Constraint]),
        }),
      };
    } else if ("CreateEnumStmt" in stmtNode) {
      const es = stmtNode.CreateEnumStmt;
      const enumName = getQNameFromNodes(es.typeName || []);
      return {
        ...acc,
        enums: acc.enums.concat({
          name: enumName,
          values: (es.vals || []).map((v) => {
            if ("String" in v) return v.String.sval || "";
            return "";
          }),
        }),
      };
    } else {
      return acc;
    }
  }, g);
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

function nullifyArray(s: ArrayT<SimpleT>): ArrayT<SimpleT> {
  if (s.typevar.kind === "nullable") {
    return s;
  } else {
    return {
      kind: s.kind,
      subtype: s.subtype,
      typevar: nullify(s.typevar),
    };
  }
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

export function checkAllCasesHandled(r: never): any {
  throw new Error(`Oops didn't expect that, ${JSON.stringify(r)}`);
}

export function showQName(n: QName): string {
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

function makeBuiltinBinaryOperatorsForNumericDomain(t: ScalarT): binaryOp[] {
  const comparisons: binaryOp[] = ["<", "<=", ">", ">="].map((op) => ({
    name: { schema: "pg_catalog", name: op },
    left: t,
    right: t,
    result: { kind: "scalar", name: { name: "boolean" } },
  }));
  const monads: binaryOp[] = ["+", "-", "*", "/", "%"].map((op) => ({
    name: { schema: "pg_catalog", name: op },
    left: t,
    right: t,
    result: t,
  }));
  return comparisons.concat(monads);
}

function throwIfError<T>(t: T | ErrorWithLocation): T {
  if (t instanceof ErrorWithLocation) {
    throw t;
  }
  return t;
}
