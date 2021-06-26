import { Expect, Test, TestCase, TestFixture } from "alsatian";
import { parse } from "pgsql-ast-parser";
import {
  doSelectFrom,
  ParametrizedT,
  parseSetupScripts,
  SetT,
  SimpleT,
  UnifVars,
} from "../src/typecheck";

// https://github.com/alsatian-test/alsatian/blob/master/packages/alsatian/README.md

@TestFixture("whatever you'd like to call the fixture")
export class TypecheckerTests {
  // use the async/await pattern in your tests as you would in your code
  // @Test("asychronous test")
  // public async asyncTest() {
  //   const response = await somethingToHappen();

  //   Expect(response).toBeDefined();
  // }

  // pass arguments into your test functions to keep your test code from being repetative
  // @TestCase(2, 2, 4)
  // @TestCase(2, 3, 5)
  // @TestCase(3, 3, 6)
  // @Test("addition tests")
  // public addTest(
  //   firstNumber: number,
  //   secondNumber: number,
  //   expectedSum: number
  // ) {
  //   Expect(firstNumber + secondNumber).toBe(expectedSum);
  // }

  @Test("Basic test")
  public basicTest() {
    const setup = "create table testje ( id int not null, name text );";
    const g = parseSetupScripts(parse(setup));
    const query = parse(`
select id, name
from testje
where id = $1
and $2 = name
`);
    if (query[0].type === "select") {
      const [returnT, us] = doSelectFrom(
        g,
        { decls: [], aliases: [] },
        new UnifVars(0, {}),
        query[0]
      );

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
      Expect(us.lookup({ kind: "unifvar", id: 1 })[0]).toEqual(expectedParam0);

      const expectedParam1: ParametrizedT<SimpleT> = {
        kind: "parametrized",
        name: "nullable",
        typevar: { kind: "simple", name: { name: "text" } },
      };
      Expect(us.lookup({ kind: "unifvar", id: 2 })[0]).toEqual(expectedParam1);
    } else {
      throw new Error("Bad test setup");
    }
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
            new UnifVars(0, {}),
            query[0]
          )
        : null
    ).toThrow();
  }

  @Test("Two unifvars test")
  public twoUnifvarsTest() {
    const setup = "create table testje ( id int not null, name text );";
    const g = parseSetupScripts(parse(setup));
    const query = parse(`
select id, name
from testje
where id = $1
and $1 = $2
`);
    if (query[0].type === "select") {
      const [returnT, us] = doSelectFrom(
        g,
        { decls: [], aliases: [] },
        new UnifVars(0, {}),
        query[0]
      );

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
      Expect(us.lookup({ kind: "unifvar", id: 1 })[0]).toEqual(expectedParam0);
      Expect(us.lookup({ kind: "unifvar", id: 2 })[0]).toEqual(expectedParam0);
    } else {
      throw new Error("Bad test setup");
    }
  }

  @Test("Two unifvars no unification")
  public twoUnifvarsNoUnificationTest() {
    const setup = "create table testje ( id int not null, name text );";
    const g = parseSetupScripts(parse(setup));
    const query = parse(`
select id, name
from testje
where $1 = $2
`);
    if (query[0].type === "select") {
      const [returnT, us] = doSelectFrom(
        g,
        { decls: [], aliases: [] },
        new UnifVars(0, {}),
        query[0]
      );

      Expect(us.getKeys().length).toEqual(2);

      Expect(us.lookup({ kind: "unifvar", id: 1 })[0]).toEqual(null);
      Expect(us.lookup({ kind: "unifvar", id: 2 })[0]).toEqual(null);
    } else {
      throw new Error("Bad test setup");
    }
  }
}
