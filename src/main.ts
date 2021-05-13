import {
  parse,
  Statement,
  // astVisitor,
  NodeLocation,
  QName,
  Name,
  DataTypeDef,
  SelectFromStatement,
  PGNode,
  From,
  CreateTableStatement,
  CreateViewStatement,
  AlterTableStatement,
  SelectStatement,
  Expr,
  CreateFunctionStatement,
  CreateMaterializedViewStatement,
  ColumnConstraint,
} from "pgsql-ast-parser";
import * as fs from "fs/promises";
import { Optional } from "pgsql-ast-parser/utils";

go();

type Type = {
  kind: { kind: "basic"; name: QName } | { kind: "array"; inner: Type }; // type or domain
  nullable: boolean;
  hasDefault: boolean;
};

const BuiltinTypes = {
  Boolean: {
    domain_schema: null,
    domain_name: null,
    udt_schema: "pg_catalog",
    udt_name: "bool",
    nullable: false,
  },
};

type Relation = {
  kind: "table" | "view" | "function ? much more";
  columns: { name: Name; type: Type }[];
};

type Global = {
  readonly tables: ReadonlyArray<{
    readonly name: QName;
    readonly rel: Relation;
  }>;
  readonly views: ReadonlyArray<{
    readonly name: QName;
    readonly rel: Relation;
  }>;
};

// "Global" scoping: per function call or prepared statement
type PosArg = { i: number; type: Type };
type PosArgs = PosArg[];
type Returns = {
  name: string /* ? */;
  type: Type;
}[];

// Lexical scoping
type Context = {
  readonly decls: ReadonlyArray<{
    readonly name: QName;
    readonly type:
      | DataTypeDef // function parameters, let bindings
      | Relation; // from-tables, from-views, with, (temp tables?)
  }>;
};

function notImplementedYet(n: PGNode): any {
  return broken("Not implemented yet", n);
}

function mkType(t: DataTypeDef, cs: ColumnConstraint[]): Type {
  const nullable = cs.some(
    (c) => c.type === "not null" || c.type === "primary key"
  );

  const hasDefault = cs.some((c) => c.type === "default");

  return {
    kind:
      t.kind === "array"
        ? { kind: "array", inner: mkType(t.arrayOf, [{ type: "not null" }]) }
        : { kind: "basic", name: t },
    nullable,
    hasDefault,
  };
}

function doCreateTable(g: Global, s: CreateTableStatement): Global {
  if ((s.inherits || []).length !== 0) {
    // Reusing the columns is not hard (see LIKE TABLE)
    // but subsequent alters to the parent table(s) also alter the children
    // so that's a bit more work. Not a huge amount though, just didnt do it yet
    throw new Error("INHERITS is not supported yet");
  }
  const columns = s.columns.flatMap(function (c) {
    if (c.kind === "like table") {
      const targetTable = c.like;
      const found = g.tables.find((t) => eqQNames(t.name, targetTable));
      if (!found) {
        throw new Error(
          broken(
            `LIKE TABLE clause: Couldn't find table ${showQName(targetTable)}`,
            c
          )
        );
      }
      return found.rel.columns;
    } else {
      return [
        {
          name: c.name,
          type: mkType(c.dataType, c.constraints),
        },
      ];
    }
  });
  return {
    ...g,
    tables: g.tables.concat({
      name: s.name,
      rel: {
        kind: "table",
        columns: columns,
      },
    }),
  };
}
function doCreateView(
  g: Global,
  s: CreateViewStatement | CreateMaterializedViewStatement
): Global {
  return notImplementedYet(s);
}
function doAlterTable(g: Global, s: AlterTableStatement): Global {
  return notImplementedYet(s);
}

function doSelect(g: Global, s: SelectStatement): [PosArgs, Returns] {
  return notImplementedYet(s);
}
type HandledFrom = { name: QName; rel: Relation };
type Nullable<T> = T | null;

function findRel(g: Global, n: QName): Nullable<Relation> {
  const t = g.tables.find((t) => eqQNames(t.name, n));
  if (t) {
    return t.rel;
  } else {
    const v = g.views.find((v) => eqQNames(v.name, n));
    if (v) {
      return v.rel;
    } else {
      return null;
    }
  }
}

function showLocation(loc: NodeLocation | undefined): string {
  if (!loc) {
    return "??";
  } else {
    return loc.start + " - " + loc.end;
  }
}

class UnknownIdentifier extends Error {
  constructor(m: QName) {
    super(`UnknownIdentifier ${showQName(m)} @ ${showLocation(m._location)}`);
  }
}
class FailedUnification extends Error {
  constructor(e: Error) {
    super(`FailedUnification: ${e.message}}`);
  }
}

function isError<U>(a: Error | U): a is Error {
  return a instanceof Error;
}

function mergeHandledFroms(c: Context, handledFroms: HandledFrom[]): Context {
  throw new Error("not implemented yet");
}

function doSingleFrom(
  g: Global,
  c: Context,
  p: PosArgs,
  handledFroms: HandledFrom[],
  f: From
): [HandledFrom[], PosArgs] {
  if (f.type === "statement") {
    return notImplementedYet(f);
  } else if (f.type === "call") {
    return notImplementedYet(f);
  } else {
    if ((f.name.columnNames || []).length > 0) {
      notImplementedYet(f);
    }
    const foundRel = findRel(g, f.name);
    if (!foundRel) {
      throw new UnknownIdentifier(f.name);
    }

    const newHandledFrom = {
      name: f.name.alias
        ? {
            name: f.name.alias,
            _location: f.name._location,
          }
        : f.name,
      rel:
        f.join && (f.join.type === "FULL JOIN" || f.join.type === "LEFT JOIN")
          ? nullifyRel(foundRel)
          : foundRel,
    };

    const newHandledFroms =
      f.join && (f.join.type === "FULL JOIN" || f.join.type === "RIGHT JOIN")
        ? handledFroms.map((fr) => ({ ...fr, rel: nullifyRel(fr.rel) }))
        : handledFroms;

    const newP = f.join?.on
      ? unify(
          mergeHandledFroms(c, newHandledFroms),
          p,
          f.join.on,
          BuiltinTypes.Boolean
        )
      : p;

    if (isError(newP)) {
      throw new FailedUnification(newP);
    } else {
      return [newHandledFroms.concat(newHandledFrom), newP];
    }
  }
}
function doFroms(
  g: Global,
  c: Context,
  p: PosArgs,
  froms: From[]
): [Context, PosArgs] {
  const inFroms: [HandledFrom[], PosArgs] = froms.reduce(
    function (acc: [HandledFrom[], PosArgs], f: From) {
      return doSingleFrom(g, c, acc[1], acc[0], f);
    },
    [[], p]
  );
  return [
    {
      decls: c.decls.concat(
        inFroms[0].map(function (f) {
          return {
            name: f.name,
            type: f.rel,
          };
        })
      ),
    },
    inFroms[1],
  ];
}

function unify(c: Context, p: PosArgs, e: Expr, t: Type): Error | PosArgs {
  return notImplementedYet(e);
}

function doCreateFunc(
  g: Global,
  s: CreateFunctionStatement
): [QName, PosArgs, Returns] {
  return notImplementedYet(s);
}

function broken(mess: string, node?: PGNode) {
  return node
    ? mess +
        `: \n
${JSON.stringify(node)} @ ${node._location}`
    : mess;
}

function parseSetupScripts(ast: Statement[]): Global {
  return ast.reduce(
    (acc: Global, a): Global => {
      if (a.type === "create table" && !a.temporary) {
        return doCreateTable(acc, a);
      } else if (
        a.type === "create view" ||
        a.type === "create materialized view"
      ) {
        return doCreateView(acc, a);
      } else if (a.type === "alter table") {
        return doAlterTable(acc, a);
      } else {
        return acc;
      }
    },
    { tables: [], views: [] }
  );
}

function findInContext(
  ctx: Context,
  name: string,
  table?: QName
): Type | Relation {
  // TODO
}

function nullifyRel(d: Relation): Relation {
  // TODO
}

function expectNever(_: never): any {
  throw new Error("Broken");
}

function elabFrom(ctx: Context, from: From): [Context, Bindings] {}

function elabSelectFrom(
  global: { tables: Table[] },
  st: SelectFromStatement
): Select {
  const froms: FromItem[] = elabFrom(global, st.from || []);

  const output: [string, DataTypeDef][] = (st.columns || []).map((c) => {
    const name = c.alias?.name || "todo";
    if (c.expr.type === "ref") {
      if (c.expr.name === "*") {
        throw new Error(broken(`"*" Expr not supported`, c));
      } else {
        return [name, resolveName(froms, c.expr.name, c.expr.table)];
      }
    } else {
      throw new Error(broken(`Expr not supported`, c));
    }
  });

  return { input: [], output: Object.fromEntries(output) };
}

async function go() {
  const f = await fs.readFile("./test.sql", "utf-8");

  const ast: Statement[] = parse(f);

  console.log(JSON.stringify(ast));

  const tables = parseSetupScripts(ast);

  ast.forEach(function (st) {
    if (st.type === "select") {
      const elab = elabSelectFrom({ tables }, st);
      console.log("Select: ", elab);
    } else if (st.type === "union" || st.type === "union all") {
      throw new Error(broken(`UNION: Not implemented yet`, st));
    } else if (st.type === "with") {
      throw new Error(broken(`WITH: Not implemented yet`, st));
    } else if (st.type === "with recursive") {
      throw new Error(broken(`WITH RECURSIVE: Not implemented yet`, st));
    } else if (st.type === "values") {
      throw new Error(broken(`VALUES: Not implemented yet`, st));
    }
  });

  console.log(tables);
}

// const visitor = astVisitor((map) => ({
//   createTable: (st) => {
//     map.super().createTable(st);
//   },
//   // implement here AST parts you want to hook
//   tableRef: (t) => tables.push(t.name),
//   join: (t) => {
//     // joins++;
//     // call the default implementation of 'join'
//     // this will ensure that the subtree is also traversed.
//     map.super().join(t);
//   },
// }));

function showQName(n: QName): string {
  return n.schema ? n.schema + "." + n.name : n.name;
}

function mapPartial<T, U>(a: T[], f: (t: T, i: number) => U | null): U[] {
  const newA: U[] = [];
  a.forEach(function (a, i) {
    const res = f(a, i);
    if (res === null) {
    } else {
      newA.push(res);
    }
  });
  return newA.reverse();
}

function flatMapPartial<T, U>(a: T[], f: (t: T, i: number) => U[] | null): U[] {
  const newA: U[] = [];
  a.forEach(function (a, i) {
    const res = f(a, i);
    if (res === null) {
    } else {
      newA.push(...res);
    }
  });
  return newA.reverse();
}

function eqQNames<U extends QName, V extends QName>(u: U, v: V): boolean {
  return (
    u.name === v.name &&
    ((!u.schema && v.schema === "dbo") ||
      (u.schema === "dbo" && !v.schema) ||
      (!u.schema && !v.schema) ||
      u.schema === v.schema)
  );
}
