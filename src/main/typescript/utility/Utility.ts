import escapeRegExp from "lodash.escaperegexp";

export class Html extends String {
	private unique(){}
	private constructor(){super()}
	static wrap(obj : string){ return obj as any as Html; }
	static unwrap(wrapped : Html){ return wrapped as any as string; }
}

export interface ErrorMessage {
	code : string
	message: string
}


export function countLines(source : string){
	let length = 1;
	for(const char of source){
		if(char == '\n'){
			length += 1;
		}
	}
	return length;
}

export class ErrorOr<T> {
	private constructor(private t : T|null, private error : ErrorMessage|null){}
	isError(){ return this.error != null; }

	getError(){
		return this.error;
	}
	get(){
		return this.t;
	}
	getOrThrow() {
		if (this.isError()) {
			throw Error(this.error!!.code + ": " + this.error!!.message);
		} else {
			return this.t;
		}
	}

	unwrap<Result>(success : (t:T)=>Result, failure : (error:ErrorMessage)=>Result){
		if(this.isError()){
			return failure(this.error!!);
		} else {
			return success(this.t!!);
		}
	}

	apply<R>(func : (t:T)=>R) : R|null {
		if(this.t != null){
			return func(this.t);
		} else {
			return null;
		}
	}

	static error<T>(error: ErrorMessage){ return new ErrorOr<T>(null, error); }
	static just<T>(t : T){
		return new ErrorOr<T>(t, null);
	}
}

export function stringHash(str : string) : number {
	let hash = 0;
	for (let i = 0, len = str.length; i < len; i++) {
		const chr   = str.charCodeAt(i);
		hash  = ((hash << 5) - hash) + chr;
		hash |= 0; // Convert to 32bit integer
	}
	return hash;
}

export function addAllChildrenToFront(from : Node, to : Node){
	const oldFirst = to.firstChild || null;
	for(const child of Array.prototype.slice.apply(from.childNodes)){
		from.parentNode && from.parentNode.removeChild(from);
		to.insertBefore(child, oldFirst);
	}
}
export function addAllChildrenToEnd(from : Node, to : Node){
	for(const child of Array.prototype.slice.apply(from.childNodes)){
		from.parentNode && from.parentNode.removeChild(from);
		to.appendChild(child);
	}
}

export function linkFromUrl(url : string) : HTMLAnchorElement {
	const link : HTMLAnchorElement = document.createElement("a");
	link.href = url;
	return link;
}

export function normalizedUrl(url : string){
	const link = linkFromUrl(url);
	return link.host + link.pathname;
}

const entityMap : {[entity : string] : string } = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;',
	'/': '&#x2F;',
	'`': '&#x60;',
	'=': '&#x3D;'
};
/**
 * Escapes a string for use as HTML
 * @param str
 * @returns {string}
 */
export function escapeHtml (str : string) {
	return str.replace(/[&<>"'`=\/]/g, function (s : string) {
		return entityMap[s];
	});
}

function replaceJsCharacter(character : string) : string {
	switch (character) {
		case '"':
		case "'":
		case '\\':
			return '\\' + character;
		case '\n':
			return '\\n';
		case '\r':
			return '\\r';
		case '\u2028':
			return '\\u2028';
		case '\u2029':
			return '\\u2029';
		default:
			return character;
	}
}

export function quoteJsString(str : string) {
	return str.replace(/["'\\\n\r\u2028\u2029]/g, replaceJsCharacter)
}

export function basicComparator(a : any, b : any) : number {
	if(a<b){return -1;}
	else if(a>b){return 1;}
	else{return 0;}
}

//Much of this was inspired by lodash's sortedIndex implementations, without including all of lodash into the web embedding
function sortedIndexSearch<Hay, Needle>(array : Array<Hay>, searchElement : Needle, comparator: (a:Hay, b:Needle)=>number = basicComparator, returnHighest : boolean = false) : number {
	let low = 0;
	let high = array.length;
	while(low < high){
		const mid = (low + high) >>> 1;
		const comparison = comparator(array[mid], searchElement);
		if(comparison == -1 || (returnHighest && comparison == 0)){
			low = mid + 1;
		} else {
			high = mid;
		}
	}
	return high;
}

export function binarySearch<T>(array : Array<T>, searchElement : T, comparator: (a:T,b:T)=>number = basicComparator) : number {
	if(array.length){
		const index = sortedIndexSearch(array, searchElement, comparator);
		if(index<array.length && comparator(array[index], searchElement)==0){
			return index;
		}
	}
	return -1;
}

export function closestUnderOrEqualSearch<Hay, Needle>(array : Array<Hay>, searchElement: Needle, comparator: (a:Hay, b:Needle)=>number = basicComparator) : number {
	const indexPosition = sortedIndexSearch(array, searchElement, comparator);
	if(indexPosition == 0){ return 0; }
	else if(comparator(array[indexPosition], searchElement) != 0) { return indexPosition - 1; }
	else { return indexPosition; }
}

export function closestLargerThanOrEqualToSearch<T>(array : Array<T>, searchElement : T, comparator: (a:T,b:T)=>number = basicComparator) : number {
	return sortedIndexSearch(array, searchElement, comparator, true);
}

export function debugLog(msg : string){
	if(DEBUG) {
		console.log("[jScry Embedding] " + msg);
	}
}

export function assert(callback : ()=>Boolean){
	if(DEBUG){
		const assertion = callback();
		if(!assertion){
			throw new Error("Assertion failed");
		}
	}
}

export function encodeQueryParameters(obj : any){
	const parts = [];
	for(const prop in obj){
		if(obj.hasOwnProperty(prop)){
			parts.push(encodeURIComponent(JSON.stringify(obj[prop])));
		}
	}
	return parts.length ? ("?" + parts.join("&")) : ""
}

export function invertMap(map : {[_:number]:number}) : ({[_:number]:number});
export function invertMap(map : {[_:string]:string}) : ({[_:string]:string});
export function invertMap(map : any) : any {
		const result : {[_:string]:(string|number)} = {};
		for(const entry in map){
			if(map.hasOwnProperty(entry)) {
				if(typeof map[entry] === "number"){
					result[map[entry]] = +entry;
				} else {
					result[map[entry]] = entry;
				}
			}
		}
		return result;
}

export function copy<T>(a : T, b : T){
	Object.keys(a).forEach(key=>(b as any)[key]=(a as any)[key]);
}

export function objGetOrPut<V>(map : {[index : string] : V}, key : string, put : ()=>V) : V {
	let value = map[key];
	if(value){ return value; }
	else {
		value = put();
		map[key] = value;
		return value;
	}
}
export function mapGetOrPut<K,V>(map : Map<K,V>, key : K, put : ()=>V) : V {
	let value = map.get(key);
	if(value){ return value; }
	else {
		value = put();
		map.set(key, value);
		return value;
	}
}

export function range(startInclusive : number, endExclusive : number) : number[] {
	const list = [];
	for(let i=startInclusive; i<endExclusive;i++){
		list.push(i);
	}
	return list;
}

export function patternToRegex(pattern : string) : string {
	const fragments = pattern.replace(/\s/, "").split("*");
	return fragments.map(escapeRegExp).join(".*");
}

export function corsReachable(url : string, patterns : string[]) : boolean {
	const anchor = linkFromUrl(url);
	const sameOrigin = anchor.host == document.location.host && anchor.port == document.location.port  && anchor.protocol == document.location.protocol;
	if(sameOrigin){ return true; }
	else {
		const absoluteUrl = anchor.href;
		for(const pattern of patterns){
			if(new RegExp(patternToRegex(pattern)).test(absoluteUrl)){
				return true;
			}
		}
		return false;
	}
}

/**
 * Attempts to get a file name from URL, else return URL unmodified
 * @param {string} url
 * @returns {string}
 */
export function urlFileName(url : string) : string {
	return url.split("/").pop() || url;
}

export function filterNotNull<T>(input : (T|null)[]) : T[] {
	return input.filter((it)=>it!==null) as T[];
}

export function identity<T>(t : T) : T { return t;}

export function errorToPlainObj(e : Error) : any {
	const plain : {[key:string]:any} = {};
	Object.getOwnPropertyNames(e).forEach((key)=>{
		plain[key] = (e as any)[key];
	});
	return plain;
}


export class Observable<T> {
	private listeners = new Array<(t:T)=>void>();
	subscribe(callback : (t:T)=>void){
		this.listeners.push(callback);
	}
	fire(t: T){
		for(const listener of this.listeners){
			listener(t);
		}
	}
}