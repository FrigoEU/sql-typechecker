import {
  parse,
  Statement,
  // astVisitor,
  QName,
  Name,
  DataTypeDef,
  SelectFromStatement,
  PGNode,
  From,
} from "pgsql-ast-parser";
import * as fs from "fs/promises";

go();

type Table = {
  type: "table";
  name: QName;
  columns: { name: Name; dataType: DataTypeDef }[];
};

type FromItem = {
  type: "table" | "view" | "function ? much more";
  name: QName;
  columns: { name: Name; dataType: DataTypeDef }[];
};

function broken(mess: string, node?: PGNode) {
  return node
    ? mess +
        `: \n
${JSON.stringify(node)} @ ${node._location}`
    : mess;
}

function parseSetupScripts(ast: Statement[]) {
  const tables: Table[] = [];

  // TODO: create view
  // TODO: alter table

  ast.forEach((a) => {
    if (a.type === "create table" && !a.temporary) {
      if ((a.inherits || []).length !== 0) {
        // Reusing the columns is not hard (see LIKE TABLE)
        // but subsequent alters to the parent table(s) also alter the children
        // so that's a bit more work. Not a huge amount though, just didnt do it yet
        throw new Error("INHERITS is not supported yet");
      }
      const ownColumns = a.columns.flatMap(function (c) {
        if (c.kind === "like table") {
          const targetTable = c.like;
          const found = tables.find((t) => eqQNames(t.name, targetTable));
          if (!found) {
            throw new Error(
              broken(
                `LIKE TABLE clause: Couldn't find table ${showQName(
                  targetTable
                )}`,
                c
              )
            );
          }
          return found.columns;
        } else {
          return [
            {
              name: c.name,
              dataType: c.dataType,
            },
          ];
        }
      });
      return tables.push({
        type: "table",
        name: a.name,
        columns: ownColumns,
      });
    } else {
      if (a.type === "select") {
      } else {
        return null;
      }
    }
  });

  return tables;
}

type Select = {
  input: DataTypeDef[];
  output: { [key: string]: DataTypeDef };
};

function resolveName(
  froms: FromItem[],
  name: string,
  table?: QName
): DataTypeDef {
  // TODO
}

function nullify(d: DataTypeDef): DataTypeDef {
  // TODO
}

function expectNever(_: never): any {
  throw new Error("Broken");
}

function elabFrom(global: { tables: Table[] }, from: From[]): FromItem[] {
  const toMakeNullable: number[] = flatMapPartial(from, (f, i) => {
    if (f.join === null || f.join === undefined) {
      return null;
    } else {
      if (f.join.type === "INNER JOIN") {
        return null;
      } else if (f.join.type === "LEFT JOIN") {
        return [i];
      } else if (f.join.type === "RIGHT JOIN") {
        // right join => all but this one nullable
        return mapPartial(from, (_, j) => (i === j ? null : j));
      } else if (f.join.type === "FULL JOIN") {
        return from.map((_, i) => i); // full join => all nullable
      } else {
        return expectNever(f.join.type);
      }
    }
  });

  return from.map((f, i) => {
    if (f.type === "statement") {
      throw new Error(broken(`From Statement not supported`, f));
    } else if (f.type === "call") {
      throw new Error(broken(`From Call not supported`, f));
    } else {
      if ((f.name.columnNames || []).length > 0) {
        throw new Error(broken(`QNameMapped not supported`, f));
      }
      const found = global.tables.find((t) => eqQNames(t.name, f.name));
      if (!found) {
        throw new Error("");
      }
      return {
        type: "table",
        name: f.name.alias
          ? { name: f.name.alias, _location: f.name._location }
          : f.name,
        columns: toMakeNullable.includes(i)
          ? found.columns.map((c) => ({
              name: c.name,
              dataType: nullify(c.dataType),
            }))
          : found.columns,
      };
    }
  });
}

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
