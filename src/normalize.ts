import { BinaryOperator } from "trader-pgsql-ast-parser";

export function normalizeTypeName(s: string): string {
  if (s === "int8" || s === "bigserial") {
    return "bigint";
  }
  if (s === "int" || s === "int4" || s === "serial") {
    return "integer";
  }
  if (s === "int2" || s === "smallserial") {
    return "smallint";
  }
  if (s === "decimal") {
    return "numeric";
  }
  if (s === "bool") {
    return "boolean";
  }
  if (s === "float4") {
    return "real";
  }
  if (s === "float" || s === "float8" || s === "double") {
    return "double precision";
  }
  return s;
}

export function normalizeOperatorName(s: BinaryOperator): string {
  if (s === "!=") {
    return "<>";
  }
  if (s === "LIKE") {
    return "~~";
  }
  if (s === "ILIKE") {
    return "~~*";
  }
  return s;
}
