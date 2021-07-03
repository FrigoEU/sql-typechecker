
pg_catalog | !    | bigint                      |                             | numeric                     | factorial
pg_catalog | !!   |                             | bigint                      | numeric                     | deprecated, use ! instead
pg_catalog | !!   |                             | tsquery                     | tsquery                     | NOT tsquery
pg_catalog | #    |                             | path                        | integer                     | number of points
pg_catalog | #    |                             | polygon                     | integer                     | number of points



pg_catalog | +    |                             | bigint                      | bigint                      | unary plus
pg_catalog | +    |                             | double precision            | double precision            | unary plus
pg_catalog | +    |                             | integer                     | integer                     | unary plus
pg_catalog | +    |                             | numeric                     | numeric                     | unary plus
pg_catalog | +    |                             | real                        | real                        | unary plus
pg_catalog | +    |                             | smallint                    | smallint                    | unary plus


pg_catalog | -    |                             | bigint                      | bigint                      | negate
pg_catalog | -    |                             | double precision            | double precision            | negate
pg_catalog | -    |                             | integer                     | integer                     | negate
pg_catalog | -    |                             | interval                    | interval                    | negate
pg_catalog | -    |                             | numeric                     | numeric                     | negate
pg_catalog | -    |                             | real                        | real                        | negate
pg_catalog | -    |                             | smallint                    | smallint                    | negate

pg_catalog | ?-   |                             | line                        | boolean                     | horizontal
pg_catalog | ?-   |                             | lseg                        | boolean                     | horizontal


pg_catalog | ?|   |                             | line                        | boolean                     | vertical
pg_catalog | ?|   |                             | lseg                        | boolean                     | vertical


pg_catalog | @    |                             | bigint                      | bigint                      | absolute value
pg_catalog | @    |                             | double precision            | double precision            | absolute value
pg_catalog | @    |                             | integer                     | integer                     | absolute value
pg_catalog | @    |                             | numeric                     | numeric                     | absolute value
pg_catalog | @    |                             | real                        | real                        | absolute value
pg_catalog | @    |                             | smallint                    | smallint                    | absolute value
pg_catalog | @-@  |                             | lseg                        | double precision            | distance between endpoints
pg_catalog | @-@  |                             | path                        | double precision            | sum of path segment lengths



pg_catalog | @@   |                             | box                         | point                       | center of
pg_catalog | @@   |                             | circle                      | point                       | center of
pg_catalog | @@   |                             | lseg                        | point                       | center of
pg_catalog | @@   |                             | path                        | point                       | center of
pg_catalog | @@   |                             | polygon                     | point                       | center of

pg_catalog | |    |                             | tinterval                   | abstime                     | start of interval


pg_catalog | |/   |                             | double precision            | double precision            | square root

pg_catalog | ||/  |                             | double precision            | double precision            | cube root


pg_catalog | ~    |                             | bigint                      | bigint                      | bitwise not
pg_catalog | ~    |                             | bit                         | bit                         | bitwise not
pg_catalog | ~    |                             | inet                        | inet                        | bitwise not
pg_catalog | ~    |                             | integer                     | integer                     | bitwise not
pg_catalog | ~    |                             | macaddr                     | macaddr                     | bitwise not
pg_catalog | ~    |                             | smallint                    | smallint                    | bitwise not
