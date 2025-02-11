import { Expect, Focus, IgnoreTest, Test, TestFixture } from "alsatian";
import { isPlainObject, mapValues, omit } from "lodash";
import { Either, Left, Right } from "purify-ts";
import { Name, parse, QName } from "trader-pgsql-ast-parser";
import {
  AnyScalar,
  ArrayT,
  BuiltinTypeConstructors,
  BuiltinTypes,
  doCreateFunction,
  parseSetupScripts,
  RecordT,
  ScalarT,
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
  const g = parseSetupScripts(
    { tables: [], views: [], domains: [], enums: [] },
    parse(setupStr)
  );
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
          Expect(removeLocation(res.inputs[i])).toEqual(expectedInputType);
        });
      },
    });
  });
}

function expectReturnType<T>(
  setupStr: string,
  queryStr: string,
  expectedReturnType: RecordT | ScalarT | ArrayT<T> | VoidT,
  opts?: { multipleRows: boolean }
) {
  testCreateFunction(setupStr, queryStr, (res) => {
    res.caseOf({
      Left: (err) => {
        throw err;
      },
      Right: (res) => {
        // console.log(JSON.stringify(res.returns));
        // console.log(JSON.stringify(expectedReturnType));
        Expect(removeLocation(res.returns)).toEqual(expectedReturnType);
        if (opts) {
          Expect(res.multipleRows).toEqual(opts.multipleRows);
        }
      },
    });
  });
}

function removeLocation(obj: Object): any {
  if (isPlainObject(obj)) {
    const mapped = mapValues(obj, (inner) => removeLocation(inner));
    return omit(omit(mapped, "_location"), "_expr");
  } else if (Array.isArray(obj)) {
    return obj.map((inner) => removeLocation(inner));
  }
  return obj;
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
  SELECT id, name
  FROM testje
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT mytest.id as myid
FROM testje as mytest
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
CREATE FUNCTION myselect(myid int, myname text default null) RETURNS SETOF RECORD AS $$
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
  public timestampWithTimeZone() {
    expectReturnType(
      "create table testje ( id int not null, stamp timestamp with time zone );",
      `
CREATE FUNCTION myselect(myid int) RETURNS SETOF RECORD AS $$
  SELECT id, stamp
  FROM testje
  WHERE id = myid
$$ LANGUAGE sql;
`,
      {
        kind: "record",
        fields: [
          {
            name: { name: "id" },
            type: BuiltinTypes.Integer,
          },
          {
            name: { name: "stamp" },
            type: BuiltinTypeConstructors.Nullable(BuiltinTypes.TimestampTz),
          },
        ],
      }
    );
  }

  @Test()
  public arrayField() {
    expectReturnType(
      "create table testje ( id int not null, numbers int[] NOT NULL );",
      `
CREATE FUNCTION myselect(myid int) RETURNS SETOF RECORD AS $$
  SELECT id, numbers
  FROM testje
  WHERE id = myid
$$ LANGUAGE sql;
`,
      {
        kind: "record",
        fields: [
          {
            name: { name: "id" },
            type: BuiltinTypes.Integer,
          },
          {
            name: { name: "numbers" },
            type: BuiltinTypeConstructors.Array(BuiltinTypes.Integer),
          },
        ],
      }
    );
  }

  @Test()
  public rowNumberOver() {
    expectReturnType(
      "create table testje ( id int not null);",
      `
CREATE FUNCTION myselect(myid int) RETURNS SETOF RECORD AS $$
  SELECT id, ROW_NUMBER() OVER (PARTITION BY id ORDER BY id) AS seq
  FROM testje
  WHERE id = myid
$$ LANGUAGE sql;
`,
      {
        kind: "record",
        fields: [
          {
            name: { name: "id" },
            type: BuiltinTypes.Integer,
          },
          {
            name: { name: "seq" },
            type: BuiltinTypes.Integer,
          },
        ],
      }
    );
  }

  @Test()
  public updateFrom() {
    expectReturnType(
      "create table testje ( id int not null, name text );",
      `
CREATE FUNCTION myselect(myname text default null) RETURNS VOID AS $$

  UPDATE testje
  SET id = 2
  FROM testje t2
  WHERE myname = testje.name AND t2.name = testje.name;

$$ LANGUAGE sql;
`,
      {
        kind: "void",
      }
    );
  }

  @Test()
  public nullableComparisonInUpdate() {
    expectReturnType(
      "create table testje ( id int not null, name text );",
      `
CREATE FUNCTION myselect(myname text default null) RETURNS VOID AS $$
  UPDATE testje
  SET id = 2
  WHERE myname = name;
$$ LANGUAGE sql;
`,
      {
        kind: "void",
      }
    );
  }

  @Test()
  public unifyError() {
    expectThrowLike(
      "create table testje ( id int not null, name text );",
      `
CREATE FUNCTION myselect(myname text) RETURNS SETOF RECORD AS $$
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT testje.id as id1, testje2.id as id2, testje.name
FROM testje
JOIN testje AS testje2 ON testje.name = testje2.name
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT testje.id as id1, testje2.id as id2
FROM testje
LEFT OUTER JOIN testje AS testje2 ON testje.name = testje2.name
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT testje.id as id1, testje2.id as id2
FROM testje
RIGHT JOIN testje AS testje2 ON testje.name = testje2.name
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT *
FROM testje
JOIN testje2 ON testje.id = testje2.id2
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT testje2.*
FROM testje
JOIN testje2 ON testje.id = testje2.id2
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT id
FROM testje
WHERE id IS NULL
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
  @IgnoreTest("Not working yet(?)")
  public isNull2() {
    expectReturnType(
      "create table testje ( id int not null, name text );",
      `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT name
FROM testje
WHERE name IS NULL
$$ LANGUAGE sql;
`,
      {
        kind: "record",
        fields: [
          {
            name: { name: "name" },
            type: BuiltinTypes.Null,
          },
        ],
      }
    );
  }

  @Test()
  public isNotNull() {
    expectReturnType(
      "create table testje ( id int not null, name text );",
      `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT name
FROM testje
WHERE name IS NOT NULL
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
  public operators() {
    expectReturnType(
      "create table testje ( id int not null, name text );",
      `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT -id + 2 as id
FROM testje
WHERE id + 5 < 7
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
  public overlaps() {
    expectReturnType(
      "create table testje ( id int not null, stamp time NOT NULL, duration int8 NOT NULL, name text );",
      `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
  SELECT id
  FROM testje
  WHERE (stamp, stamp + (duration::text || ' minutes')::interval) OVERLAPS (stamp, stamp + (duration::text || ' minutes')::interval)
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
  public round() {
    expectReturnType(
      "create table testje ( id int not null, numb double precision NOT NULL);",
      `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
      SELECT id, round(numb, 2) AS numb
  FROM testje
$$ LANGUAGE sql;
`,
      {
        kind: "record",
        fields: [
          {
            name: { name: "id" },
            type: BuiltinTypes.Integer,
          },
          {
            name: { name: "numb" },
            type: BuiltinTypes.Numeric,
          },
        ],
      }
    );
  }

  @Test()
  public textsearch() {
    expectReturnType(
      "create table testje ( id int not null, name text );",
      `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
  SELECT id
  FROM testje
  WHERE to_tsvector(name) @@ to_tsquery('test')
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
  public overlaps_date() {
    expectReturnType(
      "create table testje ( id int not null, d1 date NOT NULL, d2 date NOT NULL, name text );",
      `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
  SELECT id
  FROM testje
  WHERE (d1, d2) OVERLAPS (d2, d1)
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
  public overlaps_mismatch() {
    expectThrowLike(
      "create table testje ( id int not null, d1 date NOT NULL, d2 date NOT NULL, name text );",
      `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
  SELECT id
  FROM testje
  WHERE (d1, d2) OVERLAPS (1, 2)
$$ LANGUAGE sql;
`,
      `Couldn't find matching cast`
    );
  }

  @Test()
  public inList() {
    expectReturnType(
      "create table testje ( id int not null, name text );",
      `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT id
FROM testje
WHERE id IN (1, 2, 3)
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
CREATE FUNCTION myselect(mylist int[]) RETURNS SETOF RECORD AS $$
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
CREATE FUNCTION myselect(mylist int[]) RETURNS SETOF RECORD AS $$
SELECT id
FROM testje
WHERE id IN mylist
$$ LANGUAGE sql;
`,
      "TypeMismatch"
    );
  }

  @Test()
  public equalArrays() {
    expectInputs(
      "create table testje ( id int not null, name text );",
      `
      CREATE FUNCTION myselect(mylist1 int[], mylist2 int[]) RETURNS SETOF RECORD AS $$
SELECT id
FROM testje
WHERE mylist1 = mylist2
$$ LANGUAGE sql;
`,
      [
        {
          name: { name: "mylist1" },
          type: BuiltinTypeConstructors.Array(BuiltinTypes.Integer),
        },
        {
          name: { name: "mylist2" },
          type: BuiltinTypeConstructors.Array(BuiltinTypes.Integer),
        },
      ]
    );
  }

  @Test()
  public equalAny() {
    expectInputs(
      "create table testje ( id int not null, name text );",
      `
CREATE FUNCTION myselect(mylist int[]) RETURNS SETOF RECORD AS $$
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
CREATE FUNCTION myselect(mylist text[]) RETURNS SETOF RECORD AS $$
SELECT id
FROM testje
WHERE id = ANY(mylist)
$$ LANGUAGE sql;
`,
      "Can't apply operator"
    );
  }

  @Test()
  public leftJoinNotNullableInOnClause() {
    expectReturnType(
      `
   create table testje ( id int not null, name text );
   create table test2  ( id int not null, myarray int[] not null );
`,
      `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT testje.id, test2.myarray
FROM testje
LEFT JOIN test2 on testje.id = ANY(test2.myarray)
$$ LANGUAGE sql;
`,
      {
        kind: "record",
        fields: [
          {
            name: { name: "id" },
            type: BuiltinTypes.Integer,
          },
          {
            name: { name: "myarray" },
            type: BuiltinTypeConstructors.Nullable(
              BuiltinTypeConstructors.Array(BuiltinTypes.Integer)
            ),
          },
        ],
      },
      { multipleRows: true }
    );
  }

  @Test()
  public arraySelect() {
    expectReturnType(
      "create table testje ( id int not null, name text );",
      `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT ARRAY[1, 2]
$$ LANGUAGE sql;
`,
      {
        kind: "record",
        fields: [
          {
            name: null,
            type: BuiltinTypeConstructors.Array(BuiltinTypes.Integer),
          },
        ],
      },
      { multipleRows: true }
    );
  }

  @Test()
  public arraySelectWithSubquery() {
    expectReturnType(
      "create table testje ( id int not null, name text );",
      `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT ARRAY(SELECT id from testje)
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT ARRAY(SELECT id, name from testje)
$$ LANGUAGE sql;
`,
      "TypeMismatch"
    );
  }

  @Test()
  public count() {
    expectReturnType(
      "create table testje ( id int not null, mystamp timestamp not null);",
      `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT COUNT(*) AS my_count
from testje
$$ LANGUAGE sql;
`,
      {
        kind: "record",
        fields: [
          {
            name: { name: "my_count" },
            type: BuiltinTypes.Bigint,
          },
        ],
      }
    );
  }

  @Test()
  public countField() {
    expectReturnType(
      "create table testje ( id int not null, mystamp timestamp not null);",
      `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT COUNT(id) AS my_count
from testje
$$ LANGUAGE sql;
`,
      {
        kind: "record",
        fields: [
          {
            name: { name: "my_count" },
            type: BuiltinTypes.Bigint,
          },
        ],
      }
    );
  }

  @Test()
  public countDistinctField() {
    expectReturnType(
      "create table testje ( id int not null, mystamp timestamp not null);",
      `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT COUNT(DISTINCT id) AS my_count
from testje
$$ LANGUAGE sql;
`,
      {
        kind: "record",
        fields: [
          {
            name: { name: "my_count" },
            type: BuiltinTypes.Bigint,
          },
        ],
      }
    );
  }

  @Test()
  public extract() {
    expectReturnType(
      "create table testje ( id int not null, mystamp timestamp not null);",
      `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT EXTRACT(DAY FROM mystamp)
from testje
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT myjson->'bleb'
from testje
$$ LANGUAGE sql;
`,
      {
        kind: "record",
        fields: [
          {
            name: null,
            type: AnyScalar,
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT name->'bleb'
from testje
$$ LANGUAGE sql;
`,
      "TypeMismatch"
    );
  }

  @Test()
  public Greatest() {
    expectReturnType(
      "create table testje ( id int not null, name text, mynum int);",
      `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT
      GREATEST(1, mynum) AS notnullable,
      GREATEST(mynum) AS nullable
from testje
$$ LANGUAGE sql;
`,
      {
        kind: "record",
        fields: [
          {
            name: { name: "notnullable" },
            type: BuiltinTypes.Integer,
          },
          {
            name: { name: "nullable" },
            type: BuiltinTypeConstructors.Nullable(BuiltinTypes.Integer),
          },
        ],
      }
    );
  }

  @Test()
  public upperLower() {
    expectReturnType(
      "create table testje ( id int not null, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
      SELECT id, lower(upper(name))
      from testje
$$ LANGUAGE sql;
`,
      {
        kind: "record",
        fields: [
          {
            name: { name: "id" },
            type: BuiltinTypes.Integer,
          },
          {
            name: { name: "lower" },
            type: BuiltinTypes.Text,
          },
        ],
      }
    );
  }

  @Test()
  public bool_and() {
    expectReturnType(
      "create table testje ( id int not null, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
      SELECT id, bool_and(id IS NOT NULL)
      from testje
$$ LANGUAGE sql;
`,
      {
        kind: "record",
        fields: [
          {
            name: { name: "id" },
            type: BuiltinTypes.Integer,
          },
          {
            name: { name: "bool_and" },
            type: BuiltinTypes.Boolean,
          },
        ],
      }
    );
  }

  @Test()
  public Max() {
    expectReturnType(
      "create table testje ( id int not null, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
      SELECT MAX(id)
      from testje
$$ LANGUAGE sql;
`,
      {
        kind: "record",
        fields: [
          {
            name: { name: "max" },
            type: BuiltinTypeConstructors.Nullable(BuiltinTypes.Integer),
          },
        ],
      }
    );
  }

  @Test()
  public Coalesce() {
    expectReturnType(
      "create table testje ( id int not null, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT COALESCE(name, 'hello')
from testje
$$ LANGUAGE sql;
`,
      {
        kind: "record",
        fields: [
          {
            name: { name: "coalesce" },
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT NULLIF(name, 'hello')
from testje
$$ LANGUAGE sql;
`,
      {
        kind: "record",
        fields: [
          {
            name: { name: "nullif" },
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT CURRENT_TIMESTAMP
from testje
$$ LANGUAGE sql;
`,
      { kind: "record", fields: [{ name: null, type: BuiltinTypes.Timestamp }] }
    );
  }

  @Test()
  public arrayIndex() {
    expectReturnType(
      "create table testje ( id int not null, name text[]);",
      `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT name[1]
from testje
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT CASE name WHEN '' THEN 2 ELSE 5 END
from testje
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT CASE WHEN name = '' THEN 2 ELSE 5 END
from testje
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT (SELECT t2.id from testje as t2)
from testje
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT id, name
FROM testje
UNION
SELECT id + 1, name
FROM testje
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT id, name
FROM testje
UNION ALL
SELECT id + 1, name
FROM testje
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT id + 1
FROM testje
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT * FROM (VALUES (1, 'one'), (2, 'two')) AS vals
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
  CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
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
  CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT id
FROM testje
WHERE id BETWEEN 2 AND 5
$$ LANGUAGE sql;
`,
      {
        kind: "record",
        fields: [{ name: { name: "id" }, type: BuiltinTypes.Integer }],
      }
    );
  }

  @Test()
  public ternaryMismatch() {
    expectThrowLike(
      "create table testje ( id int not null, name text);",
      `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT SUBSTRING(name from 5 for 7) as name
FROM testje
WHERE id BETWEEN 2 AND 5
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT SUBSTRING(name from 5 for 7) as name
FROM testje
WHERE id BETWEEN 2 AND 5
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT id::int as id, name::text as name
from testje
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
  public cast_double_precision_to_numeric() {
    expectReturnType(
      "create table testje ( id int not null, numb double precision NOT NULL);",
      `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
      SELECT id::int as id, numb::numeric AS numb
from testje
$$ LANGUAGE sql;
`,
      {
        kind: "record",
        fields: [
          {
            name: { name: "id" },
            type: BuiltinTypes.Integer,
          },
          {
            name: { name: "numb" },
            type: BuiltinTypes.Numeric,
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT id + NULL as id
from testje
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT id + 5 as id
from testje
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT id + 5 as id
from testje
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT id + id2 as id
from testje
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
  public toChar() {
    expectReturnType(
      "create table testje ( id int, d timestamp not null);",
      `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT
  to_char(id, '999') as id,
  to_char(d, 'HH:dd') as date
from testje
$$ LANGUAGE sql;
`,
      {
        kind: "record",
        fields: [
          {
            name: { name: "id" },
            type: BuiltinTypeConstructors.Nullable(BuiltinTypes.Text),
          },
          {
            name: { name: "date" },
            type: BuiltinTypes.Text,
          },
        ],
      }
    );
  }

  @Test()
  public generateSeries() {
    expectReturnType(
      "create table testje ( id int, d1 date not null, d2 date not null);",
      `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT
  generate_series(1, 5) as int_range,
  generate_series(d1, d2, interval '1 day') as date_range
from testje
$$ LANGUAGE sql;
`,
      {
        kind: "record",
        fields: [
          {
            name: { name: "int_range" },
            type: BuiltinTypes.Integer,
          },
          {
            name: { name: "date_range" },
            type: BuiltinTypes.Date,
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT CASE id WHEN 0 THEN 5 ELSE 6.5 END as mynumber
FROM testje
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
CREATE FUNCTION myselect() AS $$
INSERT INTO testje (id, name) VALUES (1, 'hello');
$$ LANGUAGE sql;
`,
      { kind: "void" }
    );
  }

  @Test()
  public insertFromSelect() {
    expectReturnType(
      `
create table testje ( id int NOT NULL, name text);
create table testje2 ( id int NOT NULL, name text);
`,
      `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
WITH mycte AS (
  SELECT *
  FROM testje2
  WHERE id = 2
),
inserts_ AS (
  INSERT INTO testje (id, name)
  SELECT nextval('my_seq'), mycte.name FROM mycte
  RETURNING id
)
SELECT * FROM inserts_
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
  public insertErro() {
    expectThrowLike(
      "create table testje ( id int NOT NULL, name text);",
      `
CREATE FUNCTION myselect() AS $$
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
INSERT INTO testje (id, name) VALUES (1, 'hello') RETURNING id;
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
INSERT INTO testje (id, name) VALUES (default, 'hello') RETURNING id;
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
WITH mycte AS (
  SELECT id from testje
)
SELECT * from mycte
$$ LANGUAGE sql;
`,
      {
        kind: "record",
        fields: [{ name: { name: "id" }, type: BuiltinTypes.Integer }],
      }
    );
  }

  @Test()
  public delete_() {
    expectReturnType(
      "create table testje ( id int NOT NULL);",
      `
CREATE FUNCTION mydelete() RETURNS SETOF RECORD AS $$
DELETE FROM testje
WHERE id = 5
RETURNING id
$$ LANGUAGE sql;
`,
      {
        kind: "record",
        fields: [{ name: { name: "id" }, type: BuiltinTypes.Integer }],
      },
      { multipleRows: true }
    );
  }

  @Test()
  public deleteWithExists() {
    expectReturnType(
      "create table testje ( id int NOT NULL);",
      `
CREATE FUNCTION mydelete() RETURNS SETOF RECORD AS $$
DELETE FROM testje
WHERE EXISTS (SELECT * FROM testje t2 WHERE t2.id = testje.id)
RETURNING id
$$ LANGUAGE sql;
`,
      {
        kind: "record",
        fields: [{ name: { name: "id" }, type: BuiltinTypes.Integer }],
      },
      { multipleRows: true }
    );
  }

  @Test()
  public deleteError() {
    expectThrowLike(
      "create table testje ( id int NOT NULL);",
      `
CREATE FUNCTION mydelete() AS $$
DELETE FROM testje
WHERE id = ''
$$ LANGUAGE sql;
`,
      "Can't apply operator"
    );
  }

  @Test()
  public returnsVoid() {
    expectReturnType(
      "create table testje ( id int NOT NULL);",
      `
CREATE FUNCTION mydelete() RETURNS void AS $$
DELETE FROM testje
$$ LANGUAGE sql;
`,
      { kind: "void" },
      { multipleRows: false }
    );
  }

  @Test()
  public selectWithArrayAggAndJsonBuildObject() {
    expectReturnType(
      `
create table first ( id int not null, name text );
create table second ( firstid int not null, name text not null, price int );
create table third ( firstid int not null, name text not null, price int );
`,
      `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$

SELECT id, name, seconds.secondstuff, thirds.thirdstuff
FROM first
LEFT JOIN (
  SELECT s.firstid, array_agg(json_build_object('name', s.name, 'price', s.price)) as secondstuff
  FROM second s
  GROUP BY s.firstid
) seconds ON seconds.firstid = first.id
JOIN (
  SELECT t.firstid, array_agg(json_build_object('name', t.name, 'price', t.price)) as thirdstuff
  FROM third t
  GROUP BY t.firstid
) thirds ON thirds.firstid = first.id

$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
            name: { name: "secondstuff" },
            type: BuiltinTypeConstructors.Nullable(
              BuiltinTypeConstructors.Array({
                kind: "jsonknown",
                record: {
                  kind: "record",
                  fields: [
                    {
                      name: { name: "name" },
                      type: { kind: "scalar", name: { name: "text" } },
                    },
                    {
                      name: { name: "price" },
                      type: {
                        kind: "nullable",
                        typevar: { kind: "scalar", name: { name: "integer" } },
                      },
                    },
                  ],
                },
              })
            ),
          },
          {
            name: { name: "thirdstuff" },
            type: BuiltinTypeConstructors.Nullable(
              BuiltinTypeConstructors.Array({
                kind: "jsonknown",
                record: {
                  kind: "record",
                  fields: [
                    {
                      name: { name: "name" },
                      type: { kind: "scalar", name: { name: "text" } },
                    },
                    {
                      name: { name: "price" },
                      type: {
                        kind: "nullable",
                        typevar: { kind: "scalar", name: { name: "integer" } },
                      },
                    },
                  ],
                },
              })
            ),
          },
        ],
      }
    );
  }

  @Test()
  public ignore_group_by_and_having() {
    expectReturnType(
      "create table testje ( id int not null, name text );",
      `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
  SELECT id, name
  FROM testje
  GROUP BY id
  HAVING COUNT(*) > 2
$$ LANGUAGE sql;
`,
      {
        kind: "record",
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
}
