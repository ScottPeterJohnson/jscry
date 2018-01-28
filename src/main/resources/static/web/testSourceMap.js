//You may need to manually compile this:
// tsc testSourceMap.ts --sourceMap
var Test = (function () {
    function Test() {
    }
    Test.prototype.test = function () {
        var _this = this;
        console.log("TestSourceMap ready!");
        setInterval(function () {
            _this.testValue += 1;
        }, 1000);
    };
    return Test;
}());
var test = new Test();
test.test();
test.testValue = 2;
//# sourceMappingURL=testSourceMap.js.map