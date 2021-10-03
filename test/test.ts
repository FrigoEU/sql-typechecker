import { Expect, FocusTest, Test, TestFixture } from "alsatian";
import { Name, parse, QName } from "pgsql-ast-parser";
import { Either, Left, Right } from "purify-ts";
import {
  BuiltinTypes,
  BuiltinTypeConstructors,
  doCreateFunction,
  parseSetupScripts,
  SetT,
  ScalarT,
  SimpleT,
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
        inputs: { name: Name; type: SimpleT }[];
        returns: ScalarT | SetT | null;
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

function expectInputs(
  setupStr: string,
  queryStr: string,
  expectedInputTypes: {
    name: Name;
    type: SimpleT;
  }[]
) {
  testCreateFunction(setupStr, queryStr, (res) => {
    res.caseOf({
      Left: (err) => {
        throw err;
      },
      Right: (res) => {
        Expect(res.inputs.length).toEqual(expectedInputTypes.length);
        expectedInputTypes.forEach((expectedInputType, i) => {
          Expect(res.inputs[i]).toEqual(expectedInputType);
        });
      },
    });
  });
}

function expectReturnType(
  setupStr: string,
  queryStr: string,
  expectedReturnType: SetT | ScalarT | null
) {
  testCreateFunction(setupStr, queryStr, (res) => {
    res.caseOf({
      Left: (err) => {
        throw err;
      },
      Right: (res) => {
        Expect(res.returns).toEqual(expectedReturnType);
      },
    });
  });
}

function expectThrowLike(
  setupStr: string,
  queryStr: string,
  expectedError: string
) {
  testCreateFunction(setupStr, queryStr, (res) => {
    res.caseOf({
      Left: (err) => {
        Expect(err.message).toContain(expectedError);
      },
      Right: (_) => {
        throw new Error("Should return error");
      },
    });
  });
}

@TestFixture("Typechecker")
export class TypecheckerTests {
  @Test()
  public select() {
    expectReturnType(
      "create table testje ( id int not null, name text );",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
  SELECT id, name
  FROM testje
$$ LANGUAGE sql;
`,
      {
        kind: "set",
        fields: [
          {
            name: { name: "id" },
            type: BuiltinTypes.Integer,
          },
          {
            name: { name: "name" },
            type: BuiltinTypeConstructors.Nullable(BuiltinTypes.String),
          },
        ],
      }
    );
  }

  @Test()
  public alias() {
    expectReturnType(
      "create table testje ( id int not null, name text );",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT mytest.id as myid
FROM testje as mytest
$$ LANGUAGE sql;
`,
      {
        kind: "set",
        fields: [
          {
            name: { name: "myid" },
            type: BuiltinTypes.Integer,
          },
        ],
      }
    );
  }

  @Test()
  public inputTypes() {
    expectInputs(
      "create table testje ( id int not null, name text );",
      `
CREATE FUNCTION myselect(myid int, myname text default null) RETURNS SETOF AS $$
  SELECT id, name
  FROM testje
  WHERE id = myid
  AND myname = name;
$$ LANGUAGE sql;
`,
      [
        {
          name: { name: "myid" },
          type: BuiltinTypes.Integer,
        },
        {
          name: { name: "myname" },
          type: BuiltinTypeConstructors.Nullable(BuiltinTypes.String),
        },
      ]
    );
  }

  @Test()
  public unifyError() {
    expectThrowLike(
      "create table testje ( id int not null, name text );",
      `
CREATE FUNCTION myselect(myname text) RETURNS SETOF AS $$
  SELECT id, name
  FROM testje
  WHERE id = myname;
$$ LANGUAGE sql;
`,
      'Can\'t apply operator "=" to integer and text'
    );
  }

  @Test()
  // @FocusTest
  public innerJoin() {
    expectReturnType(
      "create table testje ( id int not null, name text );",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT testje.id as id1, testje2.id as id2, testje.name
FROM testje
JOIN testje AS testje2 ON testje.name = testje2.name
$$ LANGUAGE sql;
`,
      {
        kind: "set",
        fields: [
          {
            name: { name: "id1" },
            type: BuiltinTypes.Integer,
          },
          {
            name: { name: "id2" },
            type: BuiltinTypes.Integer,
          },
          {
            name: { name: "name" },
            type: BuiltinTypeConstructors.Nullable(BuiltinTypes.String),
          },
        ],
      }
    );
  }

  @Test()
  // @FocusTest
  public leftJoin() {
    expectReturnType(
      "create table testje ( id int not null, name text );",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT testje.id as id1, testje2.id as id2
FROM testje
LEFT OUTER JOIN testje AS testje2 ON testje.name = testje2.name
$$ LANGUAGE sql;
`,
      {
        kind: "set",
        fields: [
          {
            name: { name: "id1" },
            type: BuiltinTypes.Integer,
          },
          {
            name: { name: "id2" },
            type: BuiltinTypeConstructors.Nullable(BuiltinTypes.Integer),
          },
        ],
      }
    );
  }

  @Test()
  // @FocusTest
  public rightJoin() {
    expectReturnType(
      "create table testje ( id int not null, name text );",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT testje.id as id1, testje2.id as id2
FROM testje
RIGHT JOIN testje AS testje2 ON testje.name = testje2.name
$$ LANGUAGE sql;
`,
      {
        kind: "set",
        fields: [
          {
            name: { name: "id1" },
            type: BuiltinTypeConstructors.Nullable(BuiltinTypes.Integer),
          },
          {
            name: { name: "id2" },
            type: BuiltinTypes.Integer,
          },
        ],
      }
    );
  }

  @Test()
  public ambiguousIdentifier() {
    expectThrowLike(
      "create table testje ( id int not null, name text );",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT name
FROM testje
JOIN testje AS testje2 ON testje.name = testje2.name
$$ LANGUAGE sql;
`,
      `AmbiguousIdentifier name`
    );
  }

  @Test()
  public dontUseEqualNull() {
    expectThrowLike(
      "create table testje ( id int not null, name text );",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT id
FROM testje
WHERE id = NULL
$$ LANGUAGE sql;
`,
      `Don't use "= NULL"`
    );
  }

  @Test()
  public isNull() {
    expectReturnType(
      "create table testje ( id int not null, name text );",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT id
FROM testje
WHERE id IS NULL
$$ LANGUAGE sql;
`,
      {
        kind: "set",
        fields: [
          {
            name: { name: "id1" },
            type: BuiltinTypes.Integer,
          },
        ],
      }
    );
  }
}
