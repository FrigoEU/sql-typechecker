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
  UnifVars,
} from "./typecheck";

go();

function printSimpleAsTypescript(
  ps: Parameters,
  us: UnifVars,
  t: SimpleT | UnifVar | UnknownT
): string {
  if (t.kind === "unknown") {
    return "any";
  } else if (t.kind === "unifvar") {
    const found = us[t.id];
    if (!found) {
      throw new Error(`Parameter with id ${t.id} not found`);
    } else {
      return printSimpleAsTypescript(ps, us, found.type);
    }
  } else {
    if (t.name.name === "array") {
      if (!t.typevar) {
        throw new Error("Array without typevar");
      } else {
        return "(" + printSimpleAsTypescript(ps, us, t.typevar) + ")" + "[]";
      }
    } else if (t.name.name === "nullable") {
      if (!t.typevar) {
        throw new Error("Nullable without typevar");
      } else {
        return printSimpleAsTypescript(ps, us, t.typevar) + " | null";
      }
    } else {
      return t.name.name;
    }
  }
}
function printSetAsTypescript(ps: Parameters, us: UnifVars, s: SetT): string {
  return (
    "{" +
    s.fields
      .map(
        (f) =>
          (f.name === null ? "?" : `"${f.name.name}": `) +
          printSimpleAsTypescript(ps, us, f.type)
      )
      .join(", ") +
    "}"
  );
}

async function go() {
  const f = await fs.readFile("./test.sql", "utf-8");

  const ast: Statement[] = parse(f);

  // console.log("Parsed AST:\n", JSON.stringify(ast, null, 2), "\n");

  const g = parseSetupScripts(ast);

  // console.log("Global:\n", JSON.stringify(g, null, 2), "\n");

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
      const [returnT, ps, us] = doSelectFrom(
        g,
        { decls: [], aliases: [] },
        {},
        {},
        st
      );
      console.log("Select:\n", sqlstr, "\n");

      const returnTypeAsString = printSetAsTypescript(ps, us, returnT);
      console.log("Returns:\n", returnTypeAsString, "\n");

      return (
        "<" +
        returnTypeAsString +
        ", " +
        "[" +
        Object.keys(ps)
          .map((i) => parseInt(i))
          .map((k) => {
            const p = ps[k];
            if (!p) {
              throw new Error(
                `parameter not found, key: ${k}, ps: ${JSON.stringify(ps)}`
              );
            } else {
              const paramTypeAsString = printSimpleAsTypescript(ps, us, {
                kind: "unifvar",
                id: p.unifvarId,
              });
              console.log(`Param \$${k}:\n`, paramTypeAsString, "\n");
            }
          })
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
