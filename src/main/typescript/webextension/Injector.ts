import "./BrowserEnv";
import {ExtensionSettings, getSettings, getSettingsAndEnabledForSite, runOnMatching, saveSettings} from "./Settings";
import {ActiveOnTabMessage} from "./Messaging";

async function getAndStoreSettings() {
	const settingsObj = await getSettingsAndEnabledForSite(document.location.host);
	window.sessionStorage.setItem("jscry_settings", JSON.stringify(settingsObj));
	window.location.reload();
}

function main() {
	if (document.documentElement.getAttribute("jscry_injector")) {
		return;
	}
	//We really need to add the script to the page ASAP but the settings API is asynchronous
	//So uh, we stop the page from loading and then reload it when we actually have our settings.
	//Words cannot express the sheer hatred I feel for JavaScript :)
	const settingsJson = window.sessionStorage.getItem("jscry_settings");
	if (settingsJson == null) {
		window.stop();
		getAndStoreSettings();
	} else {
		window.sessionStorage.removeItem("jscry_settings");
		const [settings, siteActive] = JSON.parse(settingsJson);
		function shouldRun(){
			if(siteActive === "disabled"){ return false; }
			else if(siteActive === "unset") {
				if (!settings.enabled) {
					return false;
				}
				const href = document.location.href;
				if (!settings.runOnSitesMatching || !runOnMatching(settings).test(href)) {
					return false;
				}
			}
			return true;
		}
		if(document.location.hostname == "localhost" || document.location.host == "jscry.io"){
			const meta = document.createElement("meta");
			meta.name = "jscry-extension-api-key";
			meta.content = settings.apiKey || "";
			(document.head || document.documentElement).appendChild(meta);
			window.addEventListener("message", function(event){
				if(event.data.type === "jscry-extension-api-key-change"){
					settings.apiKey = event.data.message;
					saveSettings(settings);
				}
			});
		}
		if(settings.apiKey == null || !shouldRun()){
			(browser.runtime as any).sendMessage({type: "active_on_tab", active: false} as ActiveOnTabMessage);
		} else {
			function mkScript(url : string){
				const script = document.createElement("script");
				script.setAttribute("async", "false");
				script.src = url;
				return script;
			}
			const installDir = "build/embedding";
			//Add a script to the document that will perform preinjection for us
			const vendorScript = mkScript(`${installDir}/vendor-jscry-web.js`);
			const transformScript = mkScript(`${installDir}/jscry-web${settings.debug ? '' : '-min'}.js`);
			transformScript.setAttribute("name", "jScryScript");

			const head = document.head || document.documentElement;
			head.insertBefore(transformScript, head.firstChild);
			if (settings.debug) {
				head.insertBefore(vendorScript, head.firstChild);
			}
			document.documentElement.setAttribute("jscry_injector", "true");

			//Light up the icon
			(browser.runtime as any).sendMessage({type: "active_on_tab", active: true} as ActiveOnTabMessage);
		}
	}
}

main();