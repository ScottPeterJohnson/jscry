import {CollectorType} from "./interface/ServerInterface";
import {ClientConfig} from "endpoints";

export const pageUrl = window.location.host + window.location.pathname;
export let installedConfig : Config;

export interface Config extends ClientConfig {
	serverInterfaceType : CollectorType
}

export function applyConfig(cfg : ClientConfig) : Config {
	const config = cfg as Config;
	const webWorkerEnabled = false;
	if (typeof Worker !== "undefined" && webWorkerEnabled) {
		config.serverInterfaceType = CollectorType.WebWorker;
	} else if (typeof WebSocket !== "undefined") {
		config.serverInterfaceType = CollectorType.WebSocket;
	} else {
		config.serverInterfaceType = CollectorType.Ajax;
	}
	return config;
}

export function getConfig(): boolean {
	if ((window as any).$JC) {
		installedConfig = applyConfig((window as any).$JC);
		return true;
	} else {
		return false;
	}
}