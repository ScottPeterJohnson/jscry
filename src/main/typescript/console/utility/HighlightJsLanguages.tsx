
//The following list of highlightjs supported languages and names is ripped from http://highlightjs.readthedocs.io/en/latest/css-classes-reference.html
//The script to do that: (set table = the table in inspector)
/*
 [].slice.apply(table.querySelectorAll("tr")).forEach(function (row) {
 var tds = row.querySelectorAll("td");
 console.log("\"" + tds[0].innerText + "\":" + JSON.stringify(tds[1].innerText.split(",").map(function (r) {
 return r.trim();
 })));
 });
 */

import * as hljs from "highlight.js/lib/highlight.js"

export const languageProperNames : {[handle:string]:string} = {};
function registerLanguage(name : string, obj : any){
	hljs.registerLanguage(name.toLowerCase(), obj);
	languageProperNames[name.toLowerCase()] = name;
}

registerLanguage('ActionScript', require('highlight.js/lib/languages/actionscript'));
registerLanguage('C#', require('highlight.js/lib/languages/cs'));
registerLanguage('C++', require('highlight.js/lib/languages/cpp'));
registerLanguage('C/AL', require('highlight.js/lib/languages/cal'));
registerLanguage('Clojure', require('highlight.js/lib/languages/clojure'));
registerLanguage('CoffeeScript', require('highlight.js/lib/languages/coffeescript'));
registerLanguage('D', require('highlight.js/lib/languages/d'));
registerLanguage('Dart', require('highlight.js/lib/languages/dart'));
registerLanguage('Elm', require('highlight.js/lib/languages/elm'));
registerLanguage('Erlang', require('highlight.js/lib/languages/erlang'));
registerLanguage('F#', require('highlight.js/lib/languages/fsharp'));
registerLanguage('Go', require('highlight.js/lib/languages/go'));
registerLanguage('Groovy', require('highlight.js/lib/languages/groovy'));
registerLanguage('Haskell', require('highlight.js/lib/languages/haskell'));
registerLanguage('Haxe', require('highlight.js/lib/languages/haxe'));
registerLanguage('Java', require('highlight.js/lib/languages/java'));
registerLanguage('JavaScript', require('highlight.js/lib/languages/javascript'));
registerLanguage('Lua', require('highlight.js/lib/languages/lua'));
registerLanguage('Nimrod', require('highlight.js/lib/languages/nimrod'));
registerLanguage('Objective C', require('highlight.js/lib/languages/objectivec'));
registerLanguage('PHP', require('highlight.js/lib/languages/php'));
registerLanguage('Perl', require('highlight.js/lib/languages/perl'));
registerLanguage('Python', require('highlight.js/lib/languages/python'));
registerLanguage('Ruby', require('highlight.js/lib/languages/ruby'));
registerLanguage('Rust', require('highlight.js/lib/languages/rust'));
registerLanguage('Scala', require('highlight.js/lib/languages/scala'));
registerLanguage('Scheme', require('highlight.js/lib/languages/scheme'));
registerLanguage('Swift', require('highlight.js/lib/languages/swift'));
registerLanguage('TypeScript', require('highlight.js/lib/languages/typescript'));
registerLanguage('VB.Net', require('highlight.js/lib/languages/vbnet'));

export function consoleHighlightBlock(node : HTMLElement){
	hljs.highlightBlock(node);
}

export function hljsLanguages(){
	return hljs.listLanguages();
}

export function getHljsLanguage(lang : string){
	return hljs.getLanguage(lang);
}