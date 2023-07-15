import { types } from "pg";
import array from "postgres-array";
import range from "postgres-range";

// We basically disable most parsing by 'pg', so we can do the parsing
// ourselves in the generated code
export function registerSqlTypecheckerTypeParsers() {
  // "date" format: 2020-10-28
  types.setTypeParser(types.builtins.DATE, null as any);

  // "time" format: 17:30:00
  types.setTypeParser(types.builtins.TIME, null as any);

  // "timestamp without time zone" 2020-09-22T15:09:09.145
  types.setTypeParser(types.builtins.TIMESTAMP, null as any);

  // "timestamp with time zone" 2022-06-23T15:52:39.77314+00:00
  types.setTypeParser(types.builtins.TIMESTAMPTZ, null as any);

  types.setTypeParser(1115, array.parse); // timestamp without time zone[]
  types.setTypeParser(1182, array.parse); // date[]
  types.setTypeParser(1185, array.parse); // timestamp with time zone[]

  types.setTypeParser(1183, array.parse); // time[]
  types.setTypeParser(1270, array.parse); // timetz[]

  // https://www.npmjs.com/package/postgres-range
  // Range includes Included/Excluded bounds specification!
  types.setTypeParser(3908, range.parse); // tsrange
  types.setTypeParser(3910, range.parse); // tstzrange
  types.setTypeParser(3912, range.parse); // daterange

  types.setTypeParser(1000, array.parse); // bool array
  types.setTypeParser(1005, array.parse); // array int2
  types.setTypeParser(1007, array.parse); // array int4
  types.setTypeParser(1016, array.parse); // array int8
  types.setTypeParser(1021, array.parse); // array float4
  types.setTypeParser(1022, array.parse); // array float8
  types.setTypeParser(1231, array.parse); // array numeric
  types.setTypeParser(1014, array.parse); // array char
  types.setTypeParser(1015, array.parse); //array varchar
  types.setTypeParser(1008, array.parse); // array string?
  types.setTypeParser(1009, array.parse); // array string?

  return types;
}
