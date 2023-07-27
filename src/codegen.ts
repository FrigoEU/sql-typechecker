import { Name, QName } from "trader-pgsql-ast-parser";
import {
  checkAllCasesHandled,
  functionType,
  JsonKnownT,
  RecordT,
  showQName,
  showSqlType,
  SimpleT,
  Type,
  VoidT,
} from "./typecheck";

export function showTypeAsTypescriptType(t: Type): string {
  if (t.kind === "record") {
    return (
      "{" +
      t.fields
        .map(
          (f) =>
            (f.name === null ? `"?": ` : `"${f.name.name}": `) +
            showTypeAsTypescriptType(f.type)
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
          "double",
          "float8",
          "float4",
          "float2",
        ].includes(t.name.name)
      ) {
        return "number";
      } else if (
        ["text", "name", "char", "character", "varchar", "nvarchar"].includes(
          t.name.name
        )
      ) {
        return "string";
      } else if (["bytea"].includes(t.name.name)) {
        return "Buffer";
      } else if (t.name.name === "date") {
        return "LocalDate";
      } else if (t.name.name === "time") {
        return "LocalTime";
      } else if (
        t.name.name === "timestamp without time zone" ||
        t.name.name === "timestamp"
      ) {
        return "LocalDateTime";
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
    return `parseArray(${literalVar}, (el: any) => ${genDeserializeSimpleT(
      t.typevar as SimpleT,
      "el"
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
              literalVar + '["' + f.name?.name + '"]'
            )}`
        )
        .join(",\n") +
      "})"
    );
  } else if (t.kind === "scalar") {
    if (t.domain) {
      return `${genDeserializeSimpleT(
        t.domain.realtype,
        literalVar
      )} as types.${t.name.name}`;
    }
    if (t.name.name === "date") {
      return `LocalDate.parse(${literalVar})`;
    } else if (t.name.name === "time") {
      return `LocalTime.parse(${literalVar})`;
    } else if (t.name.name === "timestamp with time zone") {
      return `Instant.parse(${literalVar})`;
    } else if (
      t.name.name === "timestamp without time zone" ||
      t.name.name === "timestamp"
    ) {
      return `LocalDateTime.parse(${literalVar}.replace(" ", "T"))`;
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
  literalVar: string
) {
  if (returnType.kind === "void") {
    return literalVar;
  } else if (returnType.kind === "record") {
    return (
      "({" +
      returnType.fields
        .map(
          (f, i) =>
            `${f.name?.name || "?"}: ${genDeserializeSimpleT(
              f.type,
              literalVar + "[" + i + "]"
            )}`
        )
        .join(",\n") +
      "})"
    );
  } else {
    return genDeserializeSimpleT(returnType, literalVar + "[0]");
  }
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

  const argsAsList = f.inputs.map((i) => "args." + i.name.name).join(", ");

  const argsForCreateFunction = f.inputs
    .map((k) => k.name.name + " " + showSqlType(k.type))
    .join(", ");

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

  const asExpression =
    f.returns.kind === "record"
      ? ` AS ${f.name.name}(${f.returns.fields
          .map(
            (f, i) =>
              (f.name?.name || "field" + i) +
              " " +
              showTypeDroppingNullable(f.type)
          )
          .join(", ")})`
      : "";

  const recreatedSqlFunctionStatement = `
CREATE FUNCTION ${f.name.name}(${argsForCreateFunction}) RETURNS ${
    f.multipleRows ? "SETOF " : ""
  }${
    f.returns.kind === "record"
      ? "RECORD"
      : f.returns.kind === "void"
      ? "void"
      : showTypeDroppingNullable(f.returns)
  } AS
$$${f.code}$$ LANGUAGE ${f.language};
`;

  const funcInvocation = `${f.name.name}(${f.inputs.map(
    (inp, i) => "$" + (i + 1) + "::" + showTypeDroppingNullable(inp.type)
  )})${asExpression}`;

  const deserializationAndReturn =
    f.returns.kind === "void"
      ? ""
      : f.multipleRows === true
      ? `return res.rows.map(row => ${genFunctionResDeserialization(
          f.returns,
          "row"
        )});`
      : `
const row = res.rows[0];
if (row.some(f => f !== null)){
  return ${genFunctionResDeserialization(f.returns, "row")}
} else {
  return null;
}`;
  return `
export async function ${f.name.name}(pool: Pool, args: ${argsType})
  : Promise<${returnTypeAsString}>{

  const res = await pool.query({
    text: "SELECT * FROM ${funcInvocation}",
    values: [${argsAsList}],
    rowMode: "array",
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
    dom.realtype
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
import { Instant, LocalDate, LocalTime, LocalDateTime} from "@js-joda/core";
import {parse as parseArray} from "postgres-array";
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
export async function getAll(pool: Pool): Promise<${showTypeAsTypescriptType(
    table.rel
  )}[]>{

const res = await pool.query({
text: "SELECT ${genSelectColumnsFromTable(table.rel)} FROM ${showQName(
    table.name
  )}",
values: [],
rowMode: "array",
});
const rows = res.rows.map(row => ${genFunctionResDeserialization(
    table.rel,
    "row"
  )});
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
          (f) => f.name?.name === table.primaryKey[0].name
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
      (f) => f.name?.name !== primaryKeySingleCol.name.name
    );
    const mandatoryFields = table.rel.fields.filter(
      (c) => !table.defaults.some((def) => def.name === c.name?.name)
    );
    const optionalFields = table.rel.fields.filter((c) =>
      table.defaults.some((def) => def.name === c.name?.name)
    );
    const inputRow =
      mandatoryFields
        .map(
          (f) => `
${f.name?.name}: ${showTypeAsTypescriptType(f.type)}`
        )
        .join(",") +
      optionalFields
        .map(
          (f) => `
${f.name?.name}?: ${showTypeAsTypescriptType(f.type)}`
        )
        .join(",");
    const insert = `
export async function insert(pool: Pool, row: {${inputRow}}): Promise<{${
      primaryKeySingleCol.name.name
    }: ${showTypeAsTypescriptType(primaryKeySingleCol.type)}} | null>{

  const providedFields = Object.keys(row)  as (keyof typeof row)[];

  const res = await pool.query({
  text: "INSERT INTO ${showQName(
    table.name
  )} (" + (providedFields.join(", ")) + ") VALUES (" + providedFields.map((_, i) => "$" + (i + 1)).join(", ") +") RETURNING ${
      primaryKeySingleCol.name.name
    }",
  values: providedFields.map(f => row[f]),
  rowMode: "array",
  });
  if (res && res.rows[0]){
    return {${primaryKeySingleCol.name.name}: res.rows[0][0]};
  } else {
    return null;
  }
}`;

    const selectOne = `
export async function getOne(pool: Pool, pk: {${
      primaryKeySingleCol.name.name
    }: ${showTypeAsTypescriptType(
      primaryKeySingleCol.type
    )}}): Promise<${showTypeAsTypescriptType(table.rel)} | null>{

const res = await pool.query({
text: "SELECT ${genSelectColumnsFromTable(table.rel)} FROM ${showQName(
      table.name
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
${f.name?.name}?: ${showTypeAsTypescriptType(f.type)}`
      )
      .join(",");
    const update = `
export async function update(pool: Pool, pk: {${
      primaryKeySingleCol.name.name
    }: ${showTypeAsTypescriptType(
      primaryKeySingleCol.type
    )}}, row: {${inputRowForUpdate}}): Promise<null>{

  const providedFields = Object.keys(row) as (keyof typeof row)[] ;
  if (providedFields.length === 0){ return null; }

  await pool.query({
  text: "UPDATE ${showQName(
    table.name
  )} SET " + providedFields.map((f, i) => f + " = $" + (i + 2)).join(", ") + " WHERE ${
      primaryKeySingleCol.name.name
    } = $1",
values: ([pk.${
      primaryKeySingleCol.name.name
    }] as any[]).concat(providedFields.map(f => row[f])),
  rowMode: "array",
  });
  return null;
}`;

    const del = `
export async function del(pool: Pool, pk: {${
      primaryKeySingleCol.name.name
    }: ${showTypeAsTypescriptType(primaryKeySingleCol.type)}}): Promise<null>{

await pool.query({
text: "DELETE FROM ${showQName(table.name)} WHERE ${
      primaryKeySingleCol.name.name
    } = $1",
values: [pk.${primaryKeySingleCol.name.name}],
rowMode: "array",
});
return null;
}`;

    return `
${selectAll}
${selectOne}
${insert}
${update}
${del}
`;
  }
}
