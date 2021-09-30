import { Expect, Ignore, IgnoreTest, Test, TestFixture } from "alsatian";
import { Name, parse, QName } from "pgsql-ast-parser";
import { Either, Left, Right } from "purify-ts";
import {
  doCreateFunction,
  ParametrizedT,
  parseSetupScripts,
  SetT,
  SimpleT,
  UnknownBinaryOp,
} from "../src/typecheck";

// https://github.com/alsatian-test/alsatian/blob/master/packages/alsatian/README.md

function testCreateFunction(
  setupStr: string,
  queryStr: string,
  cont: (
    a: Either<
      Error,
      {
        name: QName;
        inputs: { name: Name; type: SimpleT | ParametrizedT<SimpleT> }[];
        returns: SimpleT | SetT | null;
        multipleRows: boolean;
      }
    >
  ) => void
) {
  const g = parseSetupScripts(parse(setupStr));
  const query = parse(queryStr);
  if (query[0].type === "create function") {
    try {
      const res = doCreateFunction(g, { decls: [] }, query[0]);
      cont(Right(res));
    } catch (err) {
      cont(Left(err));
    }
  } else {
    throw new Error("Bad test setup");
  }
}

@TestFixture("Typechecker")
export class TypecheckerTests {
  @Test("Basic test")
  public basicTest() {
    testCreateFunction(
      "create table testje ( id int not null, name text );",
      `
CREATE FUNCTION myselect(myid int, myname text default null) RETURNS SETOF AS $$
  SELECT id, name
  FROM testje
  WHERE id = myid
  AND myname = name;
$$ LANGUAGE sql;
`,
      function (res) {
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
        res.caseOf({
          Right: (res) => {
            Expect(res.inputs.length).toEqual(2);
            Expect(res.inputs[0]).toEqual({
              name: { name: "myid" },
              type: { kind: "simple", name: { name: "integer" } },
            });
            Expect(res.inputs[1]).toEqual({
              name: { name: "myname" },
              type: {
                kind: "parametrized",
                name: "nullable",
                typevar: { kind: "simple", name: { name: "text" } },
              },
            });
            Expect(res.returns).toEqual(expectedResultType);
          },
          Left: (e) => {
            throw e;
          },
        });
      }
    );
  }

  @Test("Type error test")
  public basicErrorTest() {
    testCreateFunction(
      "create table testje ( id int not null, name text );",
      `
CREATE FUNCTION myselect(myname text) RETURNS SETOF AS $$
  SELECT id, name
  FROM testje
  WHERE id = myname;
$$ LANGUAGE sql;
`,
      function (res) {
        res.caseOf({
          Left: (err) => {
            Expect(err.message).toEqual(
              'Can\'t apply operator "=" to integer and text'
            );
          },
          Right: (_) => {
            throw new Error("Should return error");
          },
        });
      }
    );
  }
}

// @TestFixture("Typechecker")
// export class TypecheckerTests {
//   @Test("Basic test")
//   public basicTest() {
//     testSelectFrom(
//       "create table testje ( id int not null, name text );",
//       `
// select id, name
// from testje
// where id = $1
// and $2 = name
// `,
//       function ({ returnT, context }) {
//         const expectedResultType: SetT = {
//           kind: "set",
//           fields: [
//             {
//               name: { name: "id" },
//               type: { kind: "simple", name: { name: "integer" } },
//             },
//             {
//               name: { name: "name" },
//               type: {
//                 kind: "parametrized",
//                 name: "nullable",
//                 typevar: { kind: "simple", name: { name: "text" } },
//               },
//             },
//           ],
//         };
//         Expect(returnT).toEqual(expectedResultType);

//         Expect(context.decls.length).toEqual(2);

//         const expectedParam0: SimpleT = {
//           kind: "simple",
//           name: { name: "integer" },
//         };
//         Expect(context.decls[0]).toEqual(expectedParam0);

//         const expectedParam1: ParametrizedT<SimpleT> = {
//           kind: "parametrized",
//           name: "nullable",
//           typevar: { kind: "simple", name: { name: "text" } },
//         };
//         Expect(context.decls[1]).toEqual(expectedParam1);
//       }
//     );
//   }

//   @TestCase(`select somethingsomething from testje`)
//   @TestCase(`select * from somethingsomething`)
//   @Test("Unknown identifier")
//   public unknownIdentifierTest(queryStr: string) {
//     const setup = "create table testje ( id int not null, name text );";
//     const g = parseSetupScripts(parse(setup));
//     const query = parse(queryStr);
//     Expect(() =>
//       query[0].type === "select"
//         ? doSelectFrom(g, { decls: [] }, query[0])
//         : null
//     ).toThrow();
//   }

//   @TestCase(`
// select id from testje
// where id = $1
// and $2 = name
// and $1 = $2
// `)
//   @TestCase(`
// select id from testje
// where id = 'test'
// `)
//   @TestCase(`
// select id from testje
// where name = 5
// `)
//   @TestCase(`
// select id from testje
// where name = id
// `)
//   @Test("Type mismatch")
//   public typeMismatchTest(queryStr: string) {
//     const setup = "create table testje ( id int not null, name text );";
//     const g = parseSetupScripts(parse(setup));
//     const query = parse(queryStr);
//     Expect(() =>
//       query[0].type === "select"
//         ? doSelectFrom(g, { decls: [] }, query[0])
//         : null
//     ).toThrow();
//   }

//   @Test("Two unifvars test")
//   public twoUnifvarsTest() {
//     testSelectFrom(
//       "create table testje ( id int not null, name text );",
//       `
// select id, name
// from testje
// where id = $1
// and $1 = $2
// `,
//       function ({ returnT, context }) {
//         const expectedResultType: SetT = {
//           kind: "set",
//           fields: [
//             {
//               name: { name: "id" },
//               type: { kind: "simple", name: { name: "integer" } },
//             },
//             {
//               name: { name: "name" },
//               type: {
//                 kind: "parametrized",
//                 name: "nullable",
//                 typevar: { kind: "simple", name: { name: "text" } },
//               },
//             },
//           ],
//         };
//         Expect(returnT).toEqual(expectedResultType);

//         Expect(context.decls.length).toEqual(2);

//         const expectedParam0: SimpleT = {
//           kind: "simple",
//           name: { name: "integer" },
//         };
//         Expect(context.decls[0]).toEqual(expectedParam0);
//         Expect(context.decls[1]).toEqual(expectedParam0);
//       }
//     );
//   }

//   @Test("Two unifvars no unification")
//   public twoUnifvarsNoUnificationTest() {
//     testSelectFrom(
//       "create table testje ( id int not null, name text );",
//       `
// select id, name
// from testje
// where $1 = $2
// `,
//       function ({ context }) {
//         Expect(context.decls.length).toEqual(2);

//         Expect(context.decls[0]).toEqual(null);
//         Expect(context.decls[1]).toEqual(null);
//       }
//     );
//   }

//   @Test("Two unifvars late unif")
//   @TestCase(`
// select id, name
// from testje
// where $1 = $2
// and $1 = id
// `)
//   @TestCase(`
// select id, name
// from testje
// where $1 = $2
// and $2 = id
// `)
//   @TestCase(`
// select id, name
// from testje
// where $1 = $2
// and $2 = $3
// and $1 = id
// `)
//   public twoUnifvarsLateUnif(queryStr: string) {
//     testSelectFrom(
//       "create table testje ( id int not null, name text );",
//       queryStr,
//       function ({ context }) {
//         const expectedParam: SimpleT = {
//           kind: "simple",
//           name: { name: "integer" },
//         };
//         context.decls.forEach(function (k) {
//           Expect(k.type).toEqual(expectedParam);
//         });
//       }
//     );
//   }

//   @Test("Qualified select")
//   public qualifiedSelect() {
//     testSelectFrom(
//       "create table testje ( id int not null, name text );",
//       `select testje.id, id from testje`,
//       function ({ returnT }) {
//         const expectedParam: SimpleT = {
//           kind: "simple",
//           name: { name: "integer" },
//         };
//         const f = returnT.fields[0];
//         Expect(f.type).toEqual(expectedParam);
//         Expect(f.name).toEqual({ name: "id" });

//         const f2 = returnT.fields[1];
//         Expect(f2.type).toEqual(expectedParam);
//         Expect(f2.name).toEqual({ name: "id" });
//       }
//     );
//   }

//   @Test("Operator")
//   public operator() {
//     testSelectFrom(
//       "create table testje ( id int not null, name text );",
//       `select id + 1 from testje`,
//       function ({ returnT }) {
//         const expectedParam: SimpleT = {
//           kind: "simple",
//           name: { name: "integer" },
//         };
//         const f = returnT.fields[0];
//         Expect(f.type).toEqual(expectedParam);
//       }
//     );
//   }
// }
