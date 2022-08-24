import * as fs from "fs/promises";
import { min, repeat } from "lodash";
import * as path from "path";
import {
  CreateFunctionStatement,
  NodeLocation,
  parse,
  QName,
  Statement,
} from "pgsql-ast-parser";
import * as prettier from "prettier";
import {
  functionToTypescript,
  genCrudOperations,
  genDomain,
  getImports,
} from "./codegen";
import {
  doCreateFunction,
  ErrorWithLocation,
  parseSetupScripts,
} from "./typecheck";

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

  const allStatements: { fileName: string; statements: Statement[] }[] = [];
  for (let sqlFile of allSqlFiles) {
    console.log(`Processing file ${sqlFile}`);
    const fileContents = await fs.readFile(sqlFile, "utf-8");
    const statements: Statement[] = parse(fileContents, {
      locationTracking: true,
    });
    allStatements.push({ fileName: sqlFile, statements });
  }

  console.log(`Processing ${allStatements.length} statements`);

  const g = parseSetupScripts(allStatements.flatMap((f) => f.statements));

  // Generating global file with domains = newtypes
  const outDir = path.resolve(process.cwd(), outArg);
  await fs.mkdir(outDir, { recursive: true });
  const domainFile = path.format({
    dir: outDir,
    name: "domains",
    ext: ".ts",
  });
  await prepOutFile(domainFile);
  for (let dom of g.domains) {
    await fs.appendFile(domainFile, genDomain(dom) + "\n", "utf-8");
  }
  await fs.appendFile(domainFile, `\n`, "utf-8");

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
      mkImportDomainsStatement(g.domains, tableOutFile, domainFile),
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
      mkImportDomainsStatement(g.domains, outFileName, domainFile),
      "utf8"
    );
    console.log(`Writing functions to ${outFileName}`);

    for (let st of createFunctionStatements) {
      try {
        const res = doCreateFunction(g, { decls: [], froms: [] }, st);
        const writing = prettier.format(functionToTypescript(res), {
          parser: "typescript",
        });
        // console.log(`Writing: ${writing}`);
        await fs.appendFile(functionsOutFile, writing, "utf-8");
      } catch (err) {
        if (err instanceof ErrorWithLocation && err.l !== undefined) {
          const found = findCode(st.code || "", err.l);
          if (found) {
            const prefix = found.lineNumber.toString() + "  ";
            console.error("");
            console.error(`Typechecking error`);
            console.error("");
            console.error(prefix + found.line);
            console.error(
              repeat(" ", found.range[0] + prefix.length) +
                repeat("^", found.range[1] - found.range[0])
            );
          }
        }
        console.error(err instanceof Error ? err.message : JSON.stringify(err));
      }
    }

    await fs.appendFile(functionsOutFile, `\n`, "utf-8");
  }

  console.log("Done!");
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
  domains: ReadonlyArray<{
    readonly name: QName;
  }>,
  thisFile: string,
  domainFile: string
): string {
  const p = path.relative(path.dirname(thisFile), path.dirname(domainFile));
  const formatted = path.format({
    dir: p || ".",
    name: "domains",
    ext: "",
  });
  const doms = domains.map((d) => d.name.name).join(", ");

  return `import {${doms}} from "${formatted}";\n\n`;
}
