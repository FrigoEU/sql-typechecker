import { unaryOp } from "./typecheck";

const builtinunaryoperatorsFromSyntax: unaryOp[] = [
  // {
  //   name: { name: "IS NULL" },
  //   operand: { kind: "nullable", typevar: { kind: "anyscalar" } },
  //   result: { kind: "scalar", name: { name: "boolean" } },
  //   description: "is NULL check",
  // },
];

const builtinunaryoperatorsFromSchema: unaryOp[] = [
  {
    name: { name: "!" },
    operand: { kind: "scalar", name: { name: "bigint" } },
    result: { kind: "scalar", name: { name: "numeric" } },
    description: "factorial",
  },
  {
    name: { name: "!!" },
    operand: { kind: "scalar", name: { name: "bigint" } },
    result: { kind: "scalar", name: { name: "numeric" } },
    description: "deprecated, use ! instead",
  },
  {
    name: { name: "!!" },
    operand: { kind: "scalar", name: { name: "tsquery" } },
    result: { kind: "scalar", name: { name: "tsquery" } },
    description: "NOT tsquery",
  },
  {
    name: { name: "#" },
    operand: { kind: "scalar", name: { name: "path" } },
    result: { kind: "scalar", name: { name: "integer" } },
    description: "number of points",
  },
  {
    name: { name: "#" },
    operand: { kind: "scalar", name: { name: "polygon" } },
    result: { kind: "scalar", name: { name: "integer" } },
    description: "number of points",
  },

  {
    name: { name: "+" },
    operand: { kind: "scalar", name: { name: "bigint" } },
    result: { kind: "scalar", name: { name: "bigint" } },
    description: "unary plus",
  },
  {
    name: { name: "+" },
    operand: { kind: "scalar", name: { name: "double precision" } },
    result: { kind: "scalar", name: { name: "double precision" } },
    description: "unary plus",
  },
  {
    name: { name: "+" },
    operand: { kind: "scalar", name: { name: "integer" } },
    result: { kind: "scalar", name: { name: "integer" } },
    description: "unary plus",
  },
  {
    name: { name: "+" },
    operand: { kind: "scalar", name: { name: "numeric" } },
    result: { kind: "scalar", name: { name: "numeric" } },
    description: "unary plus",
  },
  {
    name: { name: "+" },
    operand: { kind: "scalar", name: { name: "real" } },
    result: { kind: "scalar", name: { name: "real" } },
    description: "unary plus",
  },
  {
    name: { name: "+" },
    operand: { kind: "scalar", name: { name: "smallint" } },
    result: { kind: "scalar", name: { name: "smallint" } },
    description: "unary plus",
  },

  {
    name: { name: "-" },
    operand: { kind: "scalar", name: { name: "bigint" } },
    result: { kind: "scalar", name: { name: "bigint" } },
    description: "negate",
  },
  {
    name: { name: "-" },
    operand: { kind: "scalar", name: { name: "double precision" } },
    result: { kind: "scalar", name: { name: "double precision" } },
    description: "negate",
  },
  {
    name: { name: "-" },
    operand: { kind: "scalar", name: { name: "integer" } },
    result: { kind: "scalar", name: { name: "integer" } },
    description: "negate",
  },
  {
    name: { name: "-" },
    operand: { kind: "scalar", name: { name: "interval" } },
    result: { kind: "scalar", name: { name: "interval" } },
    description: "negate",
  },
  {
    name: { name: "-" },
    operand: { kind: "scalar", name: { name: "numeric" } },
    result: { kind: "scalar", name: { name: "numeric" } },
    description: "negate",
  },
  {
    name: { name: "-" },
    operand: { kind: "scalar", name: { name: "real" } },
    result: { kind: "scalar", name: { name: "real" } },
    description: "negate",
  },
  {
    name: { name: "-" },
    operand: { kind: "scalar", name: { name: "smallint" } },
    result: { kind: "scalar", name: { name: "smallint" } },
    description: "negate",
  },

  {
    name: { name: "?-" },
    operand: { kind: "scalar", name: { name: "line" } },
    result: { kind: "scalar", name: { name: "boolean" } },
    description: "horizontal",
  },
  {
    name: { name: "?-" },
    operand: { kind: "scalar", name: { name: "lseg" } },
    result: { kind: "scalar", name: { name: "boolean" } },
    description: "horizontal",
  },

  {
    name: { name: "?|" },
    operand: { kind: "scalar", name: { name: "line" } },
    result: { kind: "scalar", name: { name: "boolean" } },
    description: "vertical",
  },
  {
    name: { name: "?|" },
    operand: { kind: "scalar", name: { name: "lseg" } },
    result: { kind: "scalar", name: { name: "boolean" } },
    description: "vertical",
  },

  {
    name: { name: "@" },
    operand: { kind: "scalar", name: { name: "bigint" } },
    result: { kind: "scalar", name: { name: "bigint" } },
    description: "absolute value",
  },
  {
    name: { name: "@" },
    operand: { kind: "scalar", name: { name: "double precision" } },
    result: { kind: "scalar", name: { name: "double precision" } },
    description: "absolute value",
  },
  {
    name: { name: "@" },
    operand: { kind: "scalar", name: { name: "integer" } },
    result: { kind: "scalar", name: { name: "integer" } },
    description: "absolute value",
  },
  {
    name: { name: "@" },
    operand: { kind: "scalar", name: { name: "numeric" } },
    result: { kind: "scalar", name: { name: "numeric" } },
    description: "absolute value",
  },
  {
    name: { name: "@" },
    operand: { kind: "scalar", name: { name: "real" } },
    result: { kind: "scalar", name: { name: "real" } },
    description: "absolute value",
  },
  {
    name: { name: "@" },
    operand: { kind: "scalar", name: { name: "smallint" } },
    result: { kind: "scalar", name: { name: "smallint" } },
    description: "absolute value",
  },
  {
    name: { name: "@-@" },
    operand: { kind: "scalar", name: { name: "lseg" } },
    result: { kind: "scalar", name: { name: "double precision" } },
    description: "distance between endpoints",
  },
  {
    name: { name: "@-@" },
    operand: { kind: "scalar", name: { name: "path" } },
    result: { kind: "scalar", name: { name: "double precision" } },
    description: "sum of path segment lengths",
  },

  {
    name: { name: "@@" },
    operand: { kind: "scalar", name: { name: "box" } },
    result: { kind: "scalar", name: { name: "point" } },
    description: "center of",
  },
  {
    name: { name: "@@" },
    operand: { kind: "scalar", name: { name: "circle" } },
    result: { kind: "scalar", name: { name: "point" } },
    description: "center of",
  },
  {
    name: { name: "@@" },
    operand: { kind: "scalar", name: { name: "lseg" } },
    result: { kind: "scalar", name: { name: "point" } },
    description: "center of",
  },
  {
    name: { name: "@@" },
    operand: { kind: "scalar", name: { name: "path" } },
    result: { kind: "scalar", name: { name: "point" } },
    description: "center of",
  },
  {
    name: { name: "@@" },
    operand: { kind: "scalar", name: { name: "polygon" } },
    result: { kind: "scalar", name: { name: "point" } },
    description: "center of",
  },

  {
    name: { name: "|" },
    operand: { kind: "scalar", name: { name: "tinterval" } },
    result: { kind: "scalar", name: { name: "abstime" } },
    description: "start of interval",
  },

  {
    name: { name: "|/" },
    operand: { kind: "scalar", name: { name: "double precision" } },
    result: { kind: "scalar", name: { name: "double precision" } },
    description: "square root",
  },

  {
    name: { name: "||/" },
    operand: { kind: "scalar", name: { name: "double precision" } },
    result: { kind: "scalar", name: { name: "double precision" } },
    description: "cube root",
  },

  {
    name: { name: "~" },
    operand: { kind: "scalar", name: { name: "bigint" } },
    result: { kind: "scalar", name: { name: "bigint" } },
    description: "bitwise not",
  },
  {
    name: { name: "~" },
    operand: { kind: "scalar", name: { name: "bit" } },
    result: { kind: "scalar", name: { name: "bit" } },
    description: "bitwise not",
  },
  {
    name: { name: "~" },
    operand: { kind: "scalar", name: { name: "inet" } },
    result: { kind: "scalar", name: { name: "inet" } },
    description: "bitwise not",
  },
  {
    name: { name: "~" },
    operand: { kind: "scalar", name: { name: "integer" } },
    result: { kind: "scalar", name: { name: "integer" } },
    description: "bitwise not",
  },
  {
    name: { name: "~" },
    operand: { kind: "scalar", name: { name: "macaddr" } },
    result: { kind: "scalar", name: { name: "macaddr" } },
    description: "bitwise not",
  },
  {
    name: { name: "~" },
    operand: { kind: "scalar", name: { name: "smallint" } },
    result: { kind: "scalar", name: { name: "smallint" } },
    description: "bitwise not",
  },
];

export const builtinUnaryOperators = builtinunaryoperatorsFromSyntax.concat(
  builtinunaryoperatorsFromSchema
);
