import * as fs from "fs/promises";
import * as path from "path";
import { CreateFunctionStatement, parse, Statement } from "pgsql-ast-parser";
import * as prettier from "prettier";
import { functionToTypescript, genDomain, getImports } from "./codegen";
import { doCreateFunction, parseSetupScripts } from "./typecheck";

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
    const statements: Statement[] = parse(fileContents, {
      locationTracking: true,
    });
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
    await fs.appendFile(outfile, genDomain(dom) + "\n", "utf-8");
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
  await fs.writeFile(path, getImports() + "\n", "utf-8");
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
