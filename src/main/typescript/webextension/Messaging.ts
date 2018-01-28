export interface ActiveOnTabMessage {
	type: "active_on_tab",
	active: boolean
}

export interface QueryActiveOnTabMessage {
	type: "query_active_on_tab",
	tabId : number
}

export type Message = ActiveOnTabMessage | QueryActiveOnTabMessage;