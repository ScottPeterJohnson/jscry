import {jscryMetaTagFinishedId, pageStorageReloadTag} from "./Exposed";
import {addAllChildrenToFront, corsReachable, debugLog} from "../utility/Utility";
import {hookCorsScript, hookDocumentScripts, hookEmbeddedScript, hookExternalScript} from "./Hooks";
import {installedConfig} from "./Config";
import {InjectionMethod} from "./WebEmbedding";



/**
 * Capture the HTML of the page via a document.write XMP tag and then reload
 */
export class DocumentWriteInjection implements InjectionMethod {
	private readyInit : ()=>void;
	whenPageReady(readyInit : ()=>void){ this.readyInit = readyInit; }
	isAlreadyTransformed(){
		return !!document.getElementById(jscryMetaTagFinishedId);
	}
	transform(){
		function readdDocument() {
			//debugger;
			document.removeEventListener("DOMContentLoaded", readdDocument);
			const capture = document.getElementById("capture") as HTMLTextAreaElement;
			const remainingHtml = capture.innerHTML;
			capture.parentNode!!.removeChild(capture);
			const reformedHtml = "<html><head>" + remainingHtml;
			const restOfDocument = new DOMParser().parseFromString(reformedHtml, "text/html");
			hookDocumentScripts(restOfDocument, 0);

			for (const elem of Array.prototype.slice.apply(document.documentElement.childNodes)) {
				switch (elem.nodeName) {
					case "HEAD":
						addAllChildrenToFront(elem, restOfDocument.head);
						break;
					default:
						restOfDocument.documentElement.insertBefore(elem, restOfDocument.head);
						break;
				}
			}

			const finishedMetaTag = restOfDocument.createElement("meta");
			finishedMetaTag.id = jscryMetaTagFinishedId;
			const metaTagTimestamp = `${+new Date()}`;
			finishedMetaTag.setAttribute("timestamp", metaTagTimestamp);
			window.sessionStorage.setItem(pageStorageReloadTag(metaTagTimestamp), "true");
			restOfDocument.head.insertBefore(finishedMetaTag, restOfDocument.head.firstChild);

			//Magic!
			document.open("text/html", "replace");
			document.write("<!DOCTYPE html>");
			document.write(restOfDocument.documentElement.outerHTML);
			document.close();
		}

		//Wait to re-add the rest of the document and modify scripts.
		document.addEventListener("DOMContentLoaded", readdDocument);
		//Stub out the rest of the document as the value of the obscure "XMP" tag.
		document.write("<xmp id='capture' style='display:none'>");
	}
	beforeTransformCheck(){
		//Make sure we get a clean reload when necessary
		const metaTag = document.getElementById(jscryMetaTagFinishedId)!!;
		if(metaTag) {
			const metaTagTimestamp = metaTag.getAttribute("timestamp") || "?";
			//We want to actually contact the server and reload the page on a refresh.
			//In FireFox at least, a reload would just reload the transformed document from WYCIWYG
			if (window.sessionStorage) {
				if (!window.sessionStorage.getItem(pageStorageReloadTag(metaTagTimestamp))) {
					debugLog("Force page reload");
					//noinspection SillyAssignmentJS
					document.location.href = document.location.href;
				} else {
					window.sessionStorage.removeItem(pageStorageReloadTag(metaTagTimestamp));
				}
			}
		}
	}
	last(){
		if(this.isAlreadyTransformed()){
			this.readyInit();
		}
	}
}