SELECT *
  FROM testje
 WHERE id = :my_id
   AND name = ANY(:my_names)
