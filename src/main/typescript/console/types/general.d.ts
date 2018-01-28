
declare module "stable" {
	type Comparator<T> = ((a : T, b : T)=>boolean) | ((a: T, b : T)=>number);
	const stable: {
		<T,T2 extends T>(array : T[], comparator? : Comparator<T2>) : T[]
		inplace<T>(array: T[], comparator? : Comparator<T>) : T[]
	};
	export default stable;
}

declare module "buckets-js" {
	export class PriorityQueue<T>{
		constructor(compare : (a: T, b: T)=>number);
		add(element : T) : void;
		peek(): T|undefined;
		dequeue(): T|undefined;
		toArray(): T[];
	}
}

declare module "react-fileupload-progress" {
	import {FormEventHandler} from "react";
	interface FileUploadProps {
		url : string
		onLoad?: (_:Event, __: XMLHttpRequest)=>void
		formRenderer?: (_:FormEventHandler<any>)=>JSX.Element
		formGetter? : ()=>FormData
	}
	class FileUploadProgress extends React.Component<FileUploadProps, {}>{}
	export default FileUploadProgress;
}

declare module "lodash.escaperegexp" {
	function escapeRegExp(exp : string) : string;
	export default escapeRegExp;
}

declare module "react-spinner" {
	class Spinner extends React.Component<{}, {}>{}
	export default Spinner;
}

declare module "circular-json" {
	interface ICircularJSON {
		parse(text: string, reviver?: (key: any, value: any) => any): any;
		stringify(value: any, replacer?: ((key: string, value: any) => any) | any[], space?: any, placeholder?: boolean): string;
	}

	const CircularJSON: ICircularJSON;

	export = CircularJSON;
}

declare module 'highlight.js/lib/highlight.js' {
	export = hljs;
}