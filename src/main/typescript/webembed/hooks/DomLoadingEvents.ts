import {mapGetOrPut} from "../../utility/Utility";
import {jscryHookedListenerProperty} from "../Exposed";

type TopLoadTarget = Window|Document;
type TopLoadTargetProto = typeof Window | typeof Document;
interface PendingLoadInvocation {
	type: string
	target: TopLoadTarget
	event : Event
}

interface HookedLoadFunction {
	type : string,
	target : TopLoadTarget,
	listener : EventListenerOrEventListenerObject
}

/**
 * Class to hook into addEventListener in order to delay window load events until jScry has added all scripts
 * This means that those scripts will actually be present and have executed when the events are refired
 */
export class DomLoadingEvents {
	hasRefired : boolean = false;
	pendingLoadInvocations : Array<PendingLoadInvocation> = [];
	hookedLoadFunctions : Array<HookedLoadFunction> = [];

	topLoadObjects : Array<[TopLoadTarget, TopLoadTargetProto]> = [[window, Window], [document, Document]];
	domLoadEvents = ["load", "DOMContentLoaded", "readystatechange"];

	installReadyEventFiringMonitor(){
		const self = this;
		for (const [obj, clazz] of this.topLoadObjects) {
			for (const event of this.domLoadEvents) {
				//Save this reference in case we're running under Javascript breaking injection and to call the raw listener always
				const removeEventListener = obj.removeEventListener;
				const firingListener = function (this: Window | Document, ev: Event) {
					removeEventListener.call(this, event, firingListener);
					//Save this type of event so it fires later
					self.pendingLoadInvocations.push({
						type: event,
						target: this,
						event: ev
					});
				};
				obj.addEventListener(event, firingListener);
			}
		}
	}

	installHooks() {
		for (const [obj, clazz] of this.topLoadObjects) {
			const self = this;
			//First, make sure event listeners can be properly removed via function reference when hooked
			const rawRemoveEventListener = clazz.prototype.removeEventListener;
			clazz.prototype.removeEventListener = function(type: string, listener?: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions){
				const hooked = listener && (listener as any)[jscryHookedListenerProperty];
				return rawRemoveEventListener.call(this, type, hooked || listener, options);
			};
			//Interpose a hook function before any event dispatches, so that they can be fired later when the page is actually ready instead
			const rawAddEventListener = clazz.prototype.addEventListener;
			clazz.prototype.addEventListener = function (
				this: Window | Document,
				type: string,
				listener: EventListenerOrEventListenerObject,
				useCapture?: boolean
			) {
				//Is this a load event?
				if (self.domLoadEvents.indexOf(type) === -1) {
					//No- passthrough to actual addEventListener
					rawAddEventListener.call(this, type, listener, useCapture);
				} else {
					function hook(this: Window | Document, ev: Event) {
						if (self.hasRefired) {
							//Okay to immediately fire
							if (typeof listener === "function") {
								listener.call(this, ev);
							} else {
								listener.handleEvent(ev);
							}
						}
					}
					(listener as any)[jscryHookedListenerProperty] = hook;
						//Yes- add a hook instead that'll delay invocation until jScry is done
					rawAddEventListener.call(this, type, hook, useCapture);
					self.hookedLoadFunctions.push({type, target: this, listener});
				}
			}
		}
	}
	refireDomLoadEventsAsNecessary(){
		this.hasRefired = true;
		for(const pending of this.pendingLoadInvocations){
			for(const hookedFunction of this.hookedLoadFunctions){
				if(hookedFunction.type == pending.type && hookedFunction.target == pending.target){
					if (typeof hookedFunction.listener === "function") {
						hookedFunction.listener.call(pending.target, pending.event);
					} else {
						hookedFunction.listener.handleEvent(pending.event);
					}
				}
			}
		}
		//Free references
		this.pendingLoadInvocations = [];
		this.hookedLoadFunctions = [];
	}
}