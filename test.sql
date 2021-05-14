create table testje ( id int not null, id2 int );

-- insert into testje (id) VALUES (5), (6), ($1);

select id
  from testje
 where
   id = 5
  and id = $1
                            ;
