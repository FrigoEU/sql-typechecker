import {
  loadModule as loadPlPgSqlModule,
  parsePlPgSQLSync,
} from "@libpg-query/parser";
import { deparseSync } from "pgsql-deparser";
import type { CreateFunctionStmt, Node } from "@pgsql/types";

export { loadPlPgSqlModule };

// Minimal PL/pgSQL AST types — @pgsql/types has no coverage for these yet,
// so only the shapes this typechecker actually inspects are declared.
//
// No formal schema (TS types, JSON Schema, protobuf) exists anywhere for this
// JSON shape. When extending these types, the ground truth is upstream:
// - github.com/pganalyze/libpg_query, src/pg_query_json_plpgsql.c — the hand-written
//   JSON serializer. It has one dump_* function per PL/pgSQL statement kind
//   (dump_block, dump_if, dump_loop, dump_return_query, dump_execsql, ...), and each
//   one lists exactly which JSON fields it emits for that node.
// - PostgreSQL source, src/pl/plpgsql/src/plpgsql.h — the PLpgSQL_* C structs that
//   those dump_* functions read from, with comments on what each field means.
export type PLpgSQLExpr = { PLpgSQL_expr: { query: string } };

// dump_if in pg_query_json_plpgsql.c / PLpgSQL_if_elsif in plpgsql.h
export type PLpgSQLIfElsif = {
  PLpgSQL_if_elsif: {
    cond: PLpgSQLExpr;
    stmts: PLpgSQLStmt[];
  };
};

// dump_raise in pg_query_json_plpgsql.c / PLpgSQL_raise_option in plpgsql.h.
// opt_type indexes the PLpgSQL_raise_option_type enum: ERRCODE = 0, MESSAGE = 1,
// DETAIL = 2, HINT = 3, COLUMN = 4, CONSTRAINT = 5, DATATYPE = 6, TABLE = 7, SCHEMA = 8.
export type PLpgSQLRaiseOption = {
  PLpgSQL_raise_option: {
    opt_type: number;
    expr: PLpgSQLExpr;
  };
};

// dump_variable/dump_datum_type in pg_query_json_plpgsql.c / PLpgSQL_type in plpgsql.h
export type PLpgSQLType = { PLpgSQL_type: { typname: string } };

// dump_variable in pg_query_json_plpgsql.c / PLpgSQL_var in plpgsql.h. Emitted for
// every DECLAREd scalar, plus the implicit FOUND var and (in exception blocks) the
// implicit SQLSTATE/SQLERRM vars — none of those synthetic ones carry a lineno.
export type PLpgSQLVar = {
  PLpgSQL_var: {
    refname: string;
    lineno?: number;
    datatype: PLpgSQLType;
    isconst?: boolean;
    default_val?: PLpgSQLExpr;
  };
};

// dump_variable in pg_query_json_plpgsql.c / PLpgSQL_rec in plpgsql.h — a DECLAREd
// RECORD variable. dno is its index into the function's datums array.
export type PLpgSQLRec = {
  PLpgSQL_rec: {
    refname: string;
    dno: number;
    lineno?: number;
  };
};

// dump_variable in pg_query_json_plpgsql.c / PLpgSQL_row in plpgsql.h. Row datums are
// mostly compiler-synthesized (not written in DECLARE) to serve as a multi-column
// `INTO` target; each field's varno indexes back into the function's datums array.
export type PLpgSQLRow = {
  PLpgSQL_row: {
    refname: string;
    lineno?: number;
    fields: { name: string; varno: number }[];
  };
};

export type PLpgSQLDatum = PLpgSQLVar | PLpgSQLRec | PLpgSQLRow;

export type PLpgSQLStmt =
  | { PLpgSQL_stmt_block: { body?: PLpgSQLStmt[] } }
  | {
      PLpgSQL_stmt_return_query: {
        query: PLpgSQLExpr;
      };
    }
  | {
      // dump_execsql in pg_query_json_plpgsql.c / PLpgSQL_stmt_execsql in plpgsql.h —
      // any SQL command that isn't otherwise special-cased, including `SELECT ... INTO`.
      // into/strict/target are only emitted when the statement has an INTO clause; the
      // target is a row (INTO one-or-more plain vars) or rec (INTO a RECORD var).
      PLpgSQL_stmt_execsql: {
        sqlstmt: PLpgSQLExpr;
        into?: boolean;
        strict?: boolean;
        target?: PLpgSQLRow | PLpgSQLRec;
      };
    }
  | {
      // dump_if in pg_query_json_plpgsql.c / PLpgSQL_stmt_if in plpgsql.h
      PLpgSQL_stmt_if: {
        cond: PLpgSQLExpr;
        then_body: PLpgSQLStmt[];
        elsif_list?: PLpgSQLIfElsif[];
        else_body?: PLpgSQLStmt[];
      };
    }
  | {
      // dump_raise in pg_query_json_plpgsql.c / PLpgSQL_stmt_raise in plpgsql.h.
      // elog_level indexes elog.h's level constants: NOTICE = 18, WARNING = 19,
      // EXCEPTION (raised as ERROR) = 21. message/condname/params are all optional
      // since a bare `RAISE;`/`RAISE condname;` re-raises without a message.
      PLpgSQL_stmt_raise: {
        elog_level: number;
        message?: string;
        condname?: string;
        params?: PLpgSQLExpr[];
        options?: PLpgSQLRaiseOption[];
      };
    }
  | {
      // dump_return in pg_query_json_plpgsql.c / PLpgSQL_stmt_return in plpgsql.h.
      // expr is absent for a bare `RETURN;` (implicitly appended to every function
      // body, and valid on its own only for a void-returning function).
      PLpgSQL_stmt_return: {
        expr?: PLpgSQLExpr;
      };
    };
export type PLpgSQLFunction = {
  // The DECLARE section: one entry per declared variable/record/row, in declaration
  // order, plus the implicit vars plpgsql injects (see PLpgSQLVar).
  datums?: PLpgSQLDatum[];
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
