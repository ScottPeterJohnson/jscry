import {quoteJsString, debugLog, stringHash, objGetOrPut, corsReachable} from "../utility/Utility";
import {ScriptConfigurationMessage} from "endpoints";
import {
	jscryScriptLoadState, jscryScriptLoadStateReady, jscryScriptLoadStateDone,
	jscryScriptLoadStatePending, jscryIsScript, jscryLoadScriptFunction, jscryLoadInlineScriptFunction,
	jscryScriptLoadStateCors, jscryLoadCorsScriptFunction, jscryExecuteAddedCodeFunction
} from "./Exposed";
import {transform} from "./WebVisitor";
import {Javascript} from "../transform/Transform";
import {installXmlHttpRequestHooks} from "./hooks/XmlHttpRequestHooks";
import {DomLoadingEvents} from "./hooks/DomLoadingEvents";
import {collector} from "./interface/ServerInterface";
import {HashToOriginalContent, onScriptConfiguration, originalScriptContent} from "./interface/ScriptConfigurations";
import {installedConfig, pageUrl} from "./Config";

export function installTransformHooks() {
	installXmlHttpRequestHooks();
	domLoadingEvents.installHooks();
	(window as any)[jscryLoadScriptFunction] = loadExternalScript;
	(window as any)[jscryLoadInlineScriptFunction] = loadInlineScript;
	(window as any)[jscryLoadCorsScriptFunction] = loadCorsScript;
}

export const domLoadingEvents = new DomLoadingEvents();

interface CorsLoadingScript {
	type: "CORS"
	ready: boolean
	added : boolean
	sources: string[]
}

interface OtherLoadingScript {
	type: "INLINE" | "EXTERNAL"
	ready: boolean
	text: string|null
}

type LoadingScript = CorsLoadingScript | OtherLoadingScript;

const scriptsLoading : Array<LoadingScript> = [];
let nextLoadingScriptIndex = 0;

//Load scripts in-order as they become available.
let loadComplete = false;
export function checkScriptsLoaded() {
	if(!scriptsLoading.length){ return; }
	while(nextLoadingScriptIndex < scriptsLoading.length){
		const next = scriptsLoading[nextLoadingScriptIndex];
		if(next.type == "CORS" && !next.added){
			next.added = true;
			let script : HTMLScriptElement | null = null;
			for(const src of next.sources) {
				script = document.createElement("script");
				script.src = src;
				//Necessary to prevent reordering between CORS script tags
				script.setAttribute("async", "false");
				document.head.appendChild(script);
			}
			script!.addEventListener("load", function(){
				next.ready = true;
				checkScriptsLoaded();
			});
		}
		if(!next.ready){ return; }
		else {
			nextLoadingScriptIndex += 1;
			if(next.type !== "CORS" && next.text != null) {
				/**
				 * Time to execute this script.
				 * There are a few ways this could be done, and eval() was decided on after much hand-wringing.
				 * It has the drawback of not adding a script tag. Anyone who relies on that is not going to have a good time.
				 * It has the benefit of actually working properly with debuggers, thanks to sourceURL, which refuses to work
				 * with both data-uris and plain script content (and eval in a script). It may have the side benefit of being pretty simple.
				 */
					//Also, "use strict" directives mess up our eval.
					//Strict mode specifically disables exporting to global scope from eval scripts but not script tags.
					//Since this is a character (and probably line) preserving replacement, it shouldn't mess up source maps.
				const modifiedText = next.text.replace(/^(\s*)"use strict"/, '$1"not strict"');
				try {
					//See scope notes on https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/eval
					const geval = eval;
					geval(modifiedText);
				} finally {
					//Toplevel the error for any error handlers like that, but continue adding scripts ASAP.
					setTimeout(() => {
						checkScriptsLoaded();
					}, 0);
				}
			}
		}
	}
	//If we got here, loading should be actually complete!
	//All the browser events of course have long since fired, so we'll have to refire them.
	if(!loadComplete){
		loadComplete = true;
		if("hash" in window.location) {
			//Without this line, the "onhashchange" event would not fire the first time the hash changed (visible in the console app)
			//noinspection SillyAssignmentJS
			window.location.hash = window.location.hash;
		}
		collector.sendSetupDoneMessage();
		domLoadingEvents.refireDomLoadEventsAsNecessary();
	}
}

/**
 * For every script tag found on the page, transform its javascript.
 */
export function hookDocumentScripts(doc: Document, firstDocumentPosition : number) {
	let loadScriptText = "";
	const scripts = doc.querySelectorAll("script");
	let innerScriptCount = 0;
	for (let i = 0; i < scripts.length; i++) {
		if(i<firstDocumentPosition){ continue; }
		const script = scripts[i];
		if (!script.hasAttribute("src")) {
			loadScriptText += hookEmbeddedScript(script, innerScriptCount);
			innerScriptCount += 1;
		} else if (corsReachable(script.getAttribute("src")!, installedConfig.corsAllowedPatterns)) {
			loadScriptText += hookExternalScript(script);
		} else {
			const async = script.getAttribute("async");
			const isAsync = async && async !== "false";
			const defer = script.getAttribute("defer");
			const isDefer = defer && defer !== "false";
			if (!isAsync && !isDefer) {
				loadScriptText += hookCorsScript(script);
			}
			//Async/defer CORS scripts will be ignored.
		}
	}
	const loadScript = document.createElement("script");
	loadScript.text = loadScriptText;
	doc.head.insertBefore(loadScript, null);
}


function loadExternalScript(src : string){
	const loadObj : OtherLoadingScript = {
		type: "EXTERNAL",
		ready: false,
		text: null
	};
	scriptsLoading.push(loadObj);
	const request = new XMLHttpRequest();
	(request as any)[jscryIsScript] = true;
	request.addEventListener("load", function(){
		if(request.status == 200){
			loadObj.text = request.responseText;
		}
	});
	request.addEventListener("loadend", function(){
		loadObj.ready = true;
		checkScriptsLoaded();
	});
	request.open("GET", src);
	request.send();
}

function loadInlineScript(index : number, content : string){
	const loadObj : OtherLoadingScript = {
		type: "INLINE",
		ready: false,
		text: null
	};
	scriptsLoading.push(loadObj);
	const hash = stringHash(content);
	const scriptIdentifier = `script_${index}|${pageUrl}`;
	objGetOrPut<HashToOriginalContent>(originalScriptContent, scriptIdentifier, () => ({}))[hash] = {
		fullUrl: scriptIdentifier,
		sourceMapHeader: null as any as string,
		content: content
	};
	onScriptConfiguration(scriptIdentifier, hash, (config)=>{
		loadObj.ready = true;
		try {
			loadObj.text = Javascript.unwrap(transform(config, Javascript.wrap(content)));
		} catch(e) {
			loadObj.text = content;
			console.error(e);
		}
		checkScriptsLoaded();
	});
}

function loadCorsScript(src : string){
	const lastLoaded = scriptsLoading[scriptsLoading.length-1];
	if(lastLoaded && lastLoaded.type === "CORS"){
		lastLoaded.sources.push(src);
	} else {
		const loadObj: CorsLoadingScript = {
			type: "CORS",
			ready: false,
			added: false,
			sources: [src]
		};
		scriptsLoading.push(loadObj);
	}
}

export function hookEmbeddedScript(script: HTMLScriptElement, index : number) : string {
	script.parentNode!.removeChild(script);
	return `${jscryLoadInlineScriptFunction}(${index}, \"${quoteJsString(script.text)}\")\n`;
}

export function hookExternalScript(script: HTMLScriptElement) : string {
	script.parentNode!.removeChild(script);
	return `${jscryLoadScriptFunction}(\"${quoteJsString(script.src)}\")\n`;
}

export function hookCorsScript(script : HTMLScriptElement) : string {
	const src = script.src;
	const prefetch = document.createElement("link");
	prefetch.setAttribute("rel", "preload");
	prefetch.setAttribute("as", "script");
	prefetch.setAttribute("href", src);
	script.parentElement!.insertBefore(prefetch, script);
	script.parentNode!.removeChild(script);
	return `${jscryLoadCorsScriptFunction}(\"${quoteJsString(script.src)}\")\n`;
}