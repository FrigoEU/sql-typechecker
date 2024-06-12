CREATE OR REPLACE FUNCTION insertIntoTestje(id int, name text DEFAULT NULL)
  RETURNS VOID
AS $$
  INSERT INTO testje (id, name)
  VALUES (id, name);
  $$ LANGUAGE sql;


CREATE OR REPLACE FUNCTION selectFromTestje1()
  RETURNS record
AS $$
  SELECT *
  FROM testje
$$ LANGUAGE sql;

CREATE FUNCTION selectFromTestje2()
  RETURNS SETOF record
AS $$
  SELECT *
  FROM testje
$$ LANGUAGE sql;

-- select * from selectFromTestje1() AS (id int, name text);

-- select * from selectFromTestje2() AS (id int, name text);
