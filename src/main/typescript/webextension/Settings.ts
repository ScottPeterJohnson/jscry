import * as _ from "lodash";

export interface ExtensionSettings {
	enabled : boolean
	jScryUrl : string
	apiKey : string|null
	debug : boolean
	runOnSitesMatching : string
}

function defaultSettings() : ExtensionSettings {
	return {
		enabled: true,
		jScryUrl : "https://localhost:8080/",
		apiKey : null,
		debug: false,
		runOnSitesMatching : ""
	};
}

export type EnabledForSite = "enabled" | "disabled" | "unset";

export async function getSettingsAndEnabledForSite(site : string) : Promise<[ExtensionSettings, EnabledForSite]> {
	const enabledSetting = "enabledForSite_" + site;
	const settings = await browser.storage.local.get({settings : defaultSettings(), [enabledSetting]: "unset"} as object);
	return [settings["settings"] as ExtensionSettings, settings[enabledSetting] as EnabledForSite];
}

export async function setEnabledForSite(site : string, enabled : EnabledForSite){
	const enabledSetting = "enabledForSite_" + site;
	await browser.storage.local.set({[enabledSetting]: enabled});
}

export async function getSettings() : Promise<ExtensionSettings> {
	const settings = await browser.storage.local.get({settings : defaultSettings()} as object);
	return settings["settings"] as ExtensionSettings;
}

export async function saveSettings(settings : ExtensionSettings) {
	await browser.storage.local.set({settings});
}

export function runOnMatching(settings : ExtensionSettings) : RegExp {
	const fragments = settings.runOnSitesMatching.replace(/\s/, "").split("*").map((part)=>part.split("|"));
	return new RegExp(fragments.map((frag)=>frag.map(_.escapeRegExp).join("|")).join(".*"));
}