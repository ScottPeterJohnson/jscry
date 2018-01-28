import {debugLog, mapGetOrPut, normalizedUrl, objGetOrPut, stringHash} from "../../utility/Utility";
import {installedConfig} from "../Config";
import {transform} from "../WebVisitor";
import {Javascript} from "../../transform/Transform";
import {collector} from "../interface/ServerInterface";
import {ScriptConfigurationMessage} from "endpoints";
import {HashToOriginalContent, onScriptConfiguration, originalScriptContent} from "../interface/ScriptConfigurations";

declare global {
	interface XMLHttpRequest {
		$_jScryIsScript?: boolean;
		$_jScryTransformedResponse ?: string;
		$_jScryWaitingEvents?: [() => void]
	}
}

export function installXmlHttpRequestHooks() {
	const javascriptContentTypes: { [contentType: string]: boolean } = {
		"application/ecmascript": true,
		"application/javascript": true,
		"application/x-ecmascript": true,
		"application/x-javascript": true,
		"text/ecmascript": true,
		"text/javascript": true,
		"text/javascript1.0": true,
		"text/javascript1.1": true,
		"text/javascript1.2": true,
		"text/javascript1.3": true,
		"text/javascript1.4": true,
		"text/javascript1.5": true,
		"text/jscript": true,
		"text/livescript": true,
		"text/x-ecmascript": true,
		"text/x-javascript": true
	};

	function requestTextNeedsTransformation(request: XMLHttpRequest): boolean {
		//Check if either we haven't transformed this or the response text changed (indicating request was re-used, ick)
		return !request.$_jScryTransformedResponse || request.$_jScryTransformedResponse != request.responseText;
	}

	function hookListener(listener: EventListenerOrEventListenerObject) {
		return function (this: XMLHttpRequest, ev: ProgressEvent) {
			const forwardEvent = () => {
				if (typeof listener === "function") {
					listener.call(this, ev);
				} else {
					listener.handleEvent(ev);
				}
			};
			const contentType = (this.getResponseHeader("content-type")||"").split(";")[0];
			//Before we can complete this request, we must:
			//1. Check whether this request contains Javascript source and needs to be transformed
			if (this.readyState == XMLHttpRequest.DONE &&
				this.status == 200 && requestTextNeedsTransformation(this) &&
				(this.$_jScryIsScript || javascriptContentTypes[contentType])) {
				//2. Make sure user wants this script transformed
				let shouldTransform = false;
				try {
					//"script" can be used within eval()
					let script = this.responseURL;
					shouldTransform = eval(installedConfig.shouldTransformScriptExpression);
				} catch (e) {}
				if (shouldTransform) {
					//3. Make sure execution data for said javascript transformation has been fetched
					//Are there other events waiting on script configuration already?
					if (this.$_jScryWaitingEvents) {
						this.$_jScryWaitingEvents.push(forwardEvent)
					} else {
						//Create the waiting event queue and add this event to it
						this.$_jScryWaitingEvents = [forwardEvent];
						//Determine the URL/hash
						const url = normalizedUrl(this.responseURL);
						const hash = stringHash(this.responseText);
						//Save the content in case the server needs it
						objGetOrPut<HashToOriginalContent>(originalScriptContent, url, () => ({}))[hash] = {
							fullUrl: this.responseURL,
							sourceMapHeader: this.getResponseHeader("SourceMap") as string,
							content: this.responseText
						};
						const callback = (scriptConfiguration: ScriptConfigurationMessage) => {
							debugLog(`Script execution config for ${url} fetched`);
							try {
								if (scriptConfiguration.active) {
									//Transform the script according to the configuration, and overwrite response text
                                    // with it
									const sourceUrl = installedConfig.sourceMapUrl + "?scriptConfigurationId=" + scriptConfiguration.scriptConfigurationId + "&seed=" + scriptConfiguration.seed + "&url=" + encodeURIComponent(
											this.responseURL);
									const transformedText = transform(scriptConfiguration,
											Javascript.wrap(this.responseText)) +
										`\n//# sourceURL=${this.responseURL}` +
										`\n//# sourceMappingURL=${sourceUrl}`;
									this.$_jScryTransformedResponse = transformedText;
									Object.defineProperty(this, "responseText", {
										get: function () {
											return transformedText;
										}
									});
								}
							} catch (e) {
								console.error(e)
							}
							//Forward all of our events
							const waitingEvents = this.$_jScryWaitingEvents || [];
							this.$_jScryWaitingEvents = undefined;
							for (const event of waitingEvents) {
								try {
									event();
								} catch (e) {
									console.error(e);
								}
							}
						};
						onScriptConfiguration(url, hash, callback)
					}
				}
			} else { //This event is of no interest to us. Go ahead and forward it.
				forwardEvent();
			}
		}
	}

	for (const event of ["onload", "onloadend", "onreadystatechange"]) {
		Object.defineProperty(XMLHttpRequest.prototype, event, {
			get: function (this: XMLHttpRequest) {
				return (this as any)["_" + event];
			},
			set: function (this: XMLHttpRequest, value: any) {
				(this as any)["_" + event] = hookListener(value)
			}
		});
	}

	const rawXmlHttpAddEventListener = XMLHttpRequest.prototype.addEventListener;
	XMLHttpRequest.prototype.addEventListener = function (
		this: XMLHttpRequest,
		type: string,
		listener: EventListenerOrEventListenerObject,
		useCapture?: boolean
	) {
		switch (type) {
			case "load":
			case "loadend":
			case "readystatechange":
				rawXmlHttpAddEventListener.call(this, type, hookListener(listener), useCapture);
				break;
			default:
				rawXmlHttpAddEventListener.call(this, type, listener, useCapture);
				break;
		}
	};
}