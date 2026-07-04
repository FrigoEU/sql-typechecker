I've been thinking a lot about modelling "sum types" in Postgres database tables.

The theoretically best way is to use a "tag" or "type" column and matching CHECK constraints that say "if you're this type then that field should be filled out", eg:

```typescript
type client =
  | { tag: "person"; name: string }
  | { tag: "company"; vatnumber: number };
```

```sql
CREATE ENUM client_type ('person', 'company');
CREATE TABLE clients (
  id serial primary key,
  tag client_type NOT NULL,
  name text,
  vatnumber int,
  CHECK (tag = 'person' AND name IS NOT NULL)
     OR (tag = 'company' AND vatnumber IS NOT NULL)
);
```

I've been thinking how this repo could correctly infer something like this:

```sql
SELECT id, tag, name
  FROM clients
 WHERE tag = 'person';
```

as {id: number, tag: 'person', name: string}, so having the name be not null and the tag be a constant string.

As well as:

```sql
SELECT id,
       CASE clients.tag
       WHEN 'person'
       THEN JSONB_BUILD_OBJECT('tag', 'person', 'name', clients.name)
       WHEN 'company'
       THEN JSONB_BUILD_OBJECT('tag', 'company', 'vatnumber', clients.vatnumber)
       END AS client
  FROM clients;
```

and have as result type:
{id: number, client: {tag: 'person', name: string} | {tag: 'company', vatnumber: number} }

What do you think?
