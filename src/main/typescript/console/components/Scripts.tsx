import * as React from "react"
import {ConsoleDocumentTitle, GridTable, TypedRoute} from "../utility/ConsoleUtility";
import * as Grom from "../Grom";
import {InjectedRouter} from "react-router";
import {AjaxWrapper} from "../utility/AjaxComponents";
import {ScriptSummary, GetScripts, GetScriptsRequest, ProjectsRow, GetProjects, EmptyRequest} from "endpoints";
import {ScriptViewPageRoute} from "./scriptview/ScriptView";
import {autobind} from "core-decorators";
import {observer} from "mobx-react/custom";
import {observable} from "mobx";
import {
	NullableProjectsRowCombo, SimpleCombo, SimpleNullableStringCombo, SimpleNumberCombo,
	SimpleStringCombo
} from "../utility/SimpleCombo";
import {urlFileName} from "../../utility/Utility";

export interface ScriptsQuery {
	apiKey: string|null|undefined
}
export interface ScriptsProps {
	location: {query: ScriptsQuery},
	router: InjectedRouter
}
export interface ScriptsState {
	showOriginalScripts: boolean,
	searchValue: string
}

export class GetScriptAjax extends AjaxWrapper<GetScriptsRequest, ScriptSummary[]> {
}
export class GetProjectsAjax extends AjaxWrapper<EmptyRequest, ProjectsRow[]> {
}


interface ScriptSuggestion {
	label: string,
	value: ScriptSummary
}


class ScriptGridTable extends GridTable<ScriptSummary>{}

@autobind
@observer
export class Scripts extends React.Component<ScriptsProps, ScriptsState> {
	@observable apiKey : string|null = this.props.location.query.apiKey || null;
	@observable showOriginalScripts : boolean = true;
	@observable searchValue : string = "";

	render() {
		return <Grom.Box>
			<ConsoleDocumentTitle title="Scripts"/>
			<GetProjectsAjax
				request={{}}
				endpoint={GetProjects}
				component={(projects)=>
					<GetScriptAjax
						request={{apiKey: this.apiKey as string, showOriginal: this.showOriginalScripts}}
						endpoint={GetScripts}
						component={(scripts : ScriptSummary[])=>
							<Grom.Box>
								<Grom.Box direction="row" align="center" pad={{between:"small"}}>
									<NullableProjectsRowCombo
										label="Project"
										value={projects.find((project)=>project.apiKey == this.apiKey) || null}
										options={([null] as (ProjectsRow|null)[]).concat(projects.slice())}
										labelMaker={(project : ProjectsRow|null)=> (project && project.name) || "Any"}
										onSelect={(project)=>{
											this.apiKey = (project && project.apiKey) || null;
										}}
									/>
									<Grom.CheckBox
										checked={this.showOriginalScripts}
										label="Show Original Sources"
										onChange={()=>{this.showOriginalScripts = !this.showOriginalScripts}}
									/>
									<Grom.Search
										inline={true}
										value={this.searchValue}
										onSelect={ (suggestion : ScriptSuggestion)=>this.onRowClick(suggestion.value) }
										suggestions={scripts.filter((script)=>script.url.indexOf(this.searchValue) !== -1).map((script)=>({
											label: script.url,
											value: script
										} as ScriptSuggestion))}
										onDOMChange={(evt : KeyboardEvent)=>{
											this.searchValue = (evt.target as HTMLInputElement).value;
										}}
									/>
								</Grom.Box>
								{ scripts.length == 0 ? <Grom.Paragraph>No data collected yet!</Grom.Paragraph> :
									<Grom.Box margin="small"><ScriptGridTable
										columns={[
											{label: "Name", value: (script)=>urlFileName(script.url)},
											{label: "URL", value: (script)=>script.url},
											{label: "Versions", value: (script)=>script.versions.length}
										]}
										itemKey={(script)=>script.apiKey + " : " + script.url}
										items={scripts}
										onItemClick={this.onRowClick}
									/></Grom.Box>
								}
							</Grom.Box>

						}
					/>
			}/>
		</Grom.Box>
	}

	onRowClick(script: ScriptSummary) {
		ScriptViewPageRoute.go(this.props.router, {
			scriptId: script.versions[0],
			sourceMapUrl: script.fromSourceMap ? script.url : null,
			availableVersions: script.versions
		});
	}
}

export const ScriptsRoute = new TypedRoute<ScriptsQuery, ScriptsProps>("scripts", Scripts);