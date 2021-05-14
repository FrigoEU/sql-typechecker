import * as fs from "fs/promises";
import { parse, Statement } from "pgsql-ast-parser";
import {
  parseSetupScripts,
  notImplementedYet,
  doSelectFrom,
  SetT,
  SimpleT,
  UnknownT,
  Parameters,
  UnifVar,
  Global,
} from "./typecheck";

go();

function printSimpleAsTypescript(
  ps: Parameters,
  t: SimpleT | UnifVar | UnknownT
): string {
  if (t.kind === "unknown") {
    return "any";
  } else if (t.kind === "unifvar") {
    const found = ps.find((p) => p.index === t.index);
    if (!found) {
      throw new Error(`Parameter with index ${t.index} not found`);
    } else {
      return printSimpleAsTypescript(ps, found.type);
    }
  } else {
    if (t.name.name === "array") {
      if (!t.typevar) {
        throw new Error("Array without typevar");
      } else {
        return "(" + printSimpleAsTypescript(ps, t.typevar) + ")" + "[]";
      }
    } else if (t.name.name === "nullable") {
      if (!t.typevar) {
        throw new Error("Nullable without typevar");
      } else {
        return printSimpleAsTypescript(ps, t.typevar) + " | null";
      }
    } else {
      return t.name.name;
    }
  }
}
function printSetAsTypescript(ps: Parameters, s: SetT): string {
  return (
    "[" +
    s.fields.map((f) => printSimpleAsTypescript(ps, f.type)).join(", ") +
    "]"
  );
}

async function go() {
  const f = await fs.readFile("./test.sql", "utf-8");

  const ast: Statement[] = parse(f);

  console.log(JSON.stringify(ast));

  const g = parseSetupScripts(ast);

  console.log("Global", g);

  const f2 = await fs.readFile("./test.ts", "utf-8");

  function genTypes(g: Global, sqlstr: string): string {
    const ast: Statement[] = parse(sqlstr);

    if (ast.length === 0) {
      throw new Error("No SQL statement found inside 'safesql'");
    }
    if (ast.length > 1) {
      throw new Error("More than 1 SQL statement inside 'safesql'");
    }
    const st = ast[0];
    if (st.type === "select") {
      const elab = doSelectFrom(g, { decls: [], aliases: [] }, [], st);
      console.log("Select returns: ", JSON.stringify(elab[0]));
      console.log("Select params: ", JSON.stringify(elab[1]));
      return (
        "<" +
        printSetAsTypescript(elab[1], elab[0]) +
        ", " +
        "[" +
        elab[1]
          .map((p) => printSimpleAsTypescript(elab[1], p.type))
          .join(", ") +
        "]"
      );
    } else if (st.type === "union" || st.type === "union all") {
      return notImplementedYet(st);
    } else if (st.type === "with") {
      return notImplementedYet(st);
    } else if (st.type === "with recursive") {
      return notImplementedYet(st);
    } else if (st.type === "values") {
      return notImplementedYet(st);
    } else {
      return notImplementedYet(st);
    }
  }

  function doReplacement(sqlstr: string) {
    return `safesql<${genTypes(g, sqlstr)}>(\`${sqlstr}\``;
  }

  const newf2 = f2.replace(
    /safesql(?:<[^>]*>)?\(\s*`([^`]*)`/g,
    function (match, sqlstr) {
      return doReplacement(sqlstr);
    }
  );

  await fs.writeFile("./test-genned.ts", newf2, "utf-8");
}
