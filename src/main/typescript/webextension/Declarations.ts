//TODO: Find working bindings for the web extension types
declare const browser : any;
declare module "webextension-polyfill" {
	const browser : any;
	export default browser;
}