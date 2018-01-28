test_sourcemap_jsonp([0],[
/* 0 */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
Object.defineProperty(__webpack_exports__, "__esModule", { value: true });
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_0_babel_runtime_helpers_classCallCheck__ = __webpack_require__(1);
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_0_babel_runtime_helpers_classCallCheck___default = __webpack_require__.n(__WEBPACK_IMPORTED_MODULE_0_babel_runtime_helpers_classCallCheck__);


var Test = function () {
    function Test() {
        __WEBPACK_IMPORTED_MODULE_0_babel_runtime_helpers_classCallCheck___default.a(this, Test);
    }

    Test.prototype.test = function test() {
        var _this = this;

        console.log("TestSourceMap ready!");
        setInterval(function () {
            _this.testValue += 1;
        }, 1000);
    };

    return Test;
}();

var test = new Test();
test.test();
test.testValue = 2;

/***/ })
],[0]);
//# sourceMappingURL=test-sourcemap.js.map