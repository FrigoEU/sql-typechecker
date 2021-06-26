import * as fs from "fs/promises";
import { parse, Statement } from "pgsql-ast-parser";
import {
  parseSetupScripts,
  notImplementedYet,
  doSelectFrom,
  SetT,
  SimpleT,
  UnifVar,
  Global,
  UnifVars,
  ParametrizedT,
} from "./typecheck";

go();

function printSimpleAsTypescript(
  us: UnifVars,
  t: SimpleT | ParametrizedT<SimpleT | UnifVar> | UnifVar | null
): string {
  if (t === null) {
    return "any";
  } else if (t.kind === "unifvar") {
    const [found, _exprs] = us.lookup(t);
    return printSimpleAsTypescript(us, found);
  } else {
    if (t.name === "array") {
      return "(" + printSimpleAsTypescript(us, t.typevar) + ")" + "[]";
    } else if (t.name === "nullable") {
      return printSimpleAsTypescript(us, t.typevar) + " | null";
    } else {
      return t.name.name;
    }
  }
}
function printSetAsTypescript(us: UnifVars, s: SetT): string {
  return (
    "{" +
    s.fields
      .map(
        (f) =>
          (f.name === null ? `"?": ` : `"${f.name.name}": `) +
          printSimpleAsTypescript(us, f.type)
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
      const [returnT, us] = doSelectFrom(
        g,
        { decls: [], aliases: [] },
        new UnifVars(0, {}),
        st
      );
      console.log("Select:\n", sqlstr, "\n");

      const returnTypeAsString = printSetAsTypescript(us, returnT);
      console.log("Returns:\n", returnTypeAsString, "\n");

      return (
        "<" +
        returnTypeAsString +
        ", " +
        "[" +
        us
          .getKeys()
          .map((k) => {
            const [p, _exprs] = us.lookup({ kind: "unifvar", id: k });
            const paramTypeAsString = printSimpleAsTypescript(us, p);
            console.log(`Param \$${k}:\n`, paramTypeAsString, "\n");
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
