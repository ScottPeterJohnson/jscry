import {addAllChildrenToFront, corsReachable, debugLog, Observable} from "../utility/Utility";
import {getConfig, installedConfig} from "./Config";
import {installCollectors} from "./interface/ServerInterface";
import {
	checkScriptsLoaded, domLoadingEvents, hookCorsScript, hookEmbeddedScript, hookExternalScript, installTransformHooks
} from "./Hooks";
import {
	jscryMetaTagFinishedId, noConfigError, jscrySessionStorageTransformedCheckKey,
	pageStorageReloadTag
} from "./Exposed";
import {DocumentWriteInjection} from "./DocumentWriteInjection";
import {JavascriptBreakingInjection} from "./JavascriptBreakingInjection";
import {ClientConfig} from "endpoints";

export interface InjectionMethod {
	//Supplies a function that should be called when collectors and hooks should be installed, i.e. this will be the page to install them in
	whenPageReady(readyInit : ()=>void) : void
	//Return true if page is already transformed and transform() does not need to be called
	isAlreadyTransformed() : boolean
	//Perform transformation
	transform(): void
	//Called before checking whether to do transformation
	beforeTransformCheck(): void
	//Always called last
	last(): void
}


/*
 * This is the net.jscry.main file which, added to web pages, hooks into their same-domain scripts. It accomplishes this by capturing the document
 * before it executes and then rewriting it.
 */
try {
	//Compatibility check for minimum requirements
	const requirements = ["Int16Array", "WebSocket", "sessionStorage"];
	const missingSupport = [];
	for (const requirement of requirements) {
		if (!(requirement in window)) {
			missingSupport.push(requirement);
		}
	}
	if (missingSupport.length) {
		console.log("jScry disabled: no browser support for: " + JSON.stringify(missingSupport));
	}
	let onConfigReady : any = null;
	if (!onConfigReady && !getConfig()) {
		console.error(noConfigError);
	}

	domLoadingEvents.installReadyEventFiringMonitor();

	//const injector = new DocumentWriteInjection();
	const injector = new JavascriptBreakingInjection();
	function onReady(){
		installCollectors();
		installTransformHooks();
		checkScriptsLoaded();
		debugLog("jScry injection complete");
	}
	injector.whenPageReady(() => {
		if(onConfigReady) {
			onConfigReady.then((config : any) => {
				(window as any).$JC = config;
				getConfig();
				onReady();
			});
		} else {
			onReady();
		}
	});
	//First, check if the page has already been transformed.
	if (!injector.isAlreadyTransformed()) {
		injector.beforeTransformCheck();
		//Does the config say we should transform this page?
		let shouldTransform = false;
		try {
			shouldTransform = eval(installedConfig.shouldTransformPageExpression);
		} catch (e) {
			console.error("Error evaluating jScry transform test expression: " + e);
		}
		if (shouldTransform) {
			injector.transform();
		}
	}
	injector.last();
} catch (e) {
	console.error(e);
}