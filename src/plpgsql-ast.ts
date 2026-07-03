import {
  loadModule as loadPlPgSqlModule,
  parsePlPgSQLSync,
} from "@libpg-query/parser";
import { deparseSync } from "pgsql-deparser";
import type { CreateFunctionStmt, Node } from "@pgsql/types";

export { loadPlPgSqlModule };

// Minimal PL/pgSQL AST types — @pgsql/types has no coverage for these yet,
// so only the shapes this typechecker actually inspects are declared.
export type PLpgSQLStmt =
  | { PLpgSQL_stmt_block: { body?: PLpgSQLStmt[] } }
  | {
      PLpgSQL_stmt_return_query: {
        query: { PLpgSQL_expr: { query: string } };
      };
    };
export type PLpgSQLFunction = {
  action?: { PLpgSQL_stmt_block: { body?: PLpgSQLStmt[] } };
};

// Parse a CREATE FUNCTION ... LANGUAGE plpgsql statement's body into a PL/pgSQL AST.
// The dedicated plpgsql parser needs the whole CREATE FUNCTION statement (not just the
// body text), so the already-parsed node is deparsed back to SQL first.
export function parsePlPgSqlFunction(s: CreateFunctionStmt): PLpgSQLFunction {
  const sql = deparseSync({ CreateFunctionStmt: s } as unknown as Node);
  const result = parsePlPgSQLSync(sql) as {
    plpgsql_funcs?: { PLpgSQL_function: PLpgSQLFunction }[];
  };
  const fn = result.plpgsql_funcs?.[0]?.PLpgSQL_function;
  if (!fn) {
    throw new Error("Failed to parse PL/pgSQL function body");
  }
  return fn;
}
