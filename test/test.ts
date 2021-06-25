import { Expect, Test, TestCase, TestFixture } from "alsatian";

// https://github.com/alsatian-test/alsatian/blob/master/packages/alsatian/README.md

@TestFixture("whatever you'd like to call the fixture")
export class TypecheckerTests {
  // use the async/await pattern in your tests as you would in your code
  // @Test("asychronous test")
  // public async asyncTest() {
  //   const response = await somethingToHappen();

  //   Expect(response).toBeDefined();
  // }

  // pass arguments into your test functions to keep your test code from being repetative
  // @TestCase(2, 2, 4)
  // @TestCase(2, 3, 5)
  // @TestCase(3, 3, 6)
  // @Test("addition tests")
  // public addTest(
  //   firstNumber: number,
  //   secondNumber: number,
  //   expectedSum: number
  // ) {
  //   Expect(firstNumber + secondNumber).toBe(expectedSum);
  // }

  @Test("Two unifvars test")
  public twoUnifvarsTest() {
    const setup = "create table testje ( id int not null, name text );";
    const query = `
select id, name
from testje
where id = $1
and $1 = $2
`;
  }
}
