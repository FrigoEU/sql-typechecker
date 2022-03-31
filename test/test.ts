import { Expect, Focus, IgnoreTest, Test, TestFixture } from "alsatian";
import { Name, parse, QName } from "pgsql-ast-parser";
import { Either, Left, Right } from "purify-ts";
import {
  ArrayT,
  BuiltinTypeConstructors,
  BuiltinTypes,
  doCreateFunction,
  parseSetupScripts,
  ScalarT,
  RecordT,
  SimpleT,
  Type,
  VoidT,
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
        returns: Type | VoidT;
        multipleRows: boolean;
      }
    >
  ) => void
) {
  const g = parseSetupScripts(parse(setupStr));
  const query = parse(queryStr);
  if (query[0].type === "create function") {
    try {
      const res = doCreateFunction(g, { decls: [], froms: [] }, query[0]);
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
  expectedReturnType: RecordT | ScalarT | ArrayT<T> | VoidT
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
            type: BuiltinTypeConstructors.Nullable(BuiltinTypes.Text),
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
          type: BuiltinTypeConstructors.Nullable(BuiltinTypes.Text),
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
            type: BuiltinTypeConstructors.Nullable(BuiltinTypes.Text),
          },
        ],
      }
    );
  }

  @Test()
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
  public selectStar() {
    expectReturnType(
      `
create table testje ( id int not null, name text );
create table testje2 ( id2 int not null, name2 text );
`,
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT *
FROM testje
JOIN testje2 ON testje.id = testje2.id2
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
            type: BuiltinTypeConstructors.Nullable(BuiltinTypes.Text),
          },
          {
            name: { name: "id2" },
            type: BuiltinTypes.Integer,
          },
          {
            name: { name: "name2" },
            type: BuiltinTypeConstructors.Nullable(BuiltinTypes.Text),
          },
        ],
      }
    );
  }

  @Test()
  public selectTableStar() {
    expectReturnType(
      `
create table testje ( id int not null, name text );
create table testje2 ( id2 int not null, name2 text );
`,
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT testje2.*
FROM testje
JOIN testje2 ON testje.id = testje2.id2
$$ LANGUAGE sql;
`,
      {
        kind: "set",
        fields: [
          {
            name: { name: "id2" },
            type: BuiltinTypes.Integer,
          },
          {
            name: { name: "name2" },
            type: BuiltinTypeConstructors.Nullable(BuiltinTypes.Text),
          },
        ],
      }
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

  @Test()
  public extract() {
    expectReturnType(
      "create table testje ( id int not null, mystamp timestamp not null);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT EXTRACT(DAY FROM mystamp)
from testje
$$ LANGUAGE sql;
`,
      {
        kind: "set",
        fields: [
          {
            name: null,
            type: BuiltinTypes.Numeric,
          },
        ],
      }
    );
  }

  @Test()
  public extractError() {
    expectThrowLike(
      "create table testje ( id int not null, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT EXTRACT(DAY FROM name)
from testje
$$ LANGUAGE sql;
`,
      "TypeMismatch"
    );
  }

  @Test()
  public extractErrorWithWrongCasting() {
    expectThrowLike(
      "create table testje ( id int not null, mytime time not null);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT EXTRACT(DAY FROM mytime)
from testje
$$ LANGUAGE sql;
`,
      "TypeMismatch"
    );
  }

  @Test()
  public jsonMember() {
    expectReturnType(
      "create table testje ( id int not null, myjson json);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT myjson->'bleb'
from testje
$$ LANGUAGE sql;
`,
      {
        kind: "set",
        fields: [
          {
            name: null,
            type: BuiltinTypes.AnyScalar,
          },
        ],
      }
    );
  }

  @Test()
  public jsonMemberError() {
    expectThrowLike(
      "create table testje ( id int not null, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT name->'bleb'
from testje
$$ LANGUAGE sql;
`,
      "TypeMismatch"
    );
  }

  @Test()
  public Coalesce() {
    expectReturnType(
      "create table testje ( id int not null, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT COALESCE(name, 'hello')
from testje
$$ LANGUAGE sql;
`,
      {
        kind: "set",
        fields: [
          {
            name: null,
            type: BuiltinTypes.Text,
          },
        ],
      }
    );
  }

  @Test()
  public nullif() {
    expectReturnType(
      "create table testje ( id int not null, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT NULLIF(name, 'hello')
from testje
$$ LANGUAGE sql;
`,
      {
        kind: "set",
        fields: [
          {
            name: null,
            type: BuiltinTypeConstructors.Nullable(BuiltinTypes.Text),
          },
        ],
      }
    );
  }

  @Test()
  public CoalesceMismatch() {
    expectThrowLike(
      "create table testje ( id int not null, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT COALESCE(name, 2)
from testje
$$ LANGUAGE sql;
`,
      "TypeMismatch"
    );
  }

  @Test()
  public keyword() {
    expectReturnType(
      "create table testje ( id int not null, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT CURRENT_TIMESTAMP
from testje
$$ LANGUAGE sql;
`,
      { kind: "set", fields: [{ name: null, type: BuiltinTypes.Timestamp }] }
    );
  }

  @Test()
  public arrayIndex() {
    expectReturnType(
      "create table testje ( id int not null, name text[]);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT name[1]
from testje
$$ LANGUAGE sql;
`,
      {
        kind: "set",
        fields: [
          {
            name: null,
            type: BuiltinTypeConstructors.Nullable(BuiltinTypes.Text),
          },
        ],
      }
    );
  }

  @Test()
  public arrayIndexMismatch() {
    expectThrowLike(
      "create table testje ( id int not null, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT name[1]
from testje
$$ LANGUAGE sql;
`,
      "TypeMismatch"
    );
  }

  @Test()
  public caseWithValue() {
    expectReturnType(
      "create table testje ( id int not null, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT CASE name WHEN '' THEN 2 ELSE 5 END
from testje
$$ LANGUAGE sql;
`,
      {
        kind: "set",
        fields: [
          {
            name: null,
            type: BuiltinTypes.Integer,
          },
        ],
      }
    );
  }

  @Test()
  public caseWithValueMismatchedValues() {
    expectThrowLike(
      "create table testje ( id int not null, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT CASE name WHEN 7 THEN 2 ELSE 5 END
from testje
$$ LANGUAGE sql;
`,
      "TypeMismatch"
    );
  }

  @Test()
  public caseWithValueMismatchedReturns() {
    expectThrowLike(
      "create table testje ( id int not null, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT CASE name WHEN '' THEN 2 ELSE 'bleb' END
from testje
$$ LANGUAGE sql;
`,
      "TypeMismatch"
    );
  }

  @Test()
  public caseWithoutValue() {
    expectReturnType(
      "create table testje ( id int not null, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT CASE WHEN name = '' THEN 2 ELSE 5 END
from testje
$$ LANGUAGE sql;
`,
      {
        kind: "set",
        fields: [
          {
            name: null,
            type: BuiltinTypes.Integer,
          },
        ],
      }
    );
  }

  @Test()
  public caseWithoutValueMismatchedCondition() {
    expectThrowLike(
      "create table testje ( id int not null, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT CASE WHEN name THEN 2 ELSE 5 END
from testje
$$ LANGUAGE sql;
`,
      "TypeMismatch"
    );
  }

  @Test()
  public caseWithoutValueMismatchedReturns() {
    expectThrowLike(
      "create table testje ( id int not null, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT CASE WHEN name = '' THEN 2 ELSE 'bleb' END
from testje
$$ LANGUAGE sql;
`,
      "TypeMismatch"
    );
  }

  @Test()
  public selectExpr() {
    expectReturnType(
      "create table testje ( id int not null, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT (SELECT t2.id from testje as t2)
from testje
$$ LANGUAGE sql;
`,
      {
        kind: "set",
        fields: [
          {
            name: null,
            type: BuiltinTypes.Integer,
          },
        ],
      }
    );
  }

  @Test()
  public selectUnion() {
    expectReturnType(
      "create table testje ( id int not null, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT id, name
FROM testje
UNION
SELECT id + 1, name
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
            type: BuiltinTypeConstructors.Nullable(BuiltinTypes.Text),
          },
        ],
      }
    );
  }

  @Test()
  public selectUnionAll() {
    expectReturnType(
      "create table testje ( id int not null, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT id, name
FROM testje
UNION ALL
SELECT id + 1, name
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
            type: BuiltinTypeConstructors.Nullable(BuiltinTypes.Text),
          },
        ],
      }
    );
  }

  @Test()
  @IgnoreTest("Haven't implemented column name resolution properly yet")
  public fieldNameFromOperation() {
    expectReturnType(
      "create table testje ( id int not null, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT id + 1
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
        ],
      }
    );
  }

  @Test()
  public selectUnionMismatch() {
    expectThrowLike(
      "create table testje ( id int not null, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT id, name
FROM testje
UNION
SELECT name
FROM testje
$$ LANGUAGE sql;
`,
      "TypeMismatch"
    );
  }

  @Test()
  public selectValues() {
    expectReturnType(
      "create table testje ( id int not null, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT * FROM (VALUES (1, 'one'), (2, 'two')) AS vals
$$ LANGUAGE sql;
`,
      {
        kind: "set",
        fields: [
          {
            name: null,
            type: BuiltinTypes.Integer,
          },
          {
            name: null,
            type: BuiltinTypes.Text,
          },
        ],
      }
    );
  }

  @Test()
  public selectValuesMismatchLengths() {
    expectThrowLike(
      "create table testje ( id int not null, name text);",
      `
  CREATE FUNCTION myselect() RETURNS SETOF AS $$
  SELECT * FROM (VALUES (1, 'one'), (2)) AS vals
  $$ LANGUAGE sql;
  `,
      "TypeMismatch"
    );
  }

  @Test()
  public selectValuesMismatchTypes() {
    expectThrowLike(
      "create table testje ( id int not null, name text);",
      `
  CREATE FUNCTION myselect() RETURNS SETOF AS $$
  SELECT * FROM (VALUES (1, 'one'), (2, 5)) AS vals
  $$ LANGUAGE sql;
  `,
      "TypeMismatch"
    );
  }

  @Test()
  public ternary() {
    expectReturnType(
      "create table testje ( id int not null, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT id
FROM testje
WHERE id BETWEEN 2 AND 5
$$ LANGUAGE sql;
`,
      {
        kind: "set",
        fields: [{ name: { name: "id" }, type: BuiltinTypes.Integer }],
      }
    );
  }

  @Test()
  public ternaryMismatch() {
    expectThrowLike(
      "create table testje ( id int not null, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT id
FROM testje
WHERE id BETWEEN 2 AND '5'
$$ LANGUAGE sql;
`,
      "TypeMismatch"
    );
  }

  @Test()
  public substring() {
    expectReturnType(
      "create table testje ( id int not null, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT SUBSTRING(name from 5 for 7) as name
FROM testje
WHERE id BETWEEN 2 AND 5
$$ LANGUAGE sql;
`,
      {
        kind: "set",
        fields: [
          {
            name: { name: "name" },
            type: BuiltinTypeConstructors.Nullable(BuiltinTypes.Text),
          },
        ],
      }
    );
  }

  @Test()
  public substringNotnullable() {
    expectReturnType(
      "create table testje ( id int not null, name text not null);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT SUBSTRING(name from 5 for 7) as name
FROM testje
WHERE id BETWEEN 2 AND 5
$$ LANGUAGE sql;
`,
      {
        kind: "set",
        fields: [
          {
            name: { name: "name" },
            type: BuiltinTypes.Text,
          },
        ],
      }
    );
  }

  @Test()
  public substringMismatch() {
    expectThrowLike(
      "create table testje ( id int not null, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT SUBSTRING(name from 5 for 'b') as name
FROM testje
$$ LANGUAGE sql;
`,
      "TypeMismatch"
    );
  }

  @Test()
  public cast() {
    expectReturnType(
      "create table testje ( id int not null, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT id::int as id, name::text as name
from testje
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
            type: BuiltinTypeConstructors.Nullable(BuiltinTypes.Text),
          },
        ],
      }
    );
  }

  @Test()
  public operatorOnNullable1() {
    expectReturnType(
      "create table testje ( id int not null, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT id + NULL as id
from testje
$$ LANGUAGE sql;
`,
      {
        kind: "set",
        fields: [
          {
            name: { name: "id" },
            type: BuiltinTypeConstructors.Nullable(BuiltinTypes.Integer),
          },
        ],
      }
    );
  }

  @Test()
  public operatorOnNullable2() {
    expectReturnType(
      "create table testje ( id int );",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT id + 5 as id
from testje
$$ LANGUAGE sql;
`,
      {
        kind: "set",
        fields: [
          {
            name: { name: "id" },
            type: BuiltinTypeConstructors.Nullable(BuiltinTypes.Integer),
          },
        ],
      }
    );
  }

  @Test()
  public operatorOnNullable3() {
    expectReturnType(
      "create table testje ( id int NOT NULL);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT id + 5 as id
from testje
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
  public operatorOnNullable4() {
    expectReturnType(
      "create table testje ( id int NOT NULL, id2 int);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT id + id2 as id
from testje
$$ LANGUAGE sql;
`,
      {
        kind: "set",
        fields: [
          {
            name: { name: "id" },
            type: BuiltinTypeConstructors.Nullable(BuiltinTypes.Integer),
          },
        ],
      }
    );
  }

  @Test()
  public unification() {
    expectReturnType(
      "create table testje ( id int NOT NULL, id2 int);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
SELECT CASE id WHEN 0 THEN 5 ELSE 6.5 END as mynumber
FROM testje
$$ LANGUAGE sql;
`,
      {
        kind: "set",
        fields: [
          {
            name: { name: "mynumber" },
            type: BuiltinTypes.Numeric,
          },
        ],
      }
    );
  }

  @Test()
  public insert() {
    expectReturnType(
      "create table testje ( id int NOT NULL, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
INSERT INTO testje (id, name) VALUES (1, 'hello');
$$ LANGUAGE sql;
`,
      { kind: "void" }
    );
  }

  @Test()
  public insertErro() {
    expectThrowLike(
      "create table testje ( id int NOT NULL, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
INSERT INTO testje (id, name) VALUES (1, 2);
$$ LANGUAGE sql;
`,
      "TypeMismatch"
    );
  }

  @Test()
  public returning() {
    expectReturnType(
      "create table testje ( id int NOT NULL, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
INSERT INTO testje (id, name) VALUES (1, 'hello') RETURNING id;
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
  public default_() {
    expectReturnType(
      "create table testje ( id int NOT NULL default 5, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
INSERT INTO testje (id, name) VALUES (default, 'hello') RETURNING id;
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
  public with() {
    expectReturnType(
      "create table testje ( id int NOT NULL);",
      `
CREATE FUNCTION myselect() RETURNS SETOF AS $$
WITH mycte AS (
  SELECT id from testje
)
SELECT * from mycte
$$ LANGUAGE sql;
`,
      {
        kind: "set",
        fields: [{ name: { name: "id" }, type: BuiltinTypes.Integer }],
      }
    );
  }

  @Test()
  public delete_() {
    expectReturnType(
      "create table testje ( id int NOT NULL);",
      `
CREATE FUNCTION mydelete() RETURNS SETOF AS $$
DELETE FROM testje
WHERE id = 5
RETURNING id
$$ LANGUAGE sql;
`,
      {
        kind: "set",
        fields: [{ name: { name: "id" }, type: BuiltinTypes.Integer }],
      }
    );
  }

  @Test()
  public deleteError() {
    expectThrowLike(
      "create table testje ( id int NOT NULL);",
      `
CREATE FUNCTION mydelete() RETURNS SETOF AS $$
DELETE FROM testje
WHERE id = ''
$$ LANGUAGE sql;
`,
      "Can't apply operator"
    );
  }
}
