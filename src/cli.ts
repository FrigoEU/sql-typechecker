import * as fs from "fs/promises";
import { min, repeat } from "lodash-es";
import * as path from "path";
import * as prettier from "prettier";
import {
  parse,
  type CreateFunctionStatement,
  type NodeLocation,
  type QName,
  type Statement,
} from "trader-pgsql-ast-parser";
import {
  functionToTypescript,
  genCrudOperations,
  genDomain,
  genEnum,
  getImports,
} from "./codegen.ts";
import {
  ErrorWithLocation,
  type Global,
  doCreateFunction,
  parseSetupScripts,
} from "./typecheck.ts";

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
    throw new Error(
      "Please provide -o/--out parameter for the domain and crud files"
    );
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

  const allStatements: {
    fileName: string;
    fileContents: string;
    statements: Statement[];
  }[] = [];
  let g: Global = { tables: [], views: [], domains: [], enums: [] };
  for (let sqlFile of allSqlFiles) {
    // console.log(`Processing file ${sqlFile}`);
    const fileContents = await fs.readFile(sqlFile, "utf-8");
    const statements: Statement[] = parse(fileContents, {
      locationTracking: true,
    });
    allStatements.push({ fileName: sqlFile, fileContents, statements });

    try {
      g = parseSetupScripts(g, statements);
    } catch (err) {
      console.error("Error in setup script");
      console.error("---------------------------------------------");
      if (err instanceof ErrorWithLocation && err.l !== undefined) {
        const found = findCode(fileContents, err.l);
        if (found) {
          console.error(`${sqlFile}:${found.lineNumber}:${found.range[0]}: `);
        } else {
          console.error(`${sqlFile}:0:`);
        }
      } else {
        console.error(`${sqlFile}:0:`);
      }
      console.error(err instanceof Error ? err.message : JSON.stringify(err));
      console.error("---------------------------------------------");
      console.error("");
      process.exit(1);
    }
  }

  // Generating global file with domains = newtypes
  const outDir = path.resolve(process.cwd(), outArg);
  await fs.mkdir(outDir, { recursive: true });
  const typesFile = path.format({
    dir: outDir,
    name: "types",
    ext: ".ts",
  });
  await prepOutFile(typesFile);
  for (let dom of g.domains) {
    await fs.appendFile(typesFile, genDomain(dom) + "\n", "utf-8");
  }
  for (let enu of g.enums) {
    await fs.appendFile(typesFile, genEnum(enu) + "\n", "utf-8");
  }
  await fs.appendFile(typesFile, `\n`, "utf-8");

  // Generating a "tables" file to reexport all tables from
  const tablesIndexFile = path.format({
    dir: outDir,
    name: "tables",
    ext: ".ts",
  });
  await prepOutFile(tablesIndexFile);

  await fs.mkdir(path.join(outDir, "tables"), { recursive: true });
  // Generating a file per table with crud operations
  for (let table of g.tables) {
    const tableOutFile = path.format({
      dir: path.join(outDir, "tables"),
      name: table.name.name,
      ext: ".ts",
    });
    await prepOutFile(tableOutFile);
    const text = genCrudOperations(table);
    await fs.appendFile(
      tableOutFile,
      mkImportDomainsStatement(g.domains, tableOutFile, typesFile),
      "utf8"
    );
    await fs.appendFile(
      tableOutFile,
      // text,
      prettier.format(text, { parser: "typescript" }),
      "utf-8"
    );
    await fs.appendFile(
      tablesIndexFile,
      `export * as ${table.name.name} from "./tables/${table.name.name}";\n`
    );
  }

  // Generating a file for each SQL file that contains at least one CREATE FUNCTION statement
  for (let f of allStatements) {
    const createFunctionStatements = f.statements.filter(
      isCreateFunctionStatement
    );
    const fParsed = path.parse(f.fileName);
    const outFileName = path.format({
      dir: fParsed.dir,
      name: fParsed.name,
      ext: ".ts",
    });
    const functionsOutFile = await prepOutFile(outFileName);
    await fs.appendFile(
      outFileName,
      mkImportDomainsStatement(g.domains, outFileName, typesFile),
      "utf8"
    );
    // console.log(`Writing functions to ${outFileName}`);

    for (let st of createFunctionStatements) {
      if (st.language?.name.toLowerCase() !== "sql") {
        continue;
      }
      try {
        const res = doCreateFunction(g, { decls: [], froms: [] }, st);
        const writing = prettier.format(functionToTypescript(res), {
          parser: "typescript",
        });
        // console.log(`Writing: ${writing}`);
        await fs.appendFile(functionsOutFile, writing, "utf-8");
      } catch (err) {
        const functionLineNumber = (function () {
          const indexOfCode = f.fileContents.indexOf(st.code || "");
          const foundCode = findCode(f.fileContents, {
            start: indexOfCode,
            end: indexOfCode + 1,
          });
          if (!foundCode) {
            return null;
          }
          return (
            foundCode.lineNumber +
            1 /* not sure where + 1 comes from exactly..., but it fits */
          );
        })();
        console.error("---------------------------------------------");
        if (err instanceof ErrorWithLocation && err.l !== undefined) {
          const found = findCode(st.code || "", err.l);
          if (found) {
            const fullLineNumber = (functionLineNumber || 0) + found.lineNumber;
            const prefix = fullLineNumber.toString() + "  ";
            console.error(
              `${f.fileName}:${fullLineNumber}:${found.range[0]}: ${st.name.name}`
            );
            console.error("");
            console.error(prefix + found.line);
            console.error(
              repeat(" ", found.range[0] + prefix.length) +
                repeat("^", found.range[1] - found.range[0])
            );
          } else {
            console.error(
              `${f.fileName}:${functionLineNumber || 0}: ${st.name.name}`
            );
          }
        } else {
          console.error(
            `${f.fileName}:${functionLineNumber || 0}: ${st.name.name}`
          );
        }
        console.error(err instanceof Error ? err.message : JSON.stringify(err));
        console.error("---------------------------------------------");
        console.error("");
        process.exit(1);
      }
    }

    await fs.appendFile(functionsOutFile, `\n`, "utf-8");
  }

  // console.log("Done!");
}

function findCode(
  s: string,
  l: NodeLocation
): { line: string; lineNumber: number; range: [number, number] } | null {
  let counted = 0;
  let lineNumber = 0;
  const lines = s.split("\n");
  for (let line of lines) {
    const lineLength = line.length;
    if (counted <= l.start && l.start <= counted + lineLength) {
      return {
        line,
        lineNumber,
        range: [
          l.start - counted,
          min([lineLength, l.end - counted]) || lineLength,
        ],
      };
    }
    lineNumber++;
    counted += lineLength + 1 /* 1 for newline */;
  }
  return null;
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

function mkImportDomainsStatement(
  _domains: ReadonlyArray<{
    readonly name: QName;
  }>,
  thisFile: string,
  domainFile: string
): string {
  const p = path.relative(path.dirname(thisFile), path.dirname(domainFile));
  const formatted = path.format({
    dir: p || ".",
    name: "types",
    ext: "",
  });

  return `import * as types from "${formatted}";\n\n`;
}
