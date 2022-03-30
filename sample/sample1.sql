CREATE TABLE testje (
  id int NOT NULL,
  name text
);

CREATE OR REPLACE FUNCTION selectFromTestje()
RETURNS SETOF record
AS $$
  SELECT ARRAY(SELECT id from testje)
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION selectAllFromTestje()
RETURNS SETOF record
AS $$
  SELECT id, name
  FROM testje
$$ LANGUAGE sql;



