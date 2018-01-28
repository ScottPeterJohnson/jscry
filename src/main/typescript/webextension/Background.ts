import "./BrowserEnv";
import {Message} from "./Messaging";
import {getSettings} from "./Settings";

const activeStatus : {[tab : number] : boolean} = {};
function iconOn(tabId : number) {
	activeStatus[tabId] = true;
	browser.browserAction.setIcon({path: "src/main/resources/icons/logo_32.png", tabId});
}
function iconOff(tabId : number) {
	activeStatus[tabId] = false;
	browser.browserAction.setIcon({path: "src/main/resources/icons/logo_off_32.png", tabId});
}

function messageListener(message : object, sender : any) : Promise<any> {
	const msg = message as Message;
	switch(msg.type){
		case "active_on_tab":
			if(msg.active){ iconOn(sender.tab!!.id!!); }
			else { iconOff(sender.tab!!.id!!); }
			break;
		case "query_active_on_tab":
			return Promise.resolve({active:activeStatus[msg.tabId] || false});
	}
	return Promise.resolve(null);
}

browser.runtime.onMessage.addListener(messageListener);

getSettings().then((settings)=>{
	if(!settings.apiKey){
		browser.tabs.create({
			url: settings.jScryUrl + "console/#/extension"
		})
	}
});