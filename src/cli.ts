import * as fs from "fs/promises";
import { min, repeat } from "lodash";
import * as path from "path";
import * as prettier from "prettier";
import {
  CreateFunctionStatement,
  Name,
  NodeLocation,
  parse,
  QName,
  Statement,
} from "trader-pgsql-ast-parser";
import { genCrudOperations, genDomain, getImports } from "./codegen";
import {
  doQuery,
  ErrorWithLocation,
  parseSetupScripts,
  UnifVar,
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

async function go() {
  const setupdirs = findInArgs({
    argv: process.argv,
    flags: ["-sd", "--setupdir"],
  });
  const setupfiles = findInArgs({
    argv: process.argv,
    flags: ["-sf", "--setupfile"],
  });
  const querydirs = findInArgs({
    argv: process.argv,
    flags: ["-qd", "--querydir"],
  });

  const queryfiles = findInArgs({
    argv: process.argv,
    flags: ["-qf", "--queryfile"],
  });

  const globaldirs = findInArgs({
    argv: process.argv,
    flags: ["-gd", "--globaldir"],
  });

  const allSetupFiles = (
    await Promise.all(
      setupdirs.map((dir) =>
        findSqlFilesInDir(path.resolve(process.cwd(), dir))
      )
    )
  )
    .flat()
    .concat(setupfiles);

  const allQueryFiles = (
    await Promise.all(
      querydirs.map((dir) =>
        findSqlFilesInDir(path.resolve(process.cwd(), dir))
      )
    )
  )
    .flat()
    .concat(queryfiles);

  if (allSetupFiles.length === 0) {
    throw new Error(
      "Please provide at least one SQL setup file with flags -sf/--setupfile or -sd/--setupdir"
    );
  }

  if (allQueryFiles.length === 0) {
    throw new Error(
      "Please provide at least one SQL query file with flags -qf/--queryfile or -qd/--querydir"
    );
  }

  const globaldir = globaldirs[0] || null;

  if (globaldir === null) {
    throw new Error(
      'Please provide a directory for the "global" file with flag -gd/--globaldir'
    );
  }

  const allSetupStatements: { fileName: string; statements: Statement[] }[] =
    [];
  for (let sqlFile of allSetupFiles) {
    console.log(`Processing file ${sqlFile}`);
    const fileContents = await fs.readFile(sqlFile, "utf-8");
    const statements: Statement[] = parse(fileContents, {
      locationTracking: true,
    });
    allSetupStatements.push({ fileName: sqlFile, statements });
  }

  console.log(`Processing ${allSetupStatements.length} setup statements`);

  const g = parseSetupScripts(allSetupStatements.flatMap((f) => f.statements));

  // Generating global file with domains = newtypes
  const outDir = path.resolve(process.cwd(), globaldir);
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

  // Generating a file for each query file
  // Can do this in parallel
  await Promise.all(
    allQueryFiles.map(async function (sqlFile) {
      const contents_ = await fs.readFile(sqlFile, "utf-8");
      // Replacing :myvar with myvar
      // :myvar is not valid syntax, $1 is
      // Regex makes sure we don't replace type annotations (eg: "::int[]")
      let decls: {
        readonly name: Name;
        readonly type: UnifVar;
      }[] = [];
      const contents = contents_.replace(
        /[^:](:[_A-Za-z0-9]+)/g,
        function (match: string) {
          const varname = match.substring(2);
          decls.push({
            name: { name: varname },
            type: { kind: "unifvar", val: { kind: "unknown" } },
          });
          return match[0] + varname;
        }
      );
      const statements = parse(contents, {
        locationTracking: true,
      });
      if (statements.length !== 1) {
        throw new Error(
          `Failed to parse query @ ${sqlFile}: Please include exactly ONE statement in the query file`
        );
      }
      const query = statements[0];

      const fParsed = path.parse(sqlFile);
      const queryOutFileName = path.format({
        dir: fParsed.dir,
        name: fParsed.name,
        ext: ".ts",
      });
      const queryOutFile = await prepOutFile(queryOutFileName);
      await fs.appendFile(
        queryOutFileName,
        mkImportDomainsStatement(g.domains, queryOutFileName, domainFile),
        "utf8"
      );

      console.log(`Writing result to ${queryOutFileName}`);

      try {
        debugger;
        if (query.type === "select" || query.type === "insert") {
          console.log(`Typechecking query @ ${sqlFile}`);
          const res = doQuery(g, { decls: decls, froms: [] }, query);
          console.log(`
Typechecked:
${contents}

Inputs:
${JSON.stringify(res.inputs)}

Returns:
${JSON.stringify(res.returns)}
`);
          const writing = `
/*
Typechecked:
${contents}

Inputs:
${JSON.stringify(res.inputs)}

Returns:
${JSON.stringify(res.returns)}
*/
`;
          // functionToTypescript(res), {
          //   parser: "typescript",
          // }
          // console.log(`Writing: ${writing}`);
          await fs.appendFile(queryOutFile, writing, "utf-8");
        } else {
          throw new Error(`Statement type ${query.type} not supported`);
        }
      } catch (err) {
        if (err instanceof ErrorWithLocation && err.l !== undefined) {
          const found = findCode(contents || "", err.l);
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

      await fs.appendFile(queryOutFile, `\n`, "utf-8");
    })
  );

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
