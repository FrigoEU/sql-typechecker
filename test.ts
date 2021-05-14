const connectionoptions = {};
function mymainfunc() {
  const pg = await connect(connectionoptions);
  const res = safesql<A, B>(
    `
select id
from testje
where id = $1
`,
    [7]
  );

  const res2 = safesql(`
select id
from testje
where id = 5
`);
}

mymainfunc();
