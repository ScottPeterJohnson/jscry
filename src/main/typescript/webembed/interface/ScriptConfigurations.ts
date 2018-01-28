import {ScriptConfigurationMessage, ServerNeedsContentMessage} from "endpoints";
import {collector} from "./ServerInterface";
import {debugLog} from "../../utility/Utility";
import {installedConfig} from "../Config";

type ScriptConfigurationCallback = (config : ScriptConfigurationMessage) => void;
type ScriptConfigurationFuture = { config : ScriptConfigurationMessage|null, waiting : Array<ScriptConfigurationCallback>}
const scriptConfigurations : {[scriptUrl : string] : {[hash : number] : ScriptConfigurationFuture}} = {};

export function onScriptConfiguration(scriptUrl : string, hash : number, callback : (config : ScriptConfigurationMessage)=>void){
	let knownHashMap, awaitingObj, scriptConfiguration;
	if((knownHashMap=scriptConfigurations[scriptUrl]) && (awaitingObj=knownHashMap[hash]) && (scriptConfiguration = awaitingObj.config)){
		callback(scriptConfiguration);
	} else {
		//Check prefetched script configurations for anything that matches
		for(const configuration of installedConfig.prefetchedScriptConfigurations){
			if(configuration.url == scriptUrl && configuration.hash == hash){
				debugLog(`Using prefetched script configuration for ${scriptUrl}`);
				collector.sendPrefetchedScriptUsedMessage({
					type: "PREFETCHED_SCRIPT_USED",
					scriptId: configuration.scriptId,
					scriptConfigurationId: configuration.scriptConfigurationId,
					seed: configuration.seed
				});
				callback(configuration);
				return;
			}
		}
		if(!knownHashMap){
			knownHashMap = scriptConfigurations[scriptUrl] = {};
		}
		if(!awaitingObj){
			awaitingObj = knownHashMap[hash] = { config: null, waiting: []};
			collector.sendScriptCollectionRequest({
				type: "SCRIPT_COLLECTION_REQUEST",
				url: scriptUrl,
				hash: hash
			})
		}
		awaitingObj.waiting.push(callback);
	}

}

export function addScriptConfiguration(scriptConfiguration : ScriptConfigurationMessage){
	const awaitingObj = scriptConfigurations[scriptConfiguration.url][scriptConfiguration.hash];
	awaitingObj.config = scriptConfiguration;
	for(const listener of awaitingObj.waiting){
		listener(scriptConfiguration)
	}
	awaitingObj.waiting = [];
}

export type OriginalScriptContentObj = {fullUrl: string, sourceMapHeader : string, content: string};
export type HashToOriginalContent = {[hash : number] : OriginalScriptContentObj};

export const originalScriptContent : {[url : string] : HashToOriginalContent} = {};

export function sendServerContent(serverNeedsContent: ServerNeedsContentMessage){
	const content = originalScriptContent[serverNeedsContent.url][serverNeedsContent.hash];
	collector.sendScriptContentMessage({
		type: 'SCRIPT_CONTENT',
		scriptId: serverNeedsContent.scriptId,
		fullUrl: content.fullUrl,
		sourceMapHeader: content.sourceMapHeader,
		content: content.content
	})
}