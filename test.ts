const connectionoptions = {};
function mymainfunc() {
  const pg = await connect(connectionoptions);
  const res = safesql<A, B>(
    `
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
