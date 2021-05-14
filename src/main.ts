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
  SelectedColumn,
  ExprParameter,
  ExprRef,
} from "pgsql-ast-parser";
import * as fs from "fs/promises";

go();

type ScalarT = {
  kind: "scalar";
  name: QName;
  nullable: boolean;
};
type UnknownT = {
  kind: "unknown";
};
type ArrayT = {
  kind: "array";
  inner: ScalarT | ArrayT;
  nullable: boolean;
};
type Field = {
  name: Name | null;
  type: ScalarT | ArrayT | UnifVar;
};
type SetT = {
  kind: "set";
  fields: Field[];
};
type UnifVar = {
  kind: "unifvar";
  index: number; // eg: "$1" -> 1
};

const BuiltinTypes: { [name: string]: ScalarT } = {
  Boolean: {
    kind: "scalar",
    name: { name: "bool", schema: "pg_catalog" },
    nullable: false,
  },
  Integer: {
    kind: "scalar",
    name: { name: "int8", schema: "pg_catalog" },
    nullable: false,
  },
};

type Global = {
  readonly tables: ReadonlyArray<{
    readonly name: QName;
    readonly rel: SetT;
    readonly defaults: Name[];
  }>;
  readonly views: ReadonlyArray<{
    readonly name: QName;
    readonly rel: SetT;
  }>;
};

// "Global" scoping: per function call or prepared statement
type Parameter = {
  index: number;
  type: ScalarT | ArrayT | UnknownT;
  unificatedExpressions: Expr[];
};
// In UrWeb, unification variables are implemented as ref's. This is I think because you can introduce these anywhere, and reference them anywhere, so it becomes very hard to keep them up-to-date in the whole context. In SQL however, you cant just introduce new free variables. You can only do this at the statement level for prepared statements, or in a CREATE FUNCTION statement, and neither can be nested. So you can have a single "global" array of these free variables that always contains the most recent "judgement" of what type these parameters should be.
// Parameters are scoped differently from the context though: In the context we add things for example when going through a "FROM" using lexical scoping. Once the scope of that "SELECT" is done, these bindings are no longer present. We represent this with an immutable context object and the JS call stack. Parameters however are global: Deep in an expression somewhere a parameter can be referenced (= introduced) and / or unified. Another statement, somewhere in a completely lexical scope, can reference the same parameter. This list of parameters only gets "reset" at very specific times: At the end of a "CREATE FUNCTION" statement, or at the end of a prepared statement.
// Positional parameters don't have to be declared in advance, so every step has to pass the same "conceptually mutable" array of parameters around. We do keep this immutable however, so we can more easily follow the state of this array every step of the way. It is however annoying and error-prone that every step that can influence this array has to merge it and pass it along.
// Hmm, what if we do just keep this as a mutable array of name -> type bindings? That means that you can't "keep" an instance of the array around and refer to that current state later on (unless you explicitely clone it). In UrWeb that was annoying because these were everywhere in the "Elab"'d data structure which we wanted to cache and that was because of those ref's not possible, but this array isn't like that. It's a single almost-global array, introduced at very specific places, never nested, so it's probably useless to keep it immutable... Alright, I'm convinced, the (syntactical) overhead of keeping this immutable is not worth it. Let's keep the actual mutation of this array only in the "unification" part of things though
// Actually, I'm gonna try and keep it immutable anyway, until it becomes really annoying
type Parameters = ReadonlyArray<Parameter>;

// Lexical scoping
type Context = {
  readonly decls: ReadonlyArray<{
    readonly name: QName;
    readonly type:
      | ScalarT // let bindings
      | ArrayT // let bindings
      | SetT; // from-tables, from-views, with, (temp tables?)
  }>;
  readonly aliases: ReadonlyArray<{
    // the names of function parameters are aliases to the positional parameters
    readonly name: QName;
    readonly targetIndex: number;
  }>;
};

function notImplementedYet(node: PGNode): any {
  throw new NotImplementedYet(node);
}

function mkType(t: DataTypeDef, cs: ColumnConstraint[]): ScalarT | ArrayT {
  const nullable = cs.some(
    (c) => c.type === "not null" || c.type === "primary key"
  );

  return t.kind === "array"
    ? {
        kind: "array",
        inner: mkType(t.arrayOf, [{ type: "not null" }]),
        nullable,
      }
    : { kind: "scalar", name: t, nullable };
}

function doCreateTable(g: Global, s: CreateTableStatement): Global {
  if ((s.inherits || []).length !== 0) {
    // Reusing the columns is not hard (see LIKE TABLE)
    // but subsequent alters to the parent table(s) also alter the children
    // so that's a bit more work. Not a huge amount though, just didnt do it yet
    throw new Error("INHERITS is not supported yet");
  }
  const [fields, defaults] = s.columns.reduce(
    function (acc: [Field[], Name[]], c) {
      if (c.kind === "like table") {
        const targetTable = c.like;
        const found = g.tables.find((t) => eqQNames(t.name, targetTable));
        if (!found) {
          throw new UnknownIdentifier(targetTable);
        }
        return [acc[0].concat(found.rel.fields), acc[1].concat(found.defaults)];
      } else {
        return [
          acc[0].concat({
            name: c.name,
            type: mkType(c.dataType, c.constraints || []),
          }),
          (c.constraints || []).some((c) => c.type === "default")
            ? acc[1].concat(c.name)
            : acc[1],
        ];
      }
    },
    [[], []]
  );
  return {
    ...g,
    tables: g.tables.concat({
      name: s.name,
      rel: {
        kind: "set",
        fields,
      },
      defaults,
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

function deriveNameFromExpr(expr: Expr): Name | null {
  if (expr.type === "ref") {
    return { name: expr.name };
  } else {
    return notImplementedYet(expr);
  }
}

function doSelectFrom(
  g: Global,
  c: Context,
  p: Parameters,
  s: SelectFromStatement
): [SetT, Parameters] {
  const [newC, newP__]: [Context, Parameters] = doFroms(g, c, p, s.from || []);

  const newP_ = s.where
    ? (function () {
        const [t, newP] = elabExpr(newC, newP__, s.where);
        if (t !== BuiltinTypes.Boolean) {
          throw new TypeMismatch(s.where, {
            expected: BuiltinTypes.Boolean,
            actual: t,
          });
        }
        return newP;
      })()
    : newP__;

  if (isError(newP_)) {
    throw newP_;
  }

  const [fields, newP] = (s.columns || []).reduce(
    (acc: [Field[], Parameters], c: SelectedColumn): [Field[], Parameters] => {
      const n = c.alias ? c.alias : deriveNameFromExpr(c.expr);

      const [t, newP] = elabExpr(newC, acc[1], c.expr);

      if (t.kind === "set") {
        throw new KindMismatch(c.expr, t, "Can only be scalar or array type");
      }

      const field: Field = { name: n, type: t };

      return [acc[0].concat(field), newP];
    },
    [[], newP_]
  );
  return [
    {
      kind: "set",
      fields,
    },
    newP,
  ];
}

type HandledFrom = { name: QName; rel: SetT };
type Nullable<T> = T | null;

function findRel(g: Global, n: QName): Nullable<SetT> {
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

class NotImplementedYet extends Error {
  constructor(node: PGNode) {
    const m = node
      ? `: \n
${JSON.stringify(node)} @ ${node._location}`
      : "";
    super(`NotImplementedYet: ${m}`);
  }
}

class UnknownField extends Error {
  constructor(s: SetT, n: Name) {
    super(
      `UnknownField ${n.name} @ ${showLocation(
        n._location
      )} in ${JSON.stringify(s)}`
    );
  }
}
class UnknownIdentifier extends Error {
  constructor(m: QName) {
    super(`UnknownIdentifier ${showQName(m)} @ ${showLocation(m._location)}`);
  }
}
class AmbiguousIdentifier extends Error {
  constructor(m: QName, sets: QName[]) {
    super(
      `AmbiguousIdentifier ${showQName(m)} @ ${showLocation(
        m._location
      )} present in ${JSON.stringify(sets)}`
    );
  }
}
class KindMismatch extends Error {
  constructor(
    e: Expr,
    expected: ScalarT | ArrayT | SetT | UnifVar,
    actual: string
  ) {
    super(`KindMismatch: ${e}: ${expected} vs ${actual}}`);
  }
}
class TypeMismatch extends Error {
  constructor(
    e: Expr,
    ts: {
      expected: ScalarT | ArrayT | SetT | UnifVar;
      actual: ScalarT | ArrayT | SetT | UnifVar;
    }
  ) {
    super(`TypeMismatch: ${e}: ${ts.expected} vs ${ts.actual}}`);
  }
}

function isError<U>(a: Error | U): a is Error {
  return a instanceof Error;
}

function mergeHandledFroms(c: Context, handledFroms: HandledFrom[]): Context {
  return {
    ...c,
    decls: c.decls.concat(
      handledFroms.map(function (f) {
        return {
          name: f.name,
          type: f.rel,
        };
      })
    ),
  };
}

function doSingleFrom(
  g: Global,
  c: Context,
  p: Parameters,
  handledFroms: HandledFrom[],
  f: From
): [HandledFrom[], Parameters] {
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
          ? nullifySet(foundRel)
          : foundRel,
    };

    const newHandledFroms =
      f.join && (f.join.type === "FULL JOIN" || f.join.type === "RIGHT JOIN")
        ? handledFroms.map((fr) => ({ ...fr, rel: nullifySet(fr.rel) }))
        : handledFroms;

    const newP = f.join?.on
      ? (function () {
          const [t, newP] = elabExpr(
            mergeHandledFroms(c, newHandledFroms),
            p,
            f.join.on
          );
          if (t !== BuiltinTypes.Boolean) {
            throw new TypeMismatch(f.join.on, {
              expected: BuiltinTypes.Boolean,
              actual: t,
            });
          } else {
            return newP;
          }
        })()
      : p;

    if (isError(newP)) {
      throw newP;
    } else {
      return [newHandledFroms.concat(newHandledFrom), newP];
    }
  }
}
function doFroms(
  g: Global,
  c: Context,
  p: Parameters,
  froms: From[]
): [Context, Parameters] {
  const inFroms: [HandledFrom[], Parameters] = froms.reduce(
    function (acc: [HandledFrom[], Parameters], f: From) {
      return doSingleFrom(g, c, acc[1], acc[0], f);
    },
    [[], p]
  );
  return [mergeHandledFroms(c, inFroms[0]), inFroms[1]];
}

function lookup(
  c: Context,
  n: QName
): ScalarT | ArrayT | SetT | UnifVar | null {
  const foundAlias = c.aliases.find((a) => eqQNames(a.name, n));
  if (foundAlias) {
    return { kind: "unifvar", index: foundAlias.targetIndex };
  } else {
    const found = c.decls.find((d) => eqQNames(d.name, n));
    if (found) {
      return found.type;
    } else {
      return null;
    }
  }
}

function extractIndexFromParameter(e: ExprParameter): number {
  if (e.name.startsWith("$")) {
    const sub = e.name.substring(1);
    const parsed = parseInt(sub);
    if (isNaN(parsed)) {
      throw new Error(`Failed to parse parameter ${JSON.stringify(e)}`);
    } else {
      return parsed;
    }
  } else {
    throw new Error(`Failed to parse parameter ${JSON.stringify(e)}`);
  }
}

function lookupInSet(s: SetT, name: Name): ScalarT | ArrayT | UnifVar | null {
  const found = s.fields.find((f) => f.name && f.name.name === name.name);
  if (found) {
    return found.type;
  } else {
    return null;
  }
}

// function isSet(t: ScalarT | ArrayT | SetT): t is SetT{
//   retur
// }

function elabRef(c: Context, e: ExprRef): ScalarT | ArrayT | SetT | UnifVar {
  if (e.name === "*") {
    return notImplementedYet(e);
  } else {
    if (e.table) {
      const table = lookup(c, e.table);
      if (!table) {
        throw new UnknownIdentifier(e.table);
      }
      if (!(table.kind === "set")) {
        throw new KindMismatch(e, table, "Expecting Set");
      }
      const field = lookupInSet(table, e);
      if (!field) {
        throw new UnknownField(table, e);
      }
      return field;
    } else {
      const foundFields: {
        set: QName;
        field: Name;
        type: ScalarT | ArrayT | UnifVar;
      }[] = mapPartial(c.decls, (t) => {
        if (t.type.kind === "set") {
          const foundfield = lookupInSet(t.type, e);
          return foundfield
            ? { set: t.name, field: e, type: foundfield }
            : null;
        }
        return null;
      });
      if (foundFields.length === 0) {
        throw new UnknownIdentifier(e);
      } else if (foundFields.length === 1) {
        return foundFields[0].type;
      }
      // if (foundFields.length > 0)
      throw new AmbiguousIdentifier(
        e,
        foundFields.map((f) => f.set)
      );
    }
  }
}

function elabExpr(
  c: Context,
  p: Parameters,
  e: Expr
): [ScalarT | ArrayT | SetT | UnifVar, Parameters] {
  if (e.type === "ref") {
    const t = elabRef(c, e);
    return [t, p];
  } else if (e.type === "parameter") {
    return [{ kind: "unifvar", index: extractIndexFromParameter(e) }, p];
  } else if (e.type === "integer") {
    return [BuiltinTypes.Integer, p];
  } else if (e.type === "boolean") {
    return [BuiltinTypes.Boolean, p];
  } else {
    return notImplementedYet(e);
  }
}

function doCreateFunc(
  g: Global,
  s: CreateFunctionStatement
): [QName, Parameters, SetT] {
  // introduce named parameters = aliases!
  return notImplementedYet(s);
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

function nullifySet(s: SetT): SetT {
  return {
    kind: "set",
    fields: s.fields.map((c) => ({
      name: c.name,
      type: { ...c.type, nullable: true },
    })),
  };
}

function expectNever(_: never): any {
  throw new Error("Oops didn't expect that");
}

async function go() {
  const f = await fs.readFile("./test.sql", "utf-8");

  const ast: Statement[] = parse(f);

  console.log(JSON.stringify(ast));

  const g = parseSetupScripts(ast);

  console.log("Global", g);

  ast.forEach(function (st) {
    if (st.type === "select") {
      const elab = doSelectFrom(g, { decls: [], aliases: [] }, [], st);
      console.log("Select: ", JSON.stringify(elab));
    } else if (st.type === "union" || st.type === "union all") {
      return notImplementedYet(st);
    } else if (st.type === "with") {
      return notImplementedYet(st);
    } else if (st.type === "with recursive") {
      return notImplementedYet(st);
    } else if (st.type === "values") {
      return notImplementedYet(st);
    }
  });
}

function showQName(n: QName): string {
  return n.schema ? n.schema + "." + n.name : n.name;
}

function mapPartial<T, U>(
  a: Array<T> | ReadonlyArray<T>,
  f: (t: T, i: number) => U | null
): U[] {
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
