import {WebEndpoint} from "endpoints";
import {observable, ObservableMap} from "mobx";

function makeMapsObservable(obj : {[s:string]:any}){
	if(typeof obj === "object") {
		for (const prop in obj) {
			if (obj.hasOwnProperty(prop)) {
				const value = obj[prop];
				if (value instanceof Map) {
					const observableMap = observable.map();
					for(const [entry,entryVal] of value){
						observableMap.set(entry, entryVal);
					}
					obj[prop] = observableMap;
				} else {
					makeMapsObservable(value);
				}
			}
		}
	}
}

export async function invoke<RequestType,ResponseType>(endpoint : WebEndpoint<RequestType,ResponseType>, request : RequestType) : Promise<RequestError | RequestSuccess<ResponseType>> {
	const queryUrl = endpoint.endpoint + "?req=" + encodeURIComponent(JSON.stringify(request));
	return await send<ResponseType>(endpoint.method, queryUrl, (json:string)=>{
		const result = endpoint.convert(json);
		makeMapsObservable(result);
		return result;
	});
}

export async function invokeOrBust<RequestType,ResponseType>(endpoint : WebEndpoint<RequestType,ResponseType>, request : RequestType) : Promise<ResponseType> {
	const result = await invoke(endpoint, request);
	if(isError(result)){ throw `Error invoking ${endpoint.endpoint}: ${result.status}`; }
	else {
		return result.result;
	}
}

export interface RequestError {
	type: 'error',
	status : number,
	errorMessage? : string
}

export interface RequestSuccess<T> {
	type: 'success',
	result: T
}

export function isError<T> (requestResult : RequestError | RequestSuccess<T> ): requestResult is RequestError {
	return requestResult.type === "error";
}



function send<T>(method: string, endpoint: string, parser : (json:string)=>T) : Promise<RequestError | RequestSuccess<T>> {
	return new Promise((resolve)=>{
		const req = new XMLHttpRequest();
		req.open(method, endpoint);
		req.addEventListener("load", ()=>{
			let loginHeader;
			if(req.status == 200) {
				const data = parser(req.responseText);
				resolve({type: 'success', result: data});
			} else if(req.status == 403 && (loginHeader=req.getResponseHeader("jScryLogin"))!=null) {
				window.location.href = loginHeader + encodeURIComponent(window.location.href);
			} else {
				const errorMessage = req.responseText ? JSON.parse(req.responseText).errorMessage : req.responseText;
				resolve({type: 'error', status: req.status, errorMessage:errorMessage});
			}
		});
		req.addEventListener("abort", (event : Event)=>{
			resolve({type: 'error', status: req.status});
		});
		req.addEventListener("error", ()=>{ resolve({type: 'error', status: req.status}); });
		req.send();
	});
}
