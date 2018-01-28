import {InjectionMethod} from "./WebEmbedding";
import {hookDocumentScripts} from "./Hooks";


/* The process of injecting the jscry scripts to an arbitrary webpage is pretty convoluted. Note the following.
 * 1. The jScry scripts need to be part of the blocking document parsing flow. So we can't inject them directly here and have them work.
 * 2. At this point in the page-load, we're basically only guaranteed the HTML tag exists. Almost always we'll be before any other scripts have had a chance to run.
 * So, we add a script to the page which deletes all the properties it can find on the "document" and "window" objects.
 * This will likely instantly crash any scripts in the page and preclude them from modifying the DOM structure.
 * Then we can add a listener for the DOM load completing, grab the HTML from the DOM, modify it to add the jscry scripts, and use document.open()
 * to write a modified page.
 * But on Chrome, the window/document elements won't be reset in that new document.open()ed page, so we have to restore everything we deleted.
 */
export class JavascriptBreakingInjection implements InjectionMethod {
	private readyInit: () => void;

	whenPageReady(readyInit: () => void) {
		this.readyInit = readyInit;
	}

	isAlreadyTransformed(): boolean {
		return false;
	}

	beforeTransformCheck() {}

	transform() {
		//We're about to induce a lot of meaningless errors
		window.onerror = function () {
			return true;
		};
		window.addEventListener('DOMContentLoaded', this.onLoad.bind(this));
		this.overAllProperties([document, window], this.stripAndSaveProperty.bind(this));
	}

	last() {}


	//Save references to these before we delete them from the document/window
	private window_setTimeout = window.setTimeout;
	private Object_getOwnPropertyNames = Object.getOwnPropertyNames;
	private Object_getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
	private Object_getPrototypeOf = Object.getPrototypeOf;

	private restore: { obj: any, props: { [_: string]: any } }[] = [];

	private thisScript = document.currentScript as HTMLScriptElement;


	onLoad() {
		//Pesky window.onload handlers might execute after us, so set a timeout
		this.window_setTimeout.call(window, () => {
			//Re-cleanse to remove any pesky script-added properties (and window.onerror)
			this.overAllProperties([document, window], this.stripProperty);
			delete window.onerror;
			//Restore everything (chrome won't reset the script context on document overwrite)
			//Manual fori loop
			for (let i=0;i<this.restore.length;i++) {
				const {obj, props} = this.restore[i];
				for (const prop in props) {
					//noinspection JSUnfilteredForInLoop
					obj[prop] = props[prop];
				}
			}

			//Remove ourself from load listeners
			window.removeEventListener('DOMContentLoaded', this.onLoad);

			this.readyInit();
			const thisScriptIndex = Array.prototype.slice.call(document.querySelectorAll("script")).indexOf(this.thisScript) + 1;
			//Readd scripts!
			hookDocumentScripts(document, thisScriptIndex);
		}, 0);
	}

	overAllProperties(objects: Array<{ [_: string]: any }>, callback: (obj: any) => (prop: string) => void) {
		//Prevent double-visiting on shared prototypes
		const seen: any[] = [];
		const iterate = (obj: { [_: string]: any }) => {
			let currentObj = obj;
			while (currentObj !== null) {
				if (seen.indexOf(currentObj) !== -1) {
					break;
				}
				seen.push(currentObj);
				const cb = callback(currentObj);
				//restore.push({obj: currentObj, props: restoreObj});
				const properties = this.Object_getOwnPropertyNames(currentObj);
				//Very purposefully using a manual i loop here- the array stuff is broken at this point
				for (let i=0;i<properties.length;i++) {
					const prop = properties[i];
					const descriptor = this.Object_getOwnPropertyDescriptor(currentObj, prop);
					if (/*!descriptor.get && !descriptor.set && */prop !== "location" && prop !== "onerror") {
						cb(prop);
					}
				}
				currentObj = this.Object_getPrototypeOf(currentObj);
			}
		};
		for (let i = 0; i < objects.length; i++) {
			iterate(objects[i])
		}
	}

	stripProperty(currentObj: any): (prop: string) => void {
		return (prop: string) => {
			try { currentObj[prop] = undefined; } catch(e){}
		}
	}

	stripAndSaveProperty(currentObj: any): (prop: string) => void {
		const restoreObj: { [_: string]: any } = {};
		this.restore.push({obj: currentObj, props: restoreObj});
		return (prop: string) => {
			try {
				const value = currentObj[prop];
				currentObj[prop] = undefined;
				restoreObj[prop] = value;
			} catch(e){ /* Property is too MAGICAL! for us to change it */}
		};
	}
}

