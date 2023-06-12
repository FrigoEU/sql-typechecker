INSERT INTO testje (id, name)
VALUES (:id, :name)
       RETURNING id;
