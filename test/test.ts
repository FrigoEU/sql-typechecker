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
  ArrayT,
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
      cont(Left(err as Error));
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

function expectReturnType<T>(
  setupStr: string,
  queryStr: string,
  expectedReturnType: SetT | ScalarT | ArrayT<T> | null
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
            name: { name: "id" },
            type: BuiltinTypes.Integer,
          },
        ],
      }
    );
  }

  @Test()
  public operators() {
    expectReturnType(
      "create table testje ( id int not null, name text );",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT -id + 2 as id
FROM testje
WHERE id + 5 < 7
$$ LANGUAGE sql;
`,
      {
        kind: "set",
        fields: [
          {
            name: { name: "id" },
            type: BuiltinTypes.Integer,
          },
        ],
      }
    );
  }

  @Test()
  public inList() {
    expectReturnType(
      "create table testje ( id int not null, name text );",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT id
FROM testje
WHERE id IN (1, 2, 3)
$$ LANGUAGE sql;
`,
      {
        kind: "set",
        fields: [
          {
            name: { name: "id" },
            type: BuiltinTypes.Integer,
          },
        ],
      }
    );
  }

  @Test()
  public inListMismatch() {
    expectThrowLike(
      "create table testje ( id int not null, name text );",
      `
CREATE FUNCTION myselect(mylist int[]) RETURNS SETOF AS $$
SELECT id
FROM testje
WHERE id IN ('hello')
$$ LANGUAGE sql;
`,
      "TypeMismatch"
    );
  }

  @Test()
  public inListParameter() {
    expectThrowLike(
      "create table testje ( id int not null, name text );",
      `
CREATE FUNCTION myselect(mylist int[]) RETURNS SETOF AS $$
SELECT id
FROM testje
WHERE id IN mylist
$$ LANGUAGE sql;
`,
      "TypeMismatch"
    );
  }

  @Test()
  public equalAny() {
    expectInputs(
      "create table testje ( id int not null, name text );",
      `
CREATE FUNCTION myselect(mylist int[]) RETURNS SETOF AS $$
SELECT id
FROM testje
WHERE id = ANY(mylist)
$$ LANGUAGE sql;
`,
      [
        {
          name: { name: "mylist" },
          type: BuiltinTypeConstructors.Array(BuiltinTypes.Integer),
        },
      ]
    );
  }

  @Test()
  public equalAnyMismatch() {
    expectThrowLike(
      "create table testje ( id int not null, name text );",
      `
CREATE FUNCTION myselect(mylist text[]) RETURNS SETOF AS $$
SELECT id
FROM testje
WHERE id = ANY(mylist)
$$ LANGUAGE sql;
`,
      "Can't apply operator"
    );
  }

  @Test()
  public arraySelect() {
    expectReturnType(
      "create table testje ( id int not null, name text );",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT ARRAY[1, 2]
$$ LANGUAGE sql;
`,
      {
        kind: "set",
        fields: [
          {
            name: null,
            type: BuiltinTypeConstructors.Array(BuiltinTypes.Integer),
          },
        ],
      }
    );
  }

  @Test()
  public arraySelectWithSubquery() {
    expectReturnType(
      "create table testje ( id int not null, name text );",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT ARRAY(SELECT id from testje)
$$ LANGUAGE sql;
`,
      {
        kind: "set",
        fields: [
          {
            name: null,
            type: BuiltinTypeConstructors.Array(BuiltinTypes.Integer),
          },
        ],
      }
    );
  }

  @Test()
  public arraySelectWithMulticolumnSubquery() {
    expectThrowLike(
      "create table testje ( id int not null, name text );",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT ARRAY(SELECT id, name from testje)
$$ LANGUAGE sql;
`,
      "TypeMismatch"
    );
  }
}
