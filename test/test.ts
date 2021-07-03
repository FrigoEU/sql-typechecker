import { Expect, Test, TestCase, TestFixture } from "alsatian";
import { parse, SelectFromStatement } from "pgsql-ast-parser";
import {
  doSelectFrom,
  ParametrizedT,
  parseSetupScripts,
  SetT,
  SimpleT,
  UnifVars,
  TypeMismatch,
} from "../src/typecheck";

// https://github.com/alsatian-test/alsatian/blob/master/packages/alsatian/README.md

function testSelectFrom(
  setupStr: string,
  queryStr: string,
  cont: (_: { returnT: SetT; unifvars: UnifVars }) => void
) {
  const g = parseSetupScripts(parse(setupStr));
  const query = parse(queryStr);
  if (query[0].type === "select") {
    const [returnT, us] = doSelectFrom(
      g,
      { decls: [], aliases: [] },
      new UnifVars(0, {}, {}),
      query[0]
    );
    cont({ returnT, unifvars: us });
  } else {
    throw new Error("Bad test setup");
  }
}

@TestFixture("Typechecker")
export class TypecheckerTests {
  @Test("Basic test")
  public basicTest() {
    testSelectFrom(
      "create table testje ( id int not null, name text );",
      `
select id, name
from testje
where id = $1
and $2 = name
`,
      function ({ returnT, unifvars: us }) {
        const expectedResultType: SetT = {
          kind: "set",
          fields: [
            {
              name: { name: "id" },
              type: { kind: "simple", name: { name: "integer" } },
            },
            {
              name: { name: "name" },
              type: {
                kind: "parametrized",
                name: "nullable",
                typevar: { kind: "simple", name: { name: "text" } },
              },
            },
          ],
        };
        Expect(returnT).toEqual(expectedResultType);

        Expect(us.getKeys().length).toEqual(2);

        const expectedParam0: SimpleT = {
          kind: "simple",
          name: { name: "integer" },
        };
        Expect(us.lookup(1)[0]).toEqual(expectedParam0);

        const expectedParam1: ParametrizedT<SimpleT> = {
          kind: "parametrized",
          name: "nullable",
          typevar: { kind: "simple", name: { name: "text" } },
        };
        Expect(us.lookup(2)[0]).toEqual(expectedParam1);
      }
    );
  }

  @TestCase(`select somethingsomething from testje`)
  @TestCase(`select * from somethingsomething`)
  @Test("Unknown identifier")
  public unknownIdentifierTest(queryStr: string) {
    const setup = "create table testje ( id int not null, name text );";
    const g = parseSetupScripts(parse(setup));
    const query = parse(queryStr);
    Expect(() =>
      query[0].type === "select"
        ? doSelectFrom(
            g,
            { decls: [], aliases: [] },
            new UnifVars(0, {}, {}),
            query[0]
          )
        : null
    ).toThrow();
  }

  @TestCase(`
select id from testje
where id = $1
and $2 = name
and $1 = $2
`)
  @TestCase(`
select id from testje
where id = 'test'
`)
  @TestCase(`
select id from testje
where name = 5
`)
  @TestCase(`
select id from testje
where name = id
`)
  @Test("Type mismatch")
  public typeMismatchTest(queryStr: string) {
    const setup = "create table testje ( id int not null, name text );";
    const g = parseSetupScripts(parse(setup));
    const query = parse(queryStr);
    Expect(() =>
      query[0].type === "select"
        ? doSelectFrom(
            g,
            { decls: [], aliases: [] },
            new UnifVars(0, {}, {}),
            query[0]
          )
        : null
    ).toThrow();
  }

  @Test("Two unifvars test")
  public twoUnifvarsTest() {
    testSelectFrom(
      "create table testje ( id int not null, name text );",
      `
select id, name
from testje
where id = $1
and $1 = $2
`,
      function ({ returnT, unifvars: us }) {
        const expectedResultType: SetT = {
          kind: "set",
          fields: [
            {
              name: { name: "id" },
              type: { kind: "simple", name: { name: "integer" } },
            },
            {
              name: { name: "name" },
              type: {
                kind: "parametrized",
                name: "nullable",
                typevar: { kind: "simple", name: { name: "text" } },
              },
            },
          ],
        };
        Expect(returnT).toEqual(expectedResultType);

        Expect(us.getKeys().length).toEqual(2);

        const expectedParam0: SimpleT = {
          kind: "simple",
          name: { name: "integer" },
        };
        Expect(us.lookup(1)[0]).toEqual(expectedParam0);
        Expect(us.lookup(2)[0]).toEqual(expectedParam0);
      }
    );
  }

  @Test("Two unifvars no unification")
  public twoUnifvarsNoUnificationTest() {
    testSelectFrom(
      "create table testje ( id int not null, name text );",
      `
select id, name
from testje
where $1 = $2
`,
      function ({ unifvars: us }) {
        Expect(us.getKeys().length).toEqual(2);

        Expect(us.lookup(1)[0]).toEqual(null);
        Expect(us.lookup(2)[0]).toEqual(null);
      }
    );
  }

  @Test("Two unifvars late unif")
  @TestCase(`
select id, name
from testje
where $1 = $2
and $1 = id
`)
  @TestCase(`
select id, name
from testje
where $1 = $2
and $2 = id
`)
  @TestCase(`
select id, name
from testje
where $1 = $2
and $2 = $3
and $1 = id 
`)
  public twoUnifvarsLateUnif(queryStr: string) {
    testSelectFrom(
      "create table testje ( id int not null, name text );",
      queryStr,
      function ({ unifvars: us }) {
        const expectedParam: SimpleT = {
          kind: "simple",
          name: { name: "integer" },
        };
        us.getKeys().forEach(function (k) {
          Expect(us.lookup(k)[0]).toEqual(expectedParam);
        });
      }
    );
  }

  @Test("Qualified select")
  public qualifiedSelect() {
    testSelectFrom(
      "create table testje ( id int not null, name text );",
      `select testje.id, id from testje`,
      function ({ returnT, unifvars: us }) {
        const expectedParam: SimpleT = {
          kind: "simple",
          name: { name: "integer" },
        };
        const f = returnT.fields[0];
        Expect(f.type).toEqual(expectedParam);
        Expect(f.name).toEqual({ name: "id" });

        const f2 = returnT.fields[1];
        Expect(f2.type).toEqual(expectedParam);
        Expect(f2.name).toEqual({ name: "id" });
      }
    );
  }

  @Test("Operator")
  public operator() {
    testSelectFrom(
      "create table testje ( id int not null, name text );",
      `select id + 1 from testje`,
      function ({ returnT, unifvars: us }) {
        const expectedParam: SimpleT = {
          kind: "simple",
          name: { name: "integer" },
        };
        const f = returnT.fields[0];
        Expect(f.type).toEqual(expectedParam);
      }
    );
  }
}
