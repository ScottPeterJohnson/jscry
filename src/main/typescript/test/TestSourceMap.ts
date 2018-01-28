class Test {
	testValue : number;
	test(){
		console.log("TestSourceMap ready!");
		setInterval(()=>{
			this.testValue += 1;
		}, 1000);
	}
}
const test = new Test();
test.test();
test.testValue = 2;