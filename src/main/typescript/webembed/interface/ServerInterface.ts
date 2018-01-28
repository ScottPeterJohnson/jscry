import {pageUrl, installedConfig} from "../Config";
import {ProxyData} from "../../types/Proxy";
import {
	CollectionData, Handshake, FromClientMessage, ScriptCollectionRequest, AddedCodeResult,
	FromServerMessage, ScriptConfigurationMessage, ScriptContentMessage, ServerNeedsContentMessage, SetupDoneMessage, PrefetchedScriptUsedMessage
} from "endpoints";
import {addScriptConfiguration, sendServerContent} from "./ScriptConfigurations";
import {debugLog, errorToPlainObj} from "../../utility/Utility";
import {jscryExecuteAddedCodeFunction, jScryLog, jScryScripts} from "../Exposed";
import * as CircularJSON from "circular-json";

abstract class ServerInterface {
	private ready = false;
	//In case anything is "sent" before ready
	private sendBacklog : Array<FromClientMessage> = [];

	addTypeObservation(observation : ProxyData){}

	private addedCodeResults : Array<AddedCodeResult> = [];
	addAddedCodeResult(scriptCommandId : number, result : any){
		//Undefined cannot be jsonified, because Javascript
		if(result === undefined){
			result = null;
		}
		const json : string = CircularJSON.stringify(result);
		this.addedCodeResults.push({
			scriptCommandId:scriptCommandId,
			result:json
		});
	}

	flush(){
		const executionData : { [index: string]: { [index: string]: number } } = {};
		const data : CollectionData = {
			type: "COLLECTION_DATA",
			executionData: executionData,
			addedCodeResults: this.addedCodeResults
		};
		this.addedCodeResults = [];
		let anyScripts = false;
		for(const {scriptId, executions, statementIds} of (window as any)[jScryScripts]){
			const scriptExecutions : { [index: string]: number } = {};
			let anyExecutions = false;
			for(let i=0; i<executions.length; i++){
				const execution = executions[i];
				if(execution>0){
					scriptExecutions[statementIds[i]] = execution;
					executions[i] = 0;
					anyExecutions = true;
				}
			}
			if(anyExecutions) {
				executionData[scriptId] = scriptExecutions;
				anyScripts = true;
			}
		}
		if(anyScripts) {
			this.ready = false;
			this.send(data);
		}
	};

	sendScriptCollectionRequest(message : ScriptCollectionRequest){
		this.sendMessage(message);
	}

	sendScriptContentMessage(message : ScriptContentMessage){
		this.sendMessage(message);
	}

	sendPrefetchedScriptUsedMessage(message : PrefetchedScriptUsedMessage){
		this.sendMessage(message);
	}

	sendSetupDoneMessage(){
		this.sendMessage({
			type: "SETUP_DONE"
		});
	}

	protected sendMessage(message : FromClientMessage){
		if(this.ready) {
			this.send(message);
		} else {
			this.sendBacklog.push(message);
		}
	}

	protected abstract send(data : FromClientMessage) : void;

	protected afterSend(){
		this.ready = true;
		if(this.sendBacklog.length) {
			const item = this.sendBacklog[0];
			this.sendBacklog = this.sendBacklog.slice(1);
			this.send(item);
		}
	}

	protected initialized(){
		debugLog("Collector initialized");
		this.ready = true;
		this.send({
			type: "HANDSHAKE",
			apiKey: installedConfig.apiKey,
			href: pageUrl
		} as Handshake);
	}

	protected static onReceive(message : string){
		const messageObject = JSON.parse(message) as FromServerMessage;
		switch(messageObject.type){
			case "SCRIPT_CONFIG":
				addScriptConfiguration(messageObject as ScriptConfigurationMessage);
				break;
			case "SERVER_NEEDS_CONTENT":
				sendServerContent(messageObject as ServerNeedsContentMessage);
				break;
		}
	}
}

class AjaxServerInterface extends ServerInterface {
	constructor(){
		super();
		this.initialized()
	}
	send(data : FromClientMessage){
		const request = new XMLHttpRequest();
		request.open("POST", installedConfig.submissionUrl);
		request.onreadystatechange = ()=>{
			if(request.readyState == 4 && request.status == 200){
				this.afterSend();
			}
		};
		request.send(JSON.stringify(data));
	}
}

class WebSocketServerInterface extends ServerInterface {
	deliverySocket = new WebSocket(installedConfig.submissionWebSocketUrl);
	constructor(){
		super();
		this.deliverySocket.onopen = ()=>{
			debugLog("WebSocket ready");
			this.initialized();
		};
		this.deliverySocket.onmessage = (ev : MessageEvent)=>{
			debugLog("WebSocket message received: " + ev.data.substr(0, 500));
			ServerInterface.onReceive(ev.data)
		}
	}
	send(data : CollectionData){
		debugLog("Sending " + JSON.stringify(data).substr(0,500));
		this.deliverySocket.send(JSON.stringify(data));
		this.afterSend();
	}
}

class WebWorkerServerInterface extends ServerInterface {
	send(){
		//TODO
	}
}


export enum CollectorType { Ajax, WebSocket, WebWorker}

export let collector : ServerInterface;

export function installCollectors(){
	if(installedConfig.serverInterfaceType === CollectorType.WebWorker){
		collector = new WebWorkerServerInterface();
	} else if(installedConfig.serverInterfaceType === CollectorType.WebSocket){
		collector = new WebSocketServerInterface();
	} else {
		collector = new AjaxServerInterface();
	}

	(window as any)[jscryExecuteAddedCodeFunction] = function(thisArg : any, scriptCommandId : number, code : ()=>any){
		let result : any;
		try {
			result = code.apply(thisArg);
		}
		catch(e){
			result = errorToPlainObj(e);
			result.jScryIsException = true;
		}
		collector.addAddedCodeResult(scriptCommandId, result);
	};

	(window as any)[jScryScripts] = [];
	window.addEventListener("onbeforeunload", function(){
		collector.flush();
	});
	setInterval(()=>{
		collector.flush();
	}, 10 * 1000);
}