const connectionoptions = {};
function mymainfunc() {
  const pg = await connect(connectionoptions);
  const res = safesql<<{"id": integer, "name": text | null}, [integer, text | null]>(`
select id, name
from testje
where id = $1
and name = 'abc'
and name = $2
`,
    [7]
  );
}

mymainfunc();
