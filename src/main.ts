import * as fs from "fs/promises";
import { parse, QName, Statement } from "pgsql-ast-parser";
import {
  doCreateFunction,
  Global,
  notImplementedYet,
  parseSetupScripts,
  printType,
} from "./typecheck";

go();

function printQName(qname: QName): string {
  return qname.name;
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
    if (st.type === "create function") {
      const res = doCreateFunction(g, { decls: [] }, st);
      console.log("Select:\n", sqlstr, "\n");

      const returnTypeAsString =
        res.returns === null ? "void" : printType(res.returns);
      console.log("Returns:\n", returnTypeAsString, "\n");

      return (
        "<" +
        returnTypeAsString +
        ", " +
        "[" +
        res.inputs
          .map((k) => {
            const paramTypeAsString = printType(k.type);

            console.log(`Param \$${k.name}:\n`, paramTypeAsString, "\n");
            return paramTypeAsString;
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
