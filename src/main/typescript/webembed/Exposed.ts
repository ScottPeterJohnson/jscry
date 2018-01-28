/**
 * This file contains all the strings exposed by the application.
 * They will be preserved through closure compiler and show up in messages and the DOM.
 * Some are kept more verbose than absolutely necessary for customers' convenience.
 */

export const jScry = "jScry";
export const jscryScriptLoadState = `${jScry}Loaded`;
export const jscryMetaTagFinishedId = `${jScry}Finished`;
export const noConfigError = `${jScry} disabled: no config`;
export const jScryLog = `$${jScry}Log`;

export const jscryScriptLoadStateCors = "cors";
export const jscryScriptLoadStateReady = "ready";
export const jscryScriptLoadStatePending = "pending";
export const jscryScriptLoadStateDone = "done";

const scriptPrefix = "$_" + jScry;
export const jscryLoadScriptFunction = `${scriptPrefix}LoadScript`;
export const jscryLoadInlineScriptFunction = `${scriptPrefix}LoadInlineScript`;
export const jscryLoadCorsScriptFunction = `${scriptPrefix}LoadCorsScript`;
export const jscryExecuteAddedCodeFunction = `${scriptPrefix}Exec`;
export const jscryIsScript = `${scriptPrefix}IsScript`;

export const jscrySessionStorageTransformedCheckKey = `${jScry}TransformedWasLoaded`;

export const jScryScripts = scriptPrefix + "_scripts";

export const jscryHookedListenerProperty = `${scriptPrefix}HookedListener`;

export function pageStorageReloadTag(timestamp : string) : string {
	return jscrySessionStorageTransformedCheckKey + "_" + timestamp + "_" + window.location.href
}

export function executionArrayName(scriptId : number) : string {
	return scriptPrefix + "_exec_" + scriptId;
}

export function statementIdArrayName(scriptId : number) : string {
	return scriptPrefix + "_map_" + scriptId;
}
