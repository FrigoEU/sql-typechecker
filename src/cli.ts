import * as fs from "fs/promises";
import * as path from "path";
import { CreateFunctionStatement, parse, Statement } from "pgsql-ast-parser";
import {
  checkAllCasesHandled,
  doCreateFunction,
  functionType,
  parseSetupScripts,
  showSqlType,
  showType,
  Type,
} from "./typecheck";
import * as prettier from "prettier";

go();

async function findSqlFiles(dir: string): Promise<string[]> {
  const inThisDir = await fs.readdir(dir);
  const res: string[] = [];
  for (let p of inThisDir) {
    const fullP = path.join(dir, p);
    if (fullP.endsWith(".sql")) {
      res.push(fullP);
    } else {
      const stat = await fs.stat(fullP);
      if (stat.isDirectory()) {
        const inSubFolder = await findSqlFiles(fullP);
        res.push(...inSubFolder);
      } else {
        // not a sql file, not a directory
      }
    }
  }
  return res;
}

function isCreateFunctionStatement(
  st: Statement
): st is CreateFunctionStatement {
  return st.type === "create function";
}

export function showTypeAsTypescriptType(t: Type): string {
  if (t.kind === "set") {
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
      } else {
        return t.name.name;
      }
    } else if (t.kind === "anyscalar") {
      return "anyscalar";
    } else {
      return checkAllCasesHandled(t);
    }
  }
}

function functionToTypescript(f: functionType): string {
  const returnTypeAsString =
    f.returns.kind === "void"
      ? "void"
      : showTypeAsTypescriptType(f.returns) + "[]";

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

  const argsAsList = f.inputs
    .map((i) => "${args." + i.name.name + "}")
    .join(", ");

  const argsForCreateFunction = f.inputs
    .map((k) => k.name.name + showSqlType(k.type))
    .join(", ");

  return `
export function ${
    f.name.name
  }(pg: postgres.Sql<any>, args: ${argsType}): Promise<${returnTypeAsString}>{
return pg\`select ${f.name.name}(${argsAsList})\`;
/*
CREATE FUNCTION ${f.name.name}(${argsForCreateFunction}) RETURNS ${
    f.multipleRows ? "SETOF " : ""
  }__todo__ AS
$$${f.code}$$ LANGUAGE ${f.language};
*/
}
`;
}

async function go() {
  const dir = process.argv[2];
  if (!dir) {
    throw new Error("Please provide directory with SQL files");
  }

  const outArg = findOutArg(process.argv);
  if (!outArg) {
    throw new Error("Please provide -o/--out parameter");
  }
  const allSqlFiles = await findSqlFiles(path.resolve(process.cwd(), dir));

  // console.log(`Processing files: ${allSqlFiles.join(", ")}`);

  const allStatements: Statement[] = [];
  for (let sqlFile of allSqlFiles) {
    console.log("Processing file ${sqlFile}");
    const fileContents = await fs.readFile(sqlFile, "utf-8");
    const statements: Statement[] = parse(fileContents);
    allStatements.push(...statements);
  }

  console.log(`Processing ${allStatements.length} statements`);

  const g = parseSetupScripts(allStatements);

  // console.log("Global:\n", JSON.stringify(g, null, 2), "\n");

  const createFunctionStatements = allStatements.filter(
    isCreateFunctionStatement
  );

  const outfile = await prepOutFile(path.resolve(process.cwd(), outArg));

  for (let st of createFunctionStatements) {
    const res = doCreateFunction(g, { decls: [], froms: [] }, st);
    const writing = prettier.format(functionToTypescript(res), {
      parser: "typescript",
    });
    // console.log(`Writing: ${writing}`);
    await fs.appendFile(outfile, writing, "utf-8");
  }
}

async function prepOutFile(path: string): Promise<string> {
  // const stat = await fs.stat(path);
  // if (!stat.isFile)
  // await fs.truncate(path);
  await fs.writeFile(path, `import postgres from "postgres";\n`, "utf-8");
  return path;
}

function findOutArg(args: string[]): string | null {
  const flagIndex = args.findIndex((arg) => arg === "-o" || arg === "--out");
  if (!flagIndex) {
    return null;
  } else {
    return args[flagIndex + 1] || null;
  }
}
