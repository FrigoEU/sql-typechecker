import assert from "node:assert/strict";
import test from "node:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { loadModule, parseStatements } from "../src/pg-ast.ts";
import { doCreateFunction, parseSetupScripts } from "../src/typecheck.ts";
import { functionToTypescript } from "../src/codegen.ts";

test.before(async () => {
  await loadModule();
});

// Typechecks a single CREATE FUNCTION statement against a setup script and
// returns the TypeScript sql-typechecker generates for it.
function generateFunction(setupStr: string, queryStr: string): string {
  const g = parseSetupScripts(
    { tables: [], views: [], domains: [], enums: [] },
    parseStatements(setupStr),
  );
  const query = parseStatements(queryStr);
  const stmt = query[0]?.stmt;
  if (!stmt || !("CreateFunctionStmt" in stmt)) {
    throw new Error("Bad test setup: expected a single CREATE FUNCTION statement");
  }
  const res = doCreateFunction(
    g,
    { decls: [], froms: [] },
    stmt.CreateFunctionStmt,
  );
  return functionToTypescript(res);
}

const tableSetup =
  "create table my_table ( id int8 not null primary key, name text );";

test("single-statement LANGUAGE sql function is inlined as a parameterized query, not a stored-function call", () => {
  const generated = generateFunction(
    tableSetup,
    `
CREATE FUNCTION get_by_id(target_id int8) RETURNS SETOF record AS $$
  SELECT id, name FROM my_table WHERE id = target_id
$$ LANGUAGE sql;
`,
  );

  // The query body runs directly — no CREATE FUNCTION is ever deployed, and
  // there's no `SELECT * FROM get_by_id(...)` call to a stored function.
  assert.doesNotMatch(generated, /CREATE FUNCTION/);
  assert.doesNotMatch(generated, /SELECT \* FROM get_by_id/);
  assert.match(generated, /FROM my_table/);
  // The parameter is substituted with an explicit-cast placeholder, not left
  // for Postgres to infer from context.
  assert.match(generated, /id = \$1::bigint/);
  assert.match(generated, /values: \[args\.target_id\]/);
});

test("$n placeholders follow declared parameter order, not order of first use in the body", () => {
  const generated = generateFunction(
    tableSetup,
    `
CREATE FUNCTION find_stuff(first_param int8, second_param text) RETURNS SETOF record AS $$
  SELECT id, name FROM my_table WHERE name = second_param AND id = first_param
$$ LANGUAGE sql;
`,
  );

  // first_param is declared first (and so is args.first_param in `values`),
  // even though second_param appears first in the query body.
  assert.match(generated, /id = \$1::bigint/);
  assert.match(generated, /name = \$2::text/);
  assert.match(generated, /values: \[args\.first_param, args\.second_param\]/);
});

test("LANGUAGE plpgsql functions get no caller — a stub that fails to compile instead", () => {
  const generated = generateFunction(
    tableSetup,
    `
CREATE FUNCTION plpgsql_fn() RETURNS SETOF record AS $$
BEGIN
  RETURN QUERY SELECT id, name FROM my_table;
END;
$$ LANGUAGE plpgsql;
`,
  );

  assert.doesNotMatch(generated, /pool\.query/);
  // A bare string returned against a Promise<...>-typed function is a
  // guaranteed tsc error, with the reason readable in the diagnostic itself.
  assert.match(generated, /return "sql-typechecker: no caller generated/);
  assert.match(generated, /LANGUAGE plpgsql/);
});

test("a LANGUAGE sql body with more than one statement also gets the stub, not a caller", () => {
  const generated = generateFunction(
    tableSetup,
    `
CREATE FUNCTION multi_stmt(x int8) RETURNS int8 AS $$
  SELECT 1;
  SELECT x;
$$ LANGUAGE sql;
`,
  );

  assert.doesNotMatch(generated, /pool\.query/);
  assert.match(generated, /return "sql-typechecker: no caller generated/);
  assert.match(generated, /isn't exactly one statement/);
});

test("the query text is emitted as a multi-line template literal, not a JSON-escaped single line", () => {
  const generated = generateFunction(
    tableSetup,
    `
CREATE FUNCTION get_by_id(target_id int8) RETURNS SETOF record AS $$
  SELECT id, name FROM my_table WHERE id = target_id
$$ LANGUAGE sql;
`,
  );

  assert.match(generated, /text: `SELECT/);
  assert.doesNotMatch(generated, /text: "SELECT/);
  // The backtick string spans multiple real lines, not "\n" escapes.
  assert.match(generated, /text: `SELECT\n/);
});

test("backtick / ${...} / backslash inside a string literal survive the template-literal escaping and execute correctly", async () => {
  const generated = generateFunction(
    tableSetup,
    `
CREATE FUNCTION weird() RETURNS SETOF record AS $$
  SELECT id, name FROM my_table WHERE name = 'a \`backtick\`, a \${dollarbrace}, and a backslash \\ here'
$$ LANGUAGE sql;
`,
  );

  const modulePath = path.join(
    process.cwd(),
    "test",
    "weird-generated.test-tmp.ts",
  );
  await fs.writeFile(
    modulePath,
    `import type { Pool } from "pg";\n${generated}`,
    "utf-8",
  );
  try {
    const mod = await import(modulePath);
    let capturedText: string | undefined;
    const fakePool = {
      query: async (opts: { text: string }) => {
        capturedText = opts.text;
        return { rows: [] };
      },
    };
    await mod.weird(fakePool as any, {});
    assert.match(
      capturedText!,
      /a `backtick`, a \$\{dollarbrace\}, and a backslash/,
    );
  } finally {
    await fs.unlink(modulePath);
  }
});
