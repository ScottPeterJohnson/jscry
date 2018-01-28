import "./ExtensionStyling.css";
import "./BrowserEnv";
import * as React from "react"
import * as ReactDOM from "react-dom"
import {observer} from "mobx-react/custom";
import {EnabledForSite, ExtensionSettings, getSettings, saveSettings, setEnabledForSite} from "./Settings";
import {autobind} from "core-decorators";
import {QueryActiveOnTabMessage} from "./Messaging";



async function main(){
	const settings = await getSettings();
	const activeTab = (await browser.tabs.query({active: true, currentWindow: true}))[0];
	const injectionStatus : boolean = (await (browser.runtime as any).sendMessage({type: "query_active_on_tab", tabId: activeTab.id} as QueryActiveOnTabMessage)).active;
	const root = document.getElementById("root");
	ReactDOM.render(<Popup settings={settings} activeTab={activeTab} isInjectedIntoTab={injectionStatus}/>, root);
}

@autobind
@observer
class Popup extends React.Component<{settings:ExtensionSettings, activeTab : any, isInjectedIntoTab: boolean},{}>{
	render(){
		return <div style={{width:"300px"}} className="panel">
			<div className="panel-section panel-section-header">
				<div className="text-section-header">jScry Injector</div>
			</div>
			<div className="panel-section panel-section-list">
				<div className="panel-list-item" onClick={this.toggleForSite}>{this.currentSiteActive() ? "Disable for this site" : "Enable for this site"}</div>
				<div className="panel-list-item" onClick={this.toggleInjectorEnabled}><input type="checkbox" checked={this.injectorEnabled()} onChange={this.toggleInjectorEnabled}/><label>Injector Enabled</label></div>
				<div className="panel-list-item" onClick={this.goToConsole}>Console</div>
				<div className="panel-list-item" onClick={this.goToSettings}>Settings</div>
			</div>
		</div>
	}

	injectorEnabled() : boolean {
		return this.props.settings.enabled;
	}
	currentSiteActive() : boolean {
		return this.props.isInjectedIntoTab;
	}
	async toggleForSite(){
		const url = await (browser.tabs as any).executeScript({code: 'document.location.href'});
		const anchor = document.createElement("a") as HTMLAnchorElement;
		anchor.href = url;
		const host = anchor.host;
		const enabled : EnabledForSite = this.currentSiteActive() ? "disabled" : "enabled";
		await setEnabledForSite(host, enabled);
		//Reload to make changes take effect
		(browser.tabs as any).executeScript({code: 'document.location = document.location;'});
		window.close();
	}
	async toggleInjectorEnabled(){
		await saveSettings({...this.props.settings, enabled: !this.props.settings.enabled});
		window.close();

	}
	goToConsole(){
		browser.tabs.create({
			url: this.props.settings.jScryUrl + "console/"
		});
	}
	goToSettings(){
		browser.runtime.openOptionsPage();
	}
}

main();