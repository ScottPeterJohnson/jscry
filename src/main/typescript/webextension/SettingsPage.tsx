import "./BrowserEnv";
import * as React from "react"
import * as ReactDOM from "react-dom"
import {observer} from "mobx-react/custom";
import {observable} from "mobx";
import {ExtensionSettings, getSettings, saveSettings} from "./Settings";
import {autobind} from "core-decorators";
import {ChangeEvent} from "react";

async function main(){
	const settings = await getSettings();
	const root = document.getElementById("root");
	ReactDOM.render(<Settings initialSettings={settings}/>, root);
}

@autobind
@observer
class Settings extends React.Component<{initialSettings:ExtensionSettings},{}>{
	@observable settings : ExtensionSettings = this.props.initialSettings;
	@observable showAdvanced : boolean = false;
	render(){
		return <div>
			<label>API Key: <input type="text" value={this.settings.apiKey || ""} onChange={this.changeApiKey}/></label>
			<div>
				<label>Run when URL matches: <input type="text" value={this.settings.runOnSitesMatching} onChange={this.changeRunOnSitesMatching}/></label>
				<p>Use * for wildcard matching, and match any of multiple patterns with |. Whitespace is ignored.</p>
			</div>
			<div><button onClick={this.toggleShowAdvanced}>{this.showAdvanced ? "Hide" : "Advanced"}</button></div>
			<div style={{margin:"5px", padding: "15px", border:"1px solid gray", display: this.showAdvanced ? "" : "none"}}>
				<div><label>jScry URL: <input type="text" value={this.settings.jScryUrl} onChange={this.changeJScryUrl}/></label></div>
				<div><label>Dev mode: <input type="checkbox" checked={this.settings.debug} onChange={this.changeDebug}/></label></div>
			</div>
			<div><button onClick={this.save}>Save</button><button onClick={this.reset}>Reset</button></div>
		</div>
	}
	save(){
		saveSettings(this.settings);
	}
	async reset(){
		this.settings = await getSettings();
	}
	toggleShowAdvanced(){
		this.showAdvanced = !this.showAdvanced;
	}
	changeRunOnSitesMatching(e : ChangeEvent<HTMLInputElement>){
		this.settings.runOnSitesMatching = e.target.value;
	}
	changeApiKey(e : ChangeEvent<HTMLInputElement>){
		this.settings.apiKey = e.target.value;
	}
	changeJScryUrl(e : ChangeEvent<HTMLInputElement>){
		this.settings.jScryUrl = e.target.value;
	}
	changeDebug(){
		this.settings.debug = !this.settings.debug;
	}
}

main();