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
  SimpleT,
  JsonKnownT,
} from "./typecheck";
import * as prettier from "prettier";

go();

async function findSqlFilesInDir(dir: string): Promise<string[]> {
  const inThisDir = await fs.readdir(dir);
  const res: string[] = [];
  for (let p of inThisDir) {
    const fullP = path.join(dir, p);
    if (fullP.endsWith(".sql")) {
      res.push(fullP);
    } else {
      const stat = await fs.stat(fullP);
      if (stat.isDirectory()) {
        const inSubFolder = await findSqlFilesInDir(fullP);
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

function functionToTypescript(f: functionType): string {
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

  const argsAsList = f.inputs
    .map((i) => "${args." + i.name.name + "}")
    .join(", ");

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

  const funcInvocation = `${f.name.name}(${argsAsList})${asExpression}`;

  const recreatedSqlFunctionStatement = `
CREATE FUNCTION ${f.name.name}(${argsForCreateFunction}) RETURNS ${
    f.multipleRows ? "SETOF " : ""
  }${
    f.returns.kind === "record"
      ? "RECORD"
      : f.returns.kind === "jsonknown"
      ? "JSON"
      : f.returns.kind === "void"
      ? "void"
      : showTypeDroppingNullable(f.returns)
  } AS
$$${f.code}$$ LANGUAGE ${f.language};
`;

  return `
export async function ${
    f.name.name
  }(pg: postgres.Sql<any>, args: ${argsType}): Promise<${returnTypeAsString}>{
/* ${recreatedSqlFunctionStatement} */
return (await pg\`SELECT * FROM ${funcInvocation}\` as any)${
    f.multipleRows ? "" : "[0]"
  }${f.returns.kind === "record" ? "" : "?." + f.name.name};
}
`;
}

async function go() {
  const outArgs = findInArgs({ argv: process.argv, flags: ["-o", "--out"] });
  const outArg = outArgs[0];
  if (!outArg) {
    throw new Error("Please provide -o/--out parameter");
  }

  const dirs = findInArgs({ argv: process.argv, flags: ["-d", "--dir"] });
  const files = findInArgs({ argv: process.argv, flags: ["-f", "--file"] });

  const allSqlFiles = (
    await Promise.all(
      dirs.map((dir) => findSqlFilesInDir(path.resolve(process.cwd(), dir)))
    )
  )
    .flat()
    .concat(files);

  if (allSqlFiles.length === 0) {
    throw new Error(
      "Please provide at least one SQL file with flags -f/--file or -d/--dir"
    );
  }

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

  for (let dom of g.domains) {
    await fs.appendFile(
      outfile,
      `type ${dom.name.name} = ${showTypeAsTypescriptType(
        dom.type
      )} & { readonly __tag: "${dom.name.name}" };\n`,
      "utf-8"
    );
  }
  await fs.appendFile(outfile, `\n`, "utf-8");

  for (let st of createFunctionStatements) {
    try {
      const res = doCreateFunction(g, { decls: [], froms: [] }, st);
      const writing = prettier.format(functionToTypescript(res), {
        parser: "typescript",
      });
      // console.log(`Writing: ${writing}`);
      await fs.appendFile(outfile, writing, "utf-8");
    } catch (err) {
      console.error(err instanceof Error ? err.message : JSON.stringify(err));
      return;
    }
  }
}

async function prepOutFile(path: string): Promise<string> {
  // const stat = await fs.stat(path);
  // if (!stat.isFile)
  // await fs.truncate(path);
  await fs.writeFile(path, `import postgres from "postgres";\n`, "utf-8");
  return path;
}

function findInArgs(opts: { argv: string[]; flags: string[] }): string[] {
  let i = 0;
  let res = [];
  for (let arg of opts.argv) {
    if (opts.flags.includes(arg) && opts.argv[i + 1]) {
      res.push(opts.argv[i + 1]);
    }
    i = i + 1;
  }
  return res;
}
