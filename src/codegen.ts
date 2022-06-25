import { QName } from "pgsql-ast-parser";
import {
  checkAllCasesHandled,
  functionType,
  JsonKnownT,
  RecordT,
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
      if (
        ["numeric", "bigint", "smallint", "integer", "real", "double"].includes(
          t.name.name
        )
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

function genDeserializeSimpleT(t: SimpleT, literalVar: string) {}

function genDeserializationFunction(returnType: SimpleT | RecordT | VoidT) {
  if (returnType.kind === "void") {
    return `function deserialize(cells: unknown[]): any{
      return cells;
    }`;
  } else if (returnType.kind === "record") {
    return `function deserialize(cells: unknown[]): any{
return ${TODO};
}`;
  } else {
    `function deserialize(cells: unknown[]): any{
return ${genDeserializeSimpleT(returnType, "cells[0]")};
}`;
  }
}

export function functionToTypescript(f: functionType): string {
  const returnTypeAsString =
    f.returns.kind === "void"
      ? "void"
      : showTypeAsTypescriptType(f.returns) +
        (f.multipleRows ? "[]" : " | undefined");

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
            (f) => (f.name?.name || "") + " " + showTypeDroppingNullable(f.type)
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

  return `
export async function ${f.name.name}(pool: Pool, args: ${argsType})
  : Promise<${returnTypeAsString}>{

  /* ${recreatedSqlFunctionStatement} */

  ${genDeserializationFunction(f.returns)}

  const res = await pool.query({
    text: "SELECT * FROM ${funcInvocation}",
    values: [${argsAsList}],
    rowMode: "array",
  });
  debugger;
  const rows = res.rows.map(deserialize);
  return rows${f.multipleRows ? "" : "[0]"};
  }
`;
}

export function genDomain(dom: {
  readonly name: QName;
  readonly type: SimpleT;
}): string {
  return `export type ${dom.name.name} = ${showTypeAsTypescriptType(
    dom.type
  )} & { readonly __tag: "${dom.name.name}" };`;
}

export function getImports() {
  return `
import type { Pool } from "pg";
import type { Instant, LocalDate, LocalTime, LocalDateTime, ZonedDateTime } from "@js-joda/core";
`;
}
