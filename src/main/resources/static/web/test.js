console.log("Hello world!");
var thisIsAString = "string";
var thisIsANumber = 3.45;
var thisIsAnInteger = 5;
var thisIsABoolean = "boolean";
var thisIsUndefined = undefined;
var thisIsAlsoUndefined;
var thisIsNull = null;
var thisIsADomType = document.createElement("div");
var thisIsAnArrayType = [];
var thisContainsARecursiveType = {};
thisContainsARecursiveType.recursiveType = thisContainsARecursiveType;
var thisIsAStringOrBooleanUnion = "string";
thisIsAStringOrBooleanUnion = false;
var thisIsAnObjectType = { thisPropertyIsAString: "string", thisPropertyIsABoolean: true};
var thisIsAFunctionType = function(){};


var obj = {};
obj.stringProp = "test";
obj.boolProp = false;
obj.unionTest = 3;
obj.unionTest = "eleven";

var arrayOfNumbers = [1, 2, 3, 4, 5];

var otherArrayOfNumbers = [];
otherArrayOfNumbers.push(1);
otherArrayOfNumbers.push(2);

function add(x, y){
    return x + y;
}

add(1,2);
var someNumber = add(2,3);

document.addEventListener("DOMContentLoaded", function(){
    console.log("DOMContent was loaded!");
    var button = document.createElement("input");
    button.type = "button";
    document.body.appendChild(button);
    button.addEventListener("click", function(){
        var thisTypeIsFiguredOutOnlyWhenButtonIsClicked = 2;
        alert("the button was clicked");
    });
});

function Cat(){}

var cat = new Cat();

setInterval(function(){
    var x = 2;
}, 10);

console.log("Basic test script complete!");

window.thisIsAMultilineTest || (function test(){ return true; })() ? console.log("Yep!") : 18; var alsoOnTheSameLine = true;