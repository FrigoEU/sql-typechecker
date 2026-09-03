import { createHash } from "node:crypto";
import { type Name, type QName } from "./pg-ast.ts";
import {
  checkAllCasesHandled,
  showQName,
  type JsonKnownT,
  type RecordT,
  type SimpleT,
  type Type,
  type VoidT,
  type functionType,
} from "./typecheck.ts";

export function showTypeAsTypescriptType(t: Type): string {
  if (t.kind === "record") {
    return (
      "{" +
      t.fields
        .map(
          (f) =>
            (f.name === null ? `"?": ` : `"${f.name.name}": `) +
            showTypeAsTypescriptType(f.type),
        )
        .join(", ") +
      "}"
    );
  } else {
    if (t.kind === "array") {
      return "(" + showTypeAsTypescriptType(t.typevar) + ")" + "[]";
    } else if (t.kind === "nullable") {
      return showTypeAsTypescriptType(t.typevar) + " | null";
    } else if (t.kind === "scalar") {
      if (t.domain) {
        return `types.${t.name.name}`;
      } else if (
        [
          "numeric",
          "bigint",
          "smallint",
          "integer",
          "real",
          "double precision",
          "float8",
          "float4",
          "float2",
        ].includes(t.name.name)
      ) {
        return "number";
      } else if (
        ["text", "name", "char", "character", "varchar", "nvarchar"].includes(
          t.name.name,
        )
      ) {
        return "string";
      } else if (["bytea"].includes(t.name.name)) {
        return "Buffer";
      } else if (t.name.name === "jsonb") {
        return "any";
      } else if (t.name.name === "date") {
        return "LocalDate";
      } else if (t.name.name === "time") {
        return "LocalTime";
      } else if (t.name.name === "timestamp without time zone") {
        return "LocalDateTime";
      } else if (t.name.name === "timestamp with time zone") {
        return "Instant";
      } else if (t.name.name === "interval") {
        return "Duration";
      } else if (t.name.name === "money") {
        return "currency";
      } else if (t.name.name === "tsmultirange") {
        return "{start: LocalDateTime, end: LocalDateTime, bounds: string}[]";
      } else if (t.isEnum) {
        return "types." + t.name.name;
      } else {
        return t.name.name;
      }
    } else if (t.kind === "jsonknown") {
      return (
        "{\n" +
        t.record.fields
          .map((f) => `  ${f.name?.name}: ${showTypeAsTypescriptType(f.type)}`)
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

function genDeserializeSimpleT(t: SimpleT, literalVar: string): string {
  if (t.kind === "array") {
    return `(Array.isArray(${literalVar}) ? ${literalVar} : parseArray(${literalVar})).map((el: any) => ${genDeserializeSimpleT(
      t.typevar as SimpleT,
      "el",
    )})`;
  } else if (t.kind === "nullable") {
    const inner = genDeserializeSimpleT(t.typevar as SimpleT, literalVar);
    if (inner === literalVar) {
      return inner;
    } else {
      return `${literalVar} === null ? null :  (${inner})`;
    }
  } else if (t.kind === "anyscalar") {
    return literalVar;
  } else if (t.kind === "jsonknown") {
    return (
      "({" +
      t.record.fields
        .map(
          (f) =>
            `${f.name?.name || "?"}: ${genDeserializeSimpleT(
              f.type,
              literalVar + '["' + f.name?.name + '"]',
            )}`,
        )
        .join(",\n") +
      "})"
    );
  } else if (t.kind === "scalar") {
    if (t.domain) {
      return `${genDeserializeSimpleT(t.domain.realtype, literalVar)} as types.${t.name.name}`;
    }
    if (t.name.name === "date") {
      return `LocalDate.parse(${literalVar})`;
    } else if (t.name.name === "time") {
      return `LocalTime.parse(${literalVar})`;
    } else if (t.name.name === "timestamp with time zone") {
      return `ZonedDateTime.parse(${literalVar}.trim().replace(/([\\+\\-]\\d\\d)$/, (_:string, cap:string) => cap + ":00").replace(" ", "T")).toInstant()`;
    } else if (t.name.name === "timestamp without time zone") {
      return `LocalDateTime.parse(${literalVar}.replace(" ", "T"))`;
    } else if (t.name.name === "interval") {
      return `Duration.todo(${literalVar})`;
    } else if (t.name.name === "jsonb" || t.name.name === "json") {
      return literalVar;
    } else if (t.name.name === "money") {
      return `currency(${literalVar})`;
    } else if (t.name.name === "tsmultirange") {
      return `parseTsmultirange(${literalVar})`;
    } else if (
      t.name.name === "bigint" ||
      t.name.name === "smallint" ||
      t.name.name.startsWith("int")
    ) {
      return `parseInt(${literalVar})`;
    } else {
      return literalVar;
    }
  } else {
    return checkAllCasesHandled(t);
  }
}

function genFunctionResDeserialization(
  returnType: SimpleT | RecordT | VoidT,
  literalVar: string,
) {
  if (returnType.kind === "void") {
    return literalVar;
  } else if (returnType.kind === "record") {
    return (
      "({" +
      returnType.fields
        .map(
          (f, i) =>
            `"${f.name?.name || "?"}": ${genDeserializeSimpleT(
              f.type,
              literalVar + "[" + i + "]",
            )}`,
        )
        .join(",\n") +
      "})"
    );
  } else {
    return genDeserializeSimpleT(returnType, literalVar + "[0]");
  }
}

function showTypeDroppingNullable(t: SimpleT | JsonKnownT): string {
  if (t.kind === "nullable") {
    return showTypeDroppingNullable(t.typevar);
  } else if (t.kind === "array") {
    return showTypeDroppingNullable(t.typevar) + "[]";
  } else if (t.kind === "anyscalar") {
    return "anyscalar";
  } else if (t.kind === "scalar") {
    return t.name.name;
  } else if (t.kind === "jsonknown") {
    return "json";
  } else {
    return "";
  }
}

// Explicit `::type` casts on every $n placeholder — Postgres can't always infer
// a parameter's type from context alone
function addParamCasts(sql: string, inputs: { type: SimpleT }[]): string {
  const castByIndex = inputs.map((inp) => showTypeDroppingNullable(inp.type));
  return sql.replace(/\$(\d+)/g, (whole, n) => {
    const cast = castByIndex[Number(n) - 1];
    return cast ? `$${n}::${cast}` : whole;
  });
}

// Render `s` as a template literal instead of a JSON-escaped string, so a
// multi-line SQL query keeps its real line breaks in the generated file
// instead of collapsing onto one line full of "\n" escapes.
function toTemplateLiteral(s: string): string {
  const escaped = s
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
  return "`" + escaped + "`";
}

// A stable name for `pg`'s named-prepared-statement support: with no `name`,
// `pool.query` sends every call as an unnamed statement, which Postgres always
// re-plans from scratch. Naming it lets `pg` prepare it once per physical
// connection and reuse it after that, so pooled connections benefit the same
// way a stored function's cached per-session plan used to. The name is derived
// from the final query text (not just the function name), so if the query ever
// changes, the name changes with it — a stale connection can't accidentally
// reuse an old plan for what is now different SQL under the same name.
function preparedStatementName(functionName: string, finalSql: string): string {
  const hash = createHash("sha1").update(finalSql).digest("hex").slice(0, 10);
  return `${functionName}_${hash}`;
}

// Generated when a function's body isn't inlineable (LANGUAGE other than sql,
// or a body sql-typechecker can't reduce to a single parameterized statement):
// a caller that's guaranteed to fail `tsc`. Don't want to remove plpgsql support now,
// but don't want to accidentally rely on a plpgsql function not being there.
function genUncallableFunctionStub(
  f: functionType,
  returnTypeAsString: string,
  argsType: string,
): string {
  const reason =
    f.language.toLowerCase() === "sql"
      ? "its body isn't exactly one statement (empty, or more than one), which sql-typechecker's inlining codegen doesn't support"
      : `it is LANGUAGE ${f.language}, and sql-typechecker only inlines LANGUAGE sql functions`;
  const message = `sql-typechecker: no caller generated for "${f.name.name}" because ${reason}. It still exists in the database — write this call by hand.`;
  return `
export async function ${f.name.name}(pool: Pool, args: ${argsType})
  : Promise<${returnTypeAsString}>{
  return ${JSON.stringify(message)};
  }
`;
}

export function functionToTypescript(f: functionType): string {
  const returnTypeAsString =
    f.returns.kind === "void"
      ? "void"
      : showTypeAsTypescriptType(f.returns) +
        (f.multipleRows ? "[]" : " | null");

  const argsType =
    "{" +
    f.inputs
      .map((k) => {
        const paramTypeAsString = showTypeAsTypescriptType(k.type);

        // console.log(`Param \$${k.name.name}:\n`, paramTypeAsString, "\n");
        return k.name.name + ": " + paramTypeAsString;
      })
      .join(", ") +
    "}";

  if (f.inlinedSql === null) {
    return genUncallableFunctionStub(f, returnTypeAsString, argsType);
  }

  const argsAsList = f.inputs.map((i) => "args." + i.name.name).join(", ");
  const finalSql = addParamCasts(f.inlinedSql, f.inputs);

  const deserializationAndReturn =
    f.returns.kind === "void"
      ? ""
      : f.multipleRows === true
        ? `return res.rows.map(row => ${genFunctionResDeserialization(f.returns, "row")});`
        : `
const row = res.rows[0];
if (row && row.some(f => f !== null)){
  return ${genFunctionResDeserialization(f.returns, "row")}
} else {
  return null;
}`;
  return `
export async function ${f.name.name}(pool: Pool, args: ${argsType})
  : Promise<${returnTypeAsString}>{

  const res = await pool.query({
    name: ${JSON.stringify(preparedStatementName(f.name.name, finalSql))},
    text: ${toTemplateLiteral(finalSql)},
    values: [${argsAsList}],
    rowMode: "array",
  }).catch(err => {
    if (err && "message" in err){
      err.message =
        "While running SQL function ${f.name.name}: \\n" +
        "Args: " +
        JSON.stringify(args) +
        "\\n" +
        err.message;
    }
    throw err;
  });
  ${deserializationAndReturn}
  }
`;
}

export function genDomain(dom: {
  readonly name: QName;
  readonly realtype: SimpleT;
}): string {
  return `export type ${dom.name.name} = ${showTypeAsTypescriptType(
    dom.realtype,
  )} & { readonly __tag: "${dom.name.name}" };`;
}

export function genEnum(enu: {
  readonly name: QName;
  readonly values: string[];
}): string {
  return `export type ${enu.name.name} =
  | ${enu.values.map((v) => `"${v}"`).join("\n  | ")};
`;
}

export function getImports() {
  return `
import type { Pool } from "pg";
import { ZonedDateTime, Instant, LocalDate, LocalTime, LocalDateTime, Duration} from "@js-joda/core";
import {parse as parseArray} from "postgres-array";
import currency from "currency.js";
import {parseTsmultirange} from "sql-typechecker";
`;
}

function genSelectColumnsFromTable(t: RecordT) {
  return t.fields.map((f) => f.name?.name || "?").join(", ");
}

export function genCrudOperations(table: {
  readonly name: QName;
  readonly rel: RecordT;
  readonly primaryKey: Name[];
  readonly defaults: Name[];
}): string {
  const selectAll = `
export async function getAll(pool: Pool): Promise<${showTypeAsTypescriptType(table.rel)}[]>{

const res = await pool.query({
text: "SELECT ${genSelectColumnsFromTable(table.rel)} FROM ${showQName(table.name)}",
values: [],
rowMode: "array",
});
const rows = res.rows.map(row => ${genFunctionResDeserialization(table.rel, "row")});
return rows;
}`;

  const primaryKeySingleCol: null | {
    name: Name;
    type: SimpleT;
  } = (function getPrimaryKey() {
    if (table.primaryKey.length === 1) {
      return {
        name: table.primaryKey[0],
        type: table.rel.fields.find(
          (f) => f.name?.name === table.primaryKey[0].name,
        )?.type!,
      };
    } else {
      return null;
    }
  })();

  if (!primaryKeySingleCol) {
    return selectAll;
  } else {
    const relWithoutPrim = table.rel.fields.filter(
      (f) => f.name?.name !== primaryKeySingleCol.name.name,
    );
    const mandatoryFields = table.rel.fields.filter(
      (c) => !table.defaults.some((def) => def.name === c.name?.name),
    );
    const optionalFields = table.rel.fields.filter((c) =>
      table.defaults.some((def) => def.name === c.name?.name),
    );
    const inputRow =
      mandatoryFields
        .map(
          (f) => `
${f.name?.name}: ${showTypeAsTypescriptType(f.type)}`,
        )
        .join(",") +
      optionalFields
        .map(
          (f) => `
${f.name?.name}?: ${showTypeAsTypescriptType(f.type)}`,
        )
        .join(",");

    const allowedFieldNames = `const allowedFieldNames = [${mandatoryFields
      .concat(optionalFields)
      .map((m) => '"' + m.name?.name + '"')
      .join(",")}];`;

    const insert = `
export async function insert(pool: Pool, row: {${inputRow}}): Promise<{${
      primaryKeySingleCol.name.name
    }: ${showTypeAsTypescriptType(primaryKeySingleCol.type)}}>{

  const providedFields = (Object.keys(row) as (keyof typeof row)[]).filter(key => row[key] !== undefined && allowedFieldNames.includes(key)) ;

  const res = await pool.query({
  text: "INSERT INTO ${showQName(
    table.name,
  )} (" + (providedFields.join(", ")) + ") VALUES (" + providedFields.map((_, i) => "$" + (i + 1)).join(", ") +") RETURNING ${
    primaryKeySingleCol.name.name
  }",
  values: providedFields.map(f => row[f]),
  rowMode: "array",
  });
  if (res && res.rows[0]){
    return {${primaryKeySingleCol.name.name}: res.rows[0][0]};
  } else {
    throw new Error("Failed insert into ${showQName(table.name)}");
  }
}`;

    const insertMany = `
export async function insertMany(pool: Pool, rows: {${inputRow}}[]): Promise<{${
      primaryKeySingleCol.name.name
    }: ${showTypeAsTypescriptType(primaryKeySingleCol.type)}}[]>{

  if (rows.length === 0) { return []; }

  const providedFields = allowedFieldNames.filter(field => rows.some(row => (row as any)[field] !== undefined)) as (keyof (typeof rows)[number])[];

  const values: any[] = [];
  let paramIndex = 1;
  const tuples = rows.map(row =>
    "(" + providedFields.map(field => {
      const value = row[field];
      if (value === undefined) { return "DEFAULT"; }
      values.push(value);
      return "$" + (paramIndex++);
    }).join(", ") + ")"
  ).join(", ");

  const res = await pool.query({
  text: "INSERT INTO ${showQName(
    table.name,
  )} (" + (providedFields.join(", ")) + ") VALUES " + tuples + " RETURNING ${
    primaryKeySingleCol.name.name
  }",
  values: values,
  rowMode: "array",
  });
  return res.rows.map(row => ({${primaryKeySingleCol.name.name}: row[0]}));
}`;

    const selectOne = `
export async function getOne(pool: Pool, pk: {${
      primaryKeySingleCol.name.name
    }: ${showTypeAsTypescriptType(
      primaryKeySingleCol.type,
    )}}): Promise<${showTypeAsTypescriptType(table.rel)} | null>{

const res = await pool.query({
text: "SELECT ${genSelectColumnsFromTable(table.rel)} FROM ${showQName(
      table.name,
    )} WHERE ${primaryKeySingleCol.name.name} = $1",
values: [pk.${primaryKeySingleCol.name.name}] as any[],
rowMode: "array",
});
if (res.rows[0]){
return ${genFunctionResDeserialization(table.rel, "res.rows[0]")};
} else {
return null;
}
}`;

    const inputRowForUpdate = relWithoutPrim
      .map(
        (f) => `
${f.name?.name}?: ${showTypeAsTypescriptType(f.type)}`,
      )
      .join(",");
    const update = `
export async function update(pool: Pool, pk: {${
      primaryKeySingleCol.name.name
    }: ${showTypeAsTypescriptType(
      primaryKeySingleCol.type,
    )}}, row: {${inputRowForUpdate}}): Promise<null>{

  const providedFields = (Object.keys(row) as (keyof typeof row)[]).filter(key => row[key] !== undefined && allowedFieldNames.includes(key)) ;
  if (providedFields.length === 0){ return null; }

  await pool.query({
  text: "UPDATE ${showQName(
    table.name,
  )} SET " + providedFields.map((f, i) => f + " = $" + (i + 2)).join(", ") + " WHERE ${
    primaryKeySingleCol.name.name
  } = $1",
values: ([pk.${primaryKeySingleCol.name.name}] as any[]).concat(providedFields.map(f => row[f])),
  rowMode: "array",
  });
  return null;
}`;

    const del = `
export async function del(pool: Pool, pk: {${
      primaryKeySingleCol.name.name
    }: ${showTypeAsTypescriptType(primaryKeySingleCol.type)}}): Promise<null>{

await pool.query({
text: "DELETE FROM ${showQName(table.name)} WHERE ${primaryKeySingleCol.name.name} = $1",
values: [pk.${primaryKeySingleCol.name.name}],
rowMode: "array",
});
return null;
}`;

    return `
${allowedFieldNames}
${selectAll}
${selectOne}
${insert}
${insertMany}
${update}
${del}
`;
  }
}
