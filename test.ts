const connectionoptions = {};
function mymainfunc() {
  const pg = await connect(connectionoptions);
  const res = safesql<A, B>(
    `
select id, name
from testje
where id = $1
and name = 'abc'
`,
    [7]
  );
}

mymainfunc();
