import { isPlainObject, mapValues, omit } from "lodash-es";
import assert from "node:assert/strict";
import test from "node:test";
import { type Either, Left, Right } from "purify-ts";
import { parse, type Name, type QName } from "trader-pgsql-ast-parser";
import {
  doCreateFunction,
  parseSetupScripts,
  AnyScalar,
  type ArrayT,
  BuiltinTypeConstructors,
  BuiltinTypes,
  type RecordT,
  type ScalarT,
  type SimpleT,
  type Type,
  type VoidT,
} from "../src/typecheck.ts";
import { registerSqlTypecheckerTypeParsers } from "../src/typeparsers.ts";

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

export function testEq<T>(t1: T, t2: T) {
  return assert.deepEqual(t1, t2);
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
        testEq(res.inputs.length, expectedInputTypes.length);
        expectedInputTypes.forEach((expectedInputType, i) => {
          testEq(removeLocation(res.inputs[i]), expectedInputType);
        });
      },
    });
  });
}

function expectReturnType<T extends SimpleT>(
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
        testEq(removeLocation(res.returns), expectedReturnType);
        if (opts) {
          testEq(res.multipleRows, opts.multipleRows);
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
        assert.match(err.message, new RegExp(expectedError));
      },
      Right: (_) => {
        throw new Error("Should return error");
      },
    });
  });
}

registerSqlTypecheckerTypeParsers();

test("select", () => {
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
});

test("alias", () => {
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
});

test("inputTypes", () => {
  expectInputs(
    "create table testje ( id int not null, name text );",
    `
  CREATE FUNCTION myselect(myid int, myname text default null, array_with_nulls text[] default '{NULL}') RETURNS SETOF RECORD AS $$
  SELECT id, name, array_with_nulls
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
      {
        name: { name: "array_with_nulls" },
        type: BuiltinTypeConstructors.Array(
          BuiltinTypeConstructors.Nullable(BuiltinTypes.Text)
        ),
      },
    ]
  );
});

test("timestampWithTimeZone", () => {
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
});

test("arrayField", () => {
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
});

test("rowNumberOver", () => {
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
});

test("updateFrom", () => {
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
});

test("nullableComparisonInUpdate", () => {
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
});

test("unifyError", () => {
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
});

test("innerJoin", () => {
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
});

test("leftJoin", () => {
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
});

test("rightJoin", () => {
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
});

test("left join lateral", () => {
  expectReturnType(
    "create table testje ( id int not null, name text );",
    `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT t1.id as id1, t2.id as id2
FROM testje t1
JOIN LATERAL
(SELECT t3.id
   FROM testje t3
  WHERE t3.name = t1.name
) AS t2 ON TRUE
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
      ],
    }
  );
});

test("ambiguousIdentifier", () => {
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
});

test("selectStar", () => {
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
});

test("selectTableStar", () => {
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
});

test("dontUseEqualNull", () => {
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
});

test("isNull", () => {
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
});

// , ("Not working yet"(?)")
test.skip("isNull2", () => {
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
});

test("isNotNull", () => {
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
});

test("operators", () => {
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
});

test("overlaps", () => {
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
});

test("round", () => {
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
});

test("textsearch", () => {
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
});

test("overlaps_date", () => {
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
});

test("overlaps_mismatch", () => {
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
});

test("inList", () => {
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
});

test("inListMismatch", () => {
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
});

test("inListParameter", () => {
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
});

test("equalArrays", () => {
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
});

test("equalAny", () => {
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
});

test("equalAnyMismatch", () => {
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
});

test("leftJoinNotNullableInOnClause", () => {
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
});

test("arraySelect", () => {
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
});

test("Array coalesce", () => {
  expectReturnType(
    "create table testje ( id int not null, name text );",
    `
CREATE FUNCTION myselect(arr int[]) RETURNS SETOF RECORD AS $$
    SELECT COALESCE(arr, ARRAY[]::int[])
$$ LANGUAGE sql;
`,
    {
      kind: "record",
      fields: [
        {
          name: { name: "coalesce" },
          type: BuiltinTypeConstructors.Array(BuiltinTypes.Integer),
        },
      ],
    },
    { multipleRows: true }
  );
});

test("arraySelectWithSubquery", () => {
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
});

test("arraySelectWithMulticolumnSubquery", () => {
  expectThrowLike(
    "create table testje ( id int not null, name text );",
    `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT ARRAY(SELECT id, name from testje)
$$ LANGUAGE sql;
`,
    "TypeMismatch"
  );
});

test("count", () => {
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
});

test("countField", () => {
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
});

test("countDistinctField", () => {
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
});

test("extract", () => {
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
});

test("extractError", () => {
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
});

test("extractErrorWithWrongCasting", () => {
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
});

test("jsonMember", () => {
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
});

test("jsonMemberError", () => {
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
});

test("Greatest", () => {
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
});

test("upperLower", () => {
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
});

test("bool_and", () => {
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
});

test("Max", () => {
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
});

test("Coalesce", () => {
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
});

test("nullif", () => {
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
});

test("CoalesceMismatch", () => {
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
});

test("keyword", () => {
  expectReturnType(
    "create table testje ( id int not null, name text);",
    `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT CURRENT_TIMESTAMP
from testje
$$ LANGUAGE sql;
`,
    { kind: "record", fields: [{ name: null, type: BuiltinTypes.TimestampTz }] }
  );
});

test("arrayIndex", () => {
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
});

test("arrayIndexMismatch", () => {
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
});

test("caseWithValue", () => {
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
});

test("caseWithValueMismatchedValues", () => {
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
});

test("caseWithValueMismatchedReturns", () => {
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
});

test("caseWithoutValue", () => {
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
});

test("caseWithoutValueMismatchedCondition", () => {
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
});

test("caseWithoutValueMismatchedReturns", () => {
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
});

test("selectExpr", () => {
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
});

test("selectUnion", () => {
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
});

test("selectUnionAll", () => {
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
});

// @IgnoreTest("Haven't implemented column name resolution properly yet")
test.skip("fieldNameFromOperation", () => {
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
});

test("selectUnionMismatch", () => {
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
});

test("selectValues", () => {
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
});

test("selectValuesMismatchLengths", () => {
  expectThrowLike(
    "create table testje ( id int not null, name text);",
    `
  CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
  SELECT * FROM (VALUES (1, 'one'), (2)) AS vals
  $$ LANGUAGE sql;
  `,
    "TypeMismatch"
  );
});

test("selectValuesMismatchTypes", () => {
  expectThrowLike(
    "create table testje ( id int not null, name text);",
    `
  CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
  SELECT * FROM (VALUES (1, 'one'), (2, 5)) AS vals
  $$ LANGUAGE sql;
  `,
    "TypeMismatch"
  );
});

test("ternary", () => {
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
});

test("ternaryMismatch", () => {
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
});

test("substring", () => {
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
});

test("substring without for", () => {
  expectReturnType(
    "create table testje ( id int not null, name text not null);",
    `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
SELECT SUBSTRING(name from 5) as name
FROM testje
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
});

test("substringNotnullable", () => {
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
});

test("substringMismatch", () => {
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
});

test("cast", () => {
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
});

test("cast_double_precision_to_numeric", () => {
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
});

test("operatorOnNullable1", () => {
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
});

test("operatorOnNullable2", () => {
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
});

test("operatorOnNullable3", () => {
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
});

test("operatorOnNullable4", () => {
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
});

test("toChar", () => {
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
});

test("generateSeries", () => {
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
});

test("unification", () => {
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
});

test("insert", () => {
  expectReturnType(
    "create table testje ( id int NOT NULL, name text);",
    `
CREATE FUNCTION myselect() AS $$
INSERT INTO testje (id, name) VALUES (1, 'hello');
$$ LANGUAGE sql;
`,
    { kind: "void" }
  );
});

test("insertFromSelect", () => {
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
});

test("insertErro", () => {
  expectThrowLike(
    "create table testje ( id int NOT NULL, name text);",
    `
CREATE FUNCTION myselect() AS $$
INSERT INTO testje (id, name) VALUES (1, 2);
$$ LANGUAGE sql;
`,
    "TypeMismatch"
  );
});

test("returning", () => {
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
});

test("default_", () => {
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
});

test("with", () => {
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
});

test("delete_", () => {
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
});

test("deleteWithExists", () => {
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
});

test("deleteError", () => {
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
});

test("returnsVoid", () => {
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
});

test("selectWithArrayAggAndJsonBuildObject", () => {
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
});

test("ignore_group_by_and_having", () => {
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
});

test("array_position", () => {
  expectReturnType(
    "create table testje ( id int not null);",
    `
CREATE FUNCTION myselect( names text[] DEFAULT '{NULL}' ) RETURNS SETOF RECORD AS $$
  SELECT id
  FROM testje
  WHERE array_position(names, NULL) IS NOT NULL
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
});

test("array_length", () => {
  expectReturnType(
    "create table testje ( id int not null);",
    `
CREATE FUNCTION myselect( names text[] DEFAULT '{NULL}' ) RETURNS SETOF RECORD AS $$
  SELECT id, array_length(names, 1) AS len
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
          name: { name: "len" },
          type: BuiltinTypes.Integer,
        },
      ],
    }
  );
});

test("array_length", () => {
  expectReturnType(
    "create table testje ( id int not null);",
    `
CREATE FUNCTION myselect( names text[] DEFAULT NULL) RETURNS SETOF RECORD AS $$
  SELECT id, array_length(names, 1) AS len
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
          name: { name: "len" },
          type: BuiltinTypeConstructors.Nullable(BuiltinTypes.Integer),
        },
      ],
    }
  );
});

test("find_unused_vars", () => {
  expectThrowLike(
    "create table testje ( id int not null);",
    `
CREATE FUNCTION myselect( my_id int ) RETURNS SETOF RECORD AS $$
  SELECT id
  FROM testje
$$ LANGUAGE sql;
`,
    "Unused argument my_id"
  );
});

test("update_check_set_unify", () => {
  expectThrowLike(
    "create table testje ( id int not null);",
    `
CREATE FUNCTION myupdate( my_name text ) RETURNS void AS $$
      UPDATE testje
      SET id = my_name;
$$ LANGUAGE sql;
`,
    "TypeMismatch"
  );
});

test("update_check_set_correct_col", () => {
  expectThrowLike(
    "create table testje ( id int not null);",
    `
CREATE FUNCTION myupdate( my_name text ) RETURNS void AS $$
      UPDATE testje
      SET bloob = my_name;
$$ LANGUAGE sql;
`,
    "UnknownField bloob"
  );
});

test("limit", () => {
  expectThrowLike(
    "create table testje ( id int not null);",
    `
CREATE FUNCTION myupdate( my_name text ) RETURNS SETOF RECORD AS $$
      SELECT *
        FROM testje
       LIMIT my_name
$$ LANGUAGE sql;
`,
    "TypeMismatch"
  );
});

test("arrayConcat", () => {
  expectReturnType(
    "create table testje ( id int not null, numbers int[] NOT NULL );",
    `
CREATE FUNCTION myselect(mynum int) RETURNS void AS $$
      UPDATE testje
         SET numbers = numbers || mynum
$$ LANGUAGE sql;
`,
    { kind: "void" }
  );
});

test("length", () => {
  expectReturnType(
    "create table testje ( id int not null, name text not null );",
    `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
    SELECT length(name) as l
    FROM testje
$$ LANGUAGE sql;
`,
    {
      kind: "record",
      fields: [
        {
          name: { name: "l" },
          type: BuiltinTypes.Integer,
        },
      ],
    }
  );
});

test("starts_with", () => {
  expectReturnType(
    "create table testje ( id int not null, name text not null );",
    `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
    SELECT starts_with(name, 'haha') AS l
    FROM testje
$$ LANGUAGE sql;
`,
    {
      kind: "record",
      fields: [
        {
          name: { name: "l" },
          type: BuiltinTypes.Boolean,
        },
      ],
    }
  );
});

test("&& OK", () => {
  expectReturnType(
    "create table testje ( id int not null);",
    `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
    SELECT id
      FROM testje
     WHERE '{}'::int[] && '{}'::int[]
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
});

test("&& error: strict", () => {
  expectThrowLike(
    "create table testje ( id int not null);",
    `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
    SELECT id
      FROM testje 
     WHERE '{}'::text[] && '{}'::int[]
$$ LANGUAGE sql;
`,
    "TypeMismatch"
  );
});

test("comparing different domains should error", () => {
  expectThrowLike(
    `
    create domain my_id AS int;
    create domain my_other_id AS int;
    create table testje ( id my_id not null, other_id my_other_id not null);
`,
    `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
    SELECT 1
      FROM testje 
     WHERE id = other_id
$$ LANGUAGE sql;
`,
    'Can\'t apply operator "=" to my_id and my_other_id'
  );
});

test("comparing same domain should be ok", () => {
  expectReturnType(
    `
    create domain my_id AS int;
    create table testje ( id my_id not null);
`,
    `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
    SELECT 1::int as dummy
      FROM testje 
     WHERE id = id
       AND id <> id
       AND id > id
$$ LANGUAGE sql;
`,
    {
      kind: "record",
      fields: [
        {
          name: { name: "dummy" },
          type: BuiltinTypes.Integer,
        },
      ],
    }
  );
});

test("aggregate function on numeric domain should result in same domain", () => {
  expectReturnType(
    `
    create domain my_id AS int;
    create table testje ( id my_id not null);
`,
    `
CREATE FUNCTION myselect() RETURNS RECORD AS $$
    SELECT sum(id) as sum_id
      FROM testje 
$$ LANGUAGE sql;
`,
    {
      kind: "record",
      fields: [
        {
          name: { name: "sum_id" },
          type: {
            kind: "scalar",
            name: { name: "my_id" },
          },
        },
      ],
    }
  );
});

test("casting int domain to text", () => {
  expectReturnType(
    `
    create domain my_id AS int;
    create table testje ( id my_id not null);
`,
    `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
    SELECT id::int::text AS id
      FROM testje 
$$ LANGUAGE sql;
`,
    {
      kind: "record",
      fields: [
        {
          name: { name: "id" },
          type: BuiltinTypes.Text,
        },
      ],
    }
  );
});

test("union with domains", () => {
  expectReturnType(
    `
    create domain my_id AS int;
    create table testje ( id my_id not null);
`,
    `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
    SELECT id
      FROM testje 
     UNION
    SELECT id
      FROM testje
$$ LANGUAGE sql;
`,
    {
      kind: "record",
      fields: [
        {
          name: { name: "id" },
          type: {
            domain: {
              realtype: {
                kind: "scalar",
                name: {
                  name: "integer",
                },
              },
            },
            kind: "scalar",
            name: {
              name: "my_id",
            },
          },
        },
      ],
    }
  );
});

test("select from values", () => {
  expectReturnType(
    `
    create table testje ( id int8 not null);
`,
    `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
  SELECT weekday, date
    FROM (VALUES
    ('Monday',    '0 days'::interval),
    ('Tuesday',   '1 days'::interval),
    ('Wednesday', '2 days'::interval),
    ('Thursday',  '3 days'::interval),
    ('Friday',    '4 days'::interval),
    ('Saturday',  '5 days'::interval),
    ('Sunday',    '6 days'::interval)
  ) AS t(weekday, date)
$$ LANGUAGE sql;
`,
    {
      kind: "record",
      fields: [
        {
          name: { name: "weekday" },
          type: BuiltinTypes.Text,
        },
        {
          name: { name: "date" },
          type: BuiltinTypes.Interval,
        },
      ],
    }
  );
});

test("select from values", () => {
  expectReturnType(
    `
    create table testje ( id int8 not null);
`,
    `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
  SELECT weekday, date
    FROM (VALUES
    ('Monday',    '0 days'::interval),
    ('Tuesday',   '1 days'::interval),
    ('Wednesday', '2 days'::interval),
    ('Thursday',  '3 days'::interval),
    ('Friday',    '4 days'::interval),
    ('Saturday',  '5 days'::interval),
    ('Sunday',    '6 days'::interval)
  ) AS t(weekday, date)
$$ LANGUAGE sql;
`,
    {
      kind: "record",
      fields: [
        {
          name: { name: "weekday" },
          type: BuiltinTypes.Text,
        },
        {
          name: { name: "date" },
          type: BuiltinTypes.Interval,
        },
      ],
    }
  );
});

test("tsmultirange", () => {
  expectReturnType(
    `
    create table testje ( id int8 not null, name text NOT NULL, date date NOT NULL, time time NOT NULL, interval interval NOT NULL);
`,
    `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
  select name,
    range_agg(
      tsrange(
        date + time,
        date + time + interval
      )
    )::tsmultirange
    - 
    range_agg(
      tsrange(
        date + time,
        date + time + interval
      )
    )::tsmultirange as ranges
  from testje
  group by name
$$ LANGUAGE sql;
`,
    {
      kind: "record",
      fields: [
        {
          name: { name: "name" },
          type: BuiltinTypes.Text,
        },
        {
          name: { name: "ranges" },
          type: BuiltinTypes.TimestampMultiRange,
        },
      ],
    }
  );
});

test("tsmultirange constructor", () => {
  expectReturnType(
    `
    create table testje ( id int8 not null, name text not null);
`,
    `
CREATE FUNCTION myselect() RETURNS SETOF RECORD AS $$
  select name, tsmultirange() as ranges
  from testje
  group by name
$$ LANGUAGE sql;
`,
    {
      kind: "record",
      fields: [
        {
          name: { name: "name" },
          type: BuiltinTypes.Text,
        },
        {
          name: { name: "ranges" },
          type: BuiltinTypes.TimestampMultiRange,
        },
      ],
    }
  );
});
