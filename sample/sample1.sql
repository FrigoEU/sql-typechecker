CREATE TABLE testje (
  id int NOT NULL,
  name text
);

CREATE FUNCTION selectFromTestje()
RETURNS SETOF
AS $$
  SELECT ARRAY(SELECT id from testje)
$$ LANGUAGE sql;
