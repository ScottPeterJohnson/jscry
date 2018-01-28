/*******************************************
JSTypes library
*******************************************/
type NumberSet = {[id:number] : boolean};
type StringSet = {[id:string] : string};

function allEqual<T>(array : Array<T>, extract : (t : T)=>(string|boolean)) : boolean{
	const eq: string|boolean = extract(array[0]);
	for(let i=1; i<array.length; i++){
		const value: string|boolean = extract(array[i]);
		if(value !== eq){ return false; }
	}
	return true;
}

interface Type {
	type : string;
}

class StringType implements Type {
	type = "string"
}

class NumberType implements Type {
	type = "number";
	isIntegral: boolean;
	constructor(isIntegral:boolean){ this.isIntegral = isIntegral; }
}

class BooleanType implements Type {
	type = "boolean";
}


class UndefinedType implements Type {
	type = "undefined";
}

class NullType implements Type {
	type = "null"
}

class UnknownType implements Type {
	type = "unknown"
}

class RecursiveType implements Type {
	type = "recursive";
	indices: Array<RecursiveType|number>;
	constructor(indices : Array<RecursiveType|number>){ this.indices = indices; }
}

class UnionType implements Type {
	type = "union";
	subtypes: Array<Type>;
	constructor(subtypes : Array<Type>){ this.subtypes = subtypes; }
}

interface PropertyHaving {
	properties : {[id : string] : Type}
}

class ObjectType implements Type, PropertyHaving {
	type = "object";
	properties: {[id: string]:Type};
	prototype: string|Array<number|string>;
	constructor(properties : {[id : string]:Type}, prototype : (string|Array<number|string>)){
		this.properties = properties;
		this.prototype = prototype;
	}
}

class FunctionType implements Type, PropertyHaving {
	type = "function";
	returnType : Type;
	argumentTypes: Array<Type>;
	properties: {[id: string]:Type};
	isConstructor : Boolean = false;
	constructor(returnType : Type, argumentTypes : Array<Type>, properties : {[id:string]:Type}){
		this.properties = properties; this.returnType = returnType; this.argumentTypes = argumentTypes;
	}
}

//Some unparameterized types are kept as singletons for speed
const stringType: StringType = new StringType();
const numberTypeInteger: NumberType = new NumberType(true);
const numberTypeDouble: NumberType = new NumberType(false);
const booleanType: BooleanType = new BooleanType();
const undefinedType: UndefinedType = new UndefinedType();
const nullType: NullType = new NullType();
const unknownType: UnknownType = new UnknownType();

function mergeArgumentTypeArrays(instances : Array<Array<Type>>) : Array<Type> {
	const mergedTypes: Array<Type> = [];
	let maxSize = 0;
	for(let i=0;i<instances.length;i++){
		const instance = instances[i];
		const argumentLength = instance.length;
		if(argumentLength > maxSize){ maxSize = argumentLength; }
	}
	for(let i=0;i<maxSize;i++){
		const types: Array<Type> = [];
		for(let j=0; j<instances.length; j++){
			const instance = instances[j];
			if(instance.length <= i){
				types.push(undefinedType);
			}
			else {
				types.push(instance[i]);
			}
		}
		mergedTypes.push(typeUnion(types));
	}
	return mergedTypes;
}

function mergeArgumentTypes(instances : Array<FunctionType>) : Array<Type> {
	return mergeArgumentTypeArrays(instances.map(function(instance){ return instance.argumentTypes }));
}

/**
* Given a type identifier and instances, apply as much simplification as possible.
* @returns {*}
*/
function simplifyType(type : string, instances : Array<Type>) : Array<Type> {
	switch(type){
		case "string": return [stringType];
		case "number":
			const len = instances.length;
			for(let i=0; i<len; i++){
				const instance = <NumberType>instances[i];
				if(!instance.isIntegral){ return [numberTypeDouble]; }
			}
			return [numberTypeInteger];
		case "boolean": return [booleanType];
		case "undefined": return [undefinedType];
		case "function":
			return [new FunctionType(
				typeUnion(instances.map(function(instance){ return (<FunctionType>instance).returnType})),
				mergeArgumentTypes(<Array<FunctionType>>instances),
				{}
			)];
		case "null": return [nullType];
		case "object": return mergeObjects(<Array<ObjectType>>instances);
		case "unknown": return [unknownType];
		case "recursive": return [new RecursiveType(<Array<RecursiveType>>instances)];
		case "union": return [simplifyUnions(<Array<UnionType>>instances)];
		default: throw "Unknown type " + type;
	}
}

/**
* Given a list of unions, return a single union such that every union is topmost.
*/
function simplifyUnions(unions : Array<UnionType>) : UnionType {
	const resultSubtypes: Array<Type> = [];
	for(let i=0; i<unions.length; i++){
		const union: UnionType = unions[i];
		for(let j=0; j<union.subtypes.length; j++){
			const type: Type = union.subtypes[j];
			if(type.type === "union"){
				resultSubtypes.concat(simplifyUnions([<UnionType>type]));
			}
			else {
				resultSubtypes.push(type);
			}
		}
	}
	return new UnionType(resultSubtypes);
}

/**
* Merge a list of objects. Objects with the same prototype have properties merged.
*/
function mergeObjects(objectTypes : Array<ObjectType>) : Array<ObjectType> {
	const prototypeBuckets: {[prototype: string]: Array<ObjectType>} = {};
	for(let i=0; i<objectTypes.length; i++){
		const object = objectTypes[i];
		let prototype: string;
		if(object.prototype instanceof Array){ prototype = object.prototype[1] + <string>object.prototype[0]; }
		else { prototype = <string>object.prototype; }
		if(!prototypeBuckets[prototype]){ prototypeBuckets[prototype] = []; }
		prototypeBuckets[prototype].push(object);
	}
	const resultTypes: Array<ObjectType> = [];
	for(const key in prototypeBuckets){
		if(prototypeBuckets.hasOwnProperty(key)){
			resultTypes.push(mergeProperties(prototypeBuckets[key]));
		}
	}
	return resultTypes;
}

function mergeProperties(objectTypes : Array<ObjectType>) : ObjectType {
	const allProperties: {[id: string]: boolean} = {};
	let object: ObjectType;
	let i: number;
	let prop: string;

	for(i=0;i<objectTypes.length;i++){
		object = objectTypes[i];
		for(prop in object.properties){
			if(object.properties.hasOwnProperty(prop)){
				allProperties[prop] = true;
			}
		}
	}

	const allPropertiesWithTypes: {[id: string]: Type} = {};
	for(prop in allProperties){
		if(allProperties.hasOwnProperty(prop)) {
			const propTypes: Array<Type> = [];
			const len: number = objectTypes.length;
			for (let j : number = 0; j < len; j++) {
				object = objectTypes[j];
				if (prop in object.properties) {
					propTypes.push(object.properties[prop]);
				}
				else {
					propTypes.push(undefinedType);
				}
			}
			allPropertiesWithTypes[prop] = typeUnion(propTypes);
		}
	}
	return new ObjectType(allPropertiesWithTypes, objectTypes[0].prototype);
}

/**
* Create the union of given types, collapsing instances of the same type as possible.
* Objects will have all shared properties, and type|undefined for nonshared properties.
*/
function typeUnion(types : Array<Type>) : Type {
	//Sort types into primitive type buckets
	const typeBuckets: {[id: string]: Array<Type>} = {};
	let type: Type;
	const len = types.length;
	for(let i=0; i<len; i++){
		type = types[i];
		if(type.type === 'unknown'){ /* skip */ }
		else if(type.type === "union"){
			const subtypes = simplifyUnions([<UnionType>type]).subtypes;
			//Dump the union type's subtype into other buckets
			for(let j=0; j<subtypes.length; j++){
				const subtype = subtypes[j];
				if (!typeBuckets[subtype.type]) {
					typeBuckets[subtype.type] = [];
				}
				typeBuckets[subtype.type].push(subtype);
			}
		}
		else {
			if (!typeBuckets[type.type]) {
				typeBuckets[type.type] = [type];
			}
			else {
				typeBuckets[type.type].push(type);
			}
		}
	}
	const finalTypes: Array<Type> = [];
	for(const typeName in typeBuckets){
		if (typeBuckets.hasOwnProperty(typeName)){
			Array.prototype.push.apply(finalTypes, simplifyType(typeName, typeBuckets[typeName]));
		}
	}

	if(finalTypes.length === 0){
		return unknownType;
	}
	else if (finalTypes.length === 1){
		return finalTypes[0];
	}
	else {
		return new UnionType(finalTypes);
	}
}

function getObjectPropertyTypes(jsObject : {[prop : string] : any}, ignoreSet : Array<Object>){
	const properties: {[id: string]: Type} = {};
	for(const prop in jsObject){
		if (jsObject.hasOwnProperty(prop)){
			properties[prop] = determineType(jsObject[prop], ignoreSet);
		}
	}
	return properties;
}

function getProtoString(jsObject : any) : string {
	const protoString = Object.prototype.toString.call(jsObject);
	return protoString.substring(8, protoString.length - 1);
}

function isObjectNative(jsObject : any) : boolean {
	const protoString = getProtoString(jsObject);
	return protoString !== "Object" && protoString !== "Function";
}

function determineObjectPrototype(jsObject : any) : (string|Array<number|string>){
	const protoString = getProtoString(jsObject);
	if("Object" === protoString){
		let constructorIdent: Array<number|string>;
		if(jsObject.constructor && Object !== jsObject.constructor && (constructorIdent = jsObject.constructor.JSTYPES_PROXY_IDENTIFIER)){
			return constructorIdent;
		} else { return protoString; }
	} else {
		return protoString;
	}
}

function determineType(jsObject : any, ignoreSet : Array<Object>) : Type {

	switch(typeof jsObject){
		case "string": return stringType;
		case "number": return (<number>jsObject % 1 === 0) ? numberTypeInteger : numberTypeDouble;
		case "boolean": return booleanType;
		case "undefined": return undefinedType;
		case "function":
			const arityList: Array<Type> = [];
			for(let i=0;i < (<Function>jsObject).length; i++){ arityList.push(unknownType); }
			return new FunctionType(
				unknownType,
				arityList,
				{}
			);
		case "object":
			ignoreSet = ignoreSet || [];
			for(let i=0;i<ignoreSet.length;i++){
				if (ignoreSet[i] === jsObject){
					return new RecursiveType([i]);
				}
			}
			ignoreSet.push(jsObject);

			if (jsObject === null){
				return {type:"null"};
			}
			return new ObjectType(getObjectPropertyTypes(jsObject, ignoreSet.slice()), determineObjectPrototype(jsObject));
		default:
			throw "Unknowable type!";
	}
}

interface TypeHolder {
	type : Type
}

function cloneType(type : Type) : Type {
	return JSON.parse(JSON.stringify(type));
}

function clearObject(obj : any){
	for(const prop in obj){
		if (obj.hasOwnProperty(prop)){
			delete obj.prop;
		}
	}
}

function findOrAddObjectTypePart(type: Type) : ObjectType {
	if(type.type === "object" || type.type === "function"){ return <ObjectType>type; }
	else if (type.type === "union"){
		const unionType = <UnionType>type;
		for(let i=0; i<unionType.subtypes.length; i++){
			if(unionType.subtypes[i].type === "object" || unionType.subtypes[i].type === "function"){
				return <ObjectType>unionType.subtypes[i];
			}
		}
		const objectType = new ObjectType({}, "object");
		unionType.subtypes.push(objectType);
		return objectType;
	}
	else {
		const oldType = cloneType(type);
		clearObject(type);
		type.type = "union";
		const asUnionType = <UnionType> type;
		const objectType = new ObjectType({}, "object");
		asUnionType.subtypes = [oldType, objectType];
		return objectType;
	}
}

function intoSubType(subType : Type, pathPart : BranchingListNode<string>) : PropertyHaving {
	let currentType: ObjectType = findOrAddObjectTypePart(subType);
	while(pathPart.previous !== undefined){
		if(!currentType.properties[pathPart.value]){ currentType.properties[pathPart.value] = new ObjectType({}, "object"); }
		currentType = findOrAddObjectTypePart(currentType.properties[pathPart.value]);
		pathPart = pathPart.previous;
	}
	return currentType;
}

function addPropertySetObservation(type : Type, propertyPath : BranchingListNode<string>, property : string, propertyType : Type){
	const subType = intoSubType(type, propertyPath);
	if(subType.properties[property]){
		subType.properties[property] = typeUnion([subType.properties[property], propertyType]);
	} else {
		subType.properties[property] = propertyType;
	}
}

function addFunctionApplyObservation(type : Type, propertyPath : BranchingListNode<string>, argumentTypes : Array<Type>, returnType : Type){
	const functionType = <FunctionType>intoSubType(type, propertyPath);
	functionType.returnType = typeUnion([functionType.returnType, returnType]);
	functionType.argumentTypes = mergeArgumentTypeArrays([argumentTypes, functionType.argumentTypes]);
}
