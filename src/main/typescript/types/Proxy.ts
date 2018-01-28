import {collector} from "../webembed/interface/ServerInterface";
/*******************************************
 Proxying of JS objects for type data collection
 *******************************************/
/// <reference path="./JsTypes.ts"/>
/// <reference path="./Header.ts"/>
/// <reference path="./BranchingList.ts"/>


export class ProxyData {
	fileName : string;
	identifiers : Array<number>;
	determinedType? : Type;
}


function isProxyable(obj : any){
	return (typeof obj === "object" || typeof obj === "function") && obj !== null && !(obj instanceof Node);
	//Note: We can't proxy Node objects solely due to a Firefox bug which causes errors when proxied-dom objects are added to a page
}

function isProxyObject(obj : any) : boolean {
	return isProxyable(obj)  && obj.JSTYPES_PROXY_ID;
}

function determineTypeOrUseProxyType(obj : any){
	if(isProxyable(obj) && obj.JSTYPES_PROXY){
		return cloneType(obj.JSTYPES_PROXY.type);
	}
	else {
		return determineType(obj, []);
	}
}

function ensureProxy(obj : any, identifier? : Array<Array<number>|string>) : any{
	if(isProxyable(obj)){
		if(obj.JSTYPES_PROXY_ID){ return obj; }
		else { return makeProxy(obj, identifier); }
	}
	else { return obj; }
}

function ensureProxyObjOnly(obj: any){ return ensureProxy(obj); }

const alreadyMadeProxies: WeakMap<any, any> = new WeakMap();
function makeProxy(obj : any, identifier? : Array<Array<number>|string>) : any{
	if(alreadyMadeProxies.has(obj)){ return alreadyMadeProxies.get(obj); }
	else {
		if(obj.JSTYPES_PROXY_ID){ alert("Object already is a proxy"); }
		const proxyTrap = new TypeChangeProxyTrap();
		const proxy = new Proxy(obj, proxyTrap);
		alreadyMadeProxies.set(obj, proxy);
		if(typeof(obj) === "function"){ obj.prototype.constructor = proxy; }
		proxyTrap.initialize(obj, identifier);
		return proxy;
	}
}

class ProxyListener {
	lastPropagation : number = 0;
	property? : string; /* Property being listened on- optional */
	onPropertySetObservation : (propertyPath : BranchingListNode<string>, propertySet : string, valueType : Type, propagationNumber : number) => void;
	onFunctionApplyObservation : (propertyPath : BranchingListNode<string>, argumentTypes : Array<Type>, returnType : Type, propagationNumber : number) => void;
	constructor(property : string|undefined, onPropertySetObservation : (propertyPath : BranchingListNode<string>, propertySet : string, valueType : Type, propagationNumber : number) => void, onFunctionApplyObservation : (propertyPath : BranchingListNode<string>, argumentTypes : Array<Type>, returnType : Type, propagationNumber : number) => void){
		this.property = property; this.onPropertySetObservation = onPropertySetObservation; this.onFunctionApplyObservation = onFunctionApplyObservation;
	}
}

function addProxyListener(proxy : any, listener : ProxyListener){
	proxy.JSTYPES_LISTENERS.push(listener);
	return listener;
}

let typeChangePropagation = 1;
let proxyTrapId = 1;
class TypeChangeProxyTrap {
	type : Type;
	listeners : Array<ProxyListener> = [];
	listeningTo : {[propValueId : number] : ProxyListener} = {};
	proxyId : number = proxyTrapId++;
	identifier? : Array<Array<number>|string>;

	//Constructor should be called with the object it is to proxy.
	initialize(obj : any, identifier? : Array<Array<number>|string>){
		// for(var prop in obj){
		// 	if(obj.hasOwnProperty(prop)){
		// 		var propValue = obj[prop];
		// 		if(isProxyable(propValue) && !propValue.JSTYPES_PROXY_ID){
		// 			obj[prop] = makeProxy(propValue);
		// 		}
		// 	}
		// }
		this.type = determineType(obj, []);
		this.identifier = identifier;
	}

	notifyPropertySet = (propertyPath : BranchingListNode<string>, propertySet : string, valueType : Type, propagationNumber : number) => {
		const newPath = addToBranchingList<string>(propertyPath, propertySet);
		for(let i=0; i<this.listeners.length; i++){
			const listener = this.listeners[i];
			if(listener.lastPropagation == propagationNumber){ continue; }
			else { listener.lastPropagation = propagationNumber; }
			if(!listener.property || listener.property == propertySet){
				listener.onPropertySetObservation(newPath, propertySet, valueType, propagationNumber)
			}
		}
	};
	notifyFunctionApply = (propertyPath : BranchingListNode<string>, argumentTypes : Array<Type>, returnType : Type, propagationNumber : number) => {
		for(let i=0; i<this.listeners.length; i++){
			const listener = this.listeners[i];
			if(listener.lastPropagation == propagationNumber){ continue; }
			else { listener.lastPropagation = propagationNumber; }
			listener.onFunctionApplyObservation(propertyPath, argumentTypes, returnType, propagationNumber);
		}
	};

	onPropertyPropertySet = (propertyPath : BranchingListNode<string>, propertySet : string, valueType : Type, propagationNumber : number) => {
		addPropertySetObservation(this.type, propertyPath, propertySet, valueType);
		this.notifyPropertySet(propertyPath, propertySet, valueType, propagationNumber);
	};

	onPropertyFunctionApply = (propertyPath : BranchingListNode<string>, argumentTypes : Array<Type>, returnType : Type, propagationNumber : number) => {
		addFunctionApplyObservation(this.type, propertyPath, argumentTypes, returnType);
		this.notifyFunctionApply(propertyPath, argumentTypes, returnType, propagationNumber);
	};

	get(target : any, property : string, receiver : any){
		if(property === "JSTYPES_PROXY_ID"){ return this.proxyId; }
		else if(property === "JSTYPES_LISTENERS"){
			return this.listeners;
		} else if(property === "JSTYPES_PROXY") {
			return this;
		} else if (property === "JSTYPES_PROXY_TARGET"){ return target; }
		else if (property === "JSTYPES_PROXY_IDENTIFIER"){
			if(this.identifier){
				return this.identifier;
			} else { //Maybe we've proxied a proxy which has an identifier?
				return target[property];
			}
			}

		const propValue = target[property];
		if(isProxyable(propValue) && target.hasOwnProperty(property)){ //Can't manipulate primitives into proxies
			if(isProxyObject(propValue)){ //Is this already a proxy object?
				const propValueId: number = propValue.JSTYPES_PROXY_ID;
				if(!this.listeningTo[propValueId]){ //Are we already listening to this proxy?
					this.listeningTo[propValueId] = addProxyListener(propValue, new ProxyListener(property, this.onPropertyPropertySet, this.onPropertyFunctionApply));
				}
				return propValue;  //Return the proxy
			} else { //We have to transform this property into a proxy
				const proxy = target[property] = makeProxy(propValue);
				const proxyId = proxy.JSTYPES_PROXY_ID;
				//Listen to changes from this new proxy
				this.listeningTo[proxyId] = addProxyListener(proxy, new ProxyListener(property, this.onPropertyPropertySet, this.onPropertyFunctionApply));
				return proxy;
			}
		}
		else { //This proxy is some sort of primitive; we can't proxy it and it won't generate any type updates anyway
			return propValue;
		}
	}

	set(target : any, property : string, value : any, receiver : any){
		const proxiedValue = ensureProxy(value);
		target[property] = proxiedValue;
		const valueType = determineTypeOrUseProxyType(proxiedValue);
		addPropertySetObservation(this.type, emptyBranchingListRoot, property, valueType);
		this.notifyPropertySet(emptyBranchingListRoot, property, valueType, typeChangePropagation++);
		return true;
	}
	apply(target : any, thisArg : any, argumentsList : Array<any>){
		const proxiedArguments = argumentsList.map(ensureProxyObjOnly);
		const argumentTypes = proxiedArguments.map(determineTypeOrUseProxyType);
		const result = ensureProxy(target.apply(thisArg, argumentsList));
		const returnType = determineTypeOrUseProxyType(result);
		addFunctionApplyObservation(this.type, emptyBranchingListRoot, argumentTypes, returnType);
		this.notifyFunctionApply(emptyBranchingListRoot, argumentTypes, returnType, typeChangePropagation++);
		return result;
	}
	/* See Ecmascript 13.2.2 (http://www.ecma-international.org/ecma-262/5.1/#sec-13.2.2) for algorithm
	*/
	construct(target : any, argumentsList : Array<any>){
		let proto = target.prototype;
		if(typeof proto !== "object"){ proto = Object.prototype; }
		const obj = Object.create(proto);
		(<FunctionType>this.type).isConstructor = true;
		const result = this.apply(target, obj, argumentsList);
		if (typeof result === "object"){
			return result;
			}
		else {
			return obj;
			}
	}
}

//Create a proxy around an object that will keep track of the types it assumes
export function proxify(original : any, identifiers : Array<number>, sourceFilename: string) : any {
	const state: ProxyData = new ProxyData();
	state.fileName = sourceFilename;
	state.identifiers = identifiers;
	state.determinedType = undefined;

	let returnValue: any;
	if(isProxyable(original) && !isObjectNative(original)){ //We can only create a proxy on user Objects and Functions to track their property assignments.
		returnValue = ensureProxy(original, [sourceFilename, identifiers]);
		state.determinedType = returnValue.JSTYPES_PROXY.type;
		collector.addTypeObservation(state);
		addProxyListener(returnValue, new ProxyListener(undefined, function(){ collector.addTypeObservation(state); }, function(){ collector.addTypeObservation(state); }));
	} else {
		state.determinedType = determineType(original,[]);
		returnValue = original;
	}
	collector.addTypeObservation(state);
	return returnValue;
}
