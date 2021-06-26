const connectionoptions = {};
function mymainfunc() {
  const pg = await connect(connectionoptions);
  const res = safesql<<{"id": integer, "name": text | null, "?": text | null}, [, ]>(`
select id, name, $2
from testje
where id = $1
and name = 'abc'
and name = $2
`,
    [7]
  );
}

mymainfunc();
