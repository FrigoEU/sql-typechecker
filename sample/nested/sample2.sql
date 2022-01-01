CREATE FUNCTION insertIntoTestje(id int, name text DEFAULT NULL)
  RETURNS int
AS $$
  INSERT INTO testje (id, name)
  VALUES (id, name)
  RETURNING id;
$$ LANGUAGE sql;
