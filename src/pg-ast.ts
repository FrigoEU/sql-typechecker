import { parseSync, loadModule, type ParseResult } from "libpg-query";
import type {
  Node,
  RawStmt,
  TypeName,
  SelectStmt,
  A_Expr,
  FuncCall,
  ColumnRef,
  A_Const,
  RangeVar,
  Alias,
  FunctionParameter,
  CreateFunctionStmt,
  InsertStmt,
  UpdateStmt,
  DeleteStmt,
  CreateStmt,
  ViewStmt,
  AlterTableStmt,
  CreateDomainStmt,
  CreateEnumStmt,
  CreateTableAsStmt,
  ResTarget,
  RangeSubselect,
  RangeFunction,
  JoinExpr,
  BoolExpr,
  NullTest,
  TypeCast,
  CaseExpr,
  CaseWhen,
  A_ArrayExpr,
  A_Indirection,
  SubLink,
  SQLValueFunction,
  SetToDefault,
  ParamRef,
  Constraint,
  ColumnDef,
  WithClause,
  CommonTableExpr,
  DefElem,
  BooleanTest,
  A_Star,
} from "@pgsql/types";

export type {
  Node,
  RawStmt,
  TypeName,
  SelectStmt,
  A_Expr,
  FuncCall,
  ColumnRef,
  A_Const,
  RangeVar,
  Alias,
  FunctionParameter,
  CreateFunctionStmt,
  InsertStmt,
  UpdateStmt,
  DeleteStmt,
  CreateStmt,
  ViewStmt,
  AlterTableStmt,
  CreateDomainStmt,
  CreateEnumStmt,
  CreateTableAsStmt,
  ResTarget,
  RangeSubselect,
  RangeFunction,
  JoinExpr,
  BoolExpr,
  NullTest,
  TypeCast,
  CaseExpr,
  CaseWhen,
  A_ArrayExpr,
  A_Indirection,
  SubLink,
  SQLValueFunction,
  SetToDefault,
  ParamRef,
  Constraint,
  ColumnDef,
  WithClause,
  CommonTableExpr,
  DefElem,
  BooleanTest,
  A_Star,
  ParseResult,
};

export {
  A_Expr_Kind,
  BoolExprType,
  SetOperation,
  JoinType,
  SubLinkType,
  NullTestType,
  SQLValueFunctionOp,
  BoolTestType,
  ConstrType,
  ObjectType,
  AlterTableType,
  FunctionParameterMode,
} from "@pgsql/enums";

export { loadModule };

// Internal Name and QName types (replacing trader-pgsql-ast-parser's types)
export type Name = { name: string; _location?: number };
export type QName = { name: string; schema?: string; _location?: number };

// Compare protobuf enum values (returned as strings like "SETOP_NONE")
// against TypeScript numeric enums from @pgsql/enums.
// The reverse-mapped enum allows: SetOperation["SETOP_NONE"] === 0
export function enumEq<E extends Record<string | number, string | number>>(
  value: string | number | undefined,
  enumObj: E,
  enumValue: E[keyof E],
): boolean {
  if (value === undefined) return false;
  // If value is already numeric, compare directly
  if (typeof value === "number") return value === enumValue;
  // value is a string like "SETOP_NONE"; look up its numeric value in the enum
  return (enumObj as any)[value] === enumValue;
}

// Parse SQL string and return array of RawStmt
export function parseStatements(sql: string): RawStmt[] {
  const result = parseSync(sql) as ParseResult;
  return result.stmts || [];
}

// Unwrap a Node to get the type key and inner data
export function unwrapNode(n: Node): [string, any] {
  const keys = Object.keys(n);
  if (keys.length === 0) {
    throw new Error("Empty node");
  }
  return [keys[0], (n as any)[keys[0]]];
}

// Extract column/table info from ColumnRef fields
export function getColumnRef(node: ColumnRef): {
  table?: string;
  column: string;
} {
  const fields = node.fields || [];
  if (fields.length === 1) {
    const f = fields[0];
    if ("String" in f) {
      return { column: f.String.sval || "" };
    }
    if ("A_Star" in f) {
      return { column: "*" };
    }
  }
  if (fields.length === 2) {
    const t = fields[0];
    const c = fields[1];
    const table = "String" in t ? t.String.sval || "" : undefined;
    if ("String" in c) {
      return { table, column: c.String.sval || "" };
    }
    if ("A_Star" in c) {
      return { table, column: "*" };
    }
  }
  // More than 2 parts (schema.table.column) — take last two
  if (fields.length >= 2) {
    const t = fields[fields.length - 2];
    const c = fields[fields.length - 1];
    const table = "String" in t ? t.String.sval || "" : undefined;
    if ("String" in c) {
      return { table, column: c.String.sval || "" };
    }
    if ("A_Star" in c) {
      return { table, column: "*" };
    }
  }
  throw new Error(`Cannot extract column ref from fields: ${JSON.stringify(fields)}`);
}

// Extract type name from TypeName node
export function getTypeName(tn: TypeName): {
  name: string;
  schema?: string;
  isArray: boolean;
} {
  const names = tn.names || [];
  const arrayBounds = tn.arrayBounds || [];
  const isArray = arrayBounds.length > 0;

  // names is a list of String nodes, typically ["pg_catalog", "int4"] or just ["text"]
  let schema: string | undefined;
  let name: string = "";

  const stringNames: string[] = [];
  for (const n of names) {
    if ("String" in n) {
      stringNames.push(n.String.sval || "");
    }
  }

  if (stringNames.length === 1) {
    name = stringNames[0];
  } else if (stringNames.length >= 2) {
    // First is usually "pg_catalog" for builtin types
    schema = stringNames[0];
    name = stringNames[stringNames.length - 1];
  }

  return { name, schema, isArray };
}

// Extract QName from a list of String nodes (used for function names, enum names, etc.)
export function getQNameFromNodes(nodes: Node[]): QName {
  const stringNames: string[] = [];
  for (const n of nodes) {
    if ("String" in n) {
      stringNames.push(n.String.sval || "");
    }
  }
  if (stringNames.length === 1) {
    return { name: stringNames[0] };
  } else if (stringNames.length >= 2) {
    return { schema: stringNames[0], name: stringNames[stringNames.length - 1] };
  }
  throw new Error(`Cannot extract QName from nodes: ${JSON.stringify(nodes)}`);
}

// Extract operator name from A_Expr.name (list of String nodes)
export function getOperatorName(nodes: Node[]): string {
  for (const n of nodes) {
    if ("String" in n) {
      return n.String.sval || "";
    }
  }
  return "";
}

// Extract operator schema from A_Expr.name if present
export function getOperatorSchema(nodes: Node[]): string | undefined {
  const strings: string[] = [];
  for (const n of nodes) {
    if ("String" in n) {
      strings.push(n.String.sval || "");
    }
  }
  if (strings.length >= 2) {
    return strings[0];
  }
  return undefined;
}

// Convert RangeVar to QName
export function rangeVarToQName(rv: RangeVar): QName {
  return {
    name: rv.relname || "",
    schema: rv.schemaname,
    _location: rv.location,
  };
}

// Convert RangeVar alias to a name string
export function rangeVarAlias(rv: RangeVar): string | undefined {
  return rv.alias?.aliasname;
}

// Get string value from a Node that wraps a String
export function getStringValue(n: Node): string | undefined {
  if ("String" in n) {
    return n.String.sval;
  }
  return undefined;
}

// Get location from any node that has a location field
export function nodeLocation(node: any): number | undefined {
  if (node && typeof node === "object" && "location" in node) {
    return node.location;
  }
  return undefined;
}

// Create a fake NodeLocation-like object from a number offset (for backward compat)
export function mkLocation(offset: number | undefined): number | undefined {
  return offset;
}

// Check if a node is a specific type
export function isNodeType<K extends string>(
  node: Node,
  key: K
): node is Node & Record<K, any> {
  return key in node;
}

// Extract function body and language from CreateFunctionStmt options
export function extractFunctionOptions(s: CreateFunctionStmt): {
  language?: string;
  code?: string;
} {
  let language: string | undefined;
  let code: string | undefined;

  for (const opt of s.options || []) {
    if ("DefElem" in opt) {
      const defelem = opt.DefElem;
      if (defelem.defname === "language") {
        if (defelem.arg && "String" in defelem.arg) {
          language = defelem.arg.String.sval;
        }
      } else if (defelem.defname === "as") {
        if (defelem.arg && "List" in defelem.arg) {
          const items = defelem.arg.List.items || [];
          if (items.length > 0 && "String" in items[0]) {
            code = items[0].String.sval;
          }
        }
      }
    }
  }

  return { language, code };
}

// Format a Node to SQL string for error messages
export function nodeToSql(node: Node): string {
  // Lightweight fallback — we just JSON.stringify for error messages
  // The old code used toSql.expr() which was also just for error context
  try {
    // Try to extract something meaningful
    if ("ColumnRef" in node) {
      const ref = getColumnRef(node.ColumnRef);
      return ref.table ? `${ref.table}.${ref.column}` : ref.column;
    }
    if ("A_Const" in node) {
      const c = node.A_Const;
      if (c.ival) return String(c.ival.ival || 0);
      if (c.sval) return `'${c.sval.sval || ""}'`;
      if (c.fval) return c.fval.fval || "0";
      if (c.boolval) return String(c.boolval.boolval);
      if (c.isnull) return "NULL";
    }
    if ("FuncCall" in node) {
      const fc = node.FuncCall;
      const name = getQNameFromNodes(fc.funcname || []);
      return `${name.schema ? name.schema + "." : ""}${name.name}(...)`;
    }
    return JSON.stringify(node).slice(0, 200);
  } catch {
    return "<expr>";
  }
}
