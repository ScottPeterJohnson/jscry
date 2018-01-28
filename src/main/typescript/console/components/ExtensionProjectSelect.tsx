import {AjaxWrapper} from "../utility/AjaxComponents";
import {ConsoleDocumentTitle, EmptyLocationProps, EmptyState, TypedRoute} from "../utility/ConsoleUtility";
import * as Grom from "../Grom"
import * as React from "react"
import {NullableProjectsRowCombo, ProjectsRowCombo} from "../utility/SimpleCombo";
import {GetProjectsAjax} from "./Scripts";
import {ScriptSummary, GetScripts, GetScriptsRequest, ProjectsRow, GetProjects, EmptyRequest} from "endpoints";
import {observable} from "mobx";
import {FirstLoginComp} from "./NewUser";


export class ExtensionProjectSelect extends React.Component<EmptyLocationProps, EmptyState>{
	metaTag = document.querySelector("meta[name=jscry-extension-api-key]") as HTMLMetaElement|null;
	@observable apiKey : string|null = this.metaTag != null ? (this.metaTag.content||null) : null;
	render(): JSX.Element|any {
		if(this.metaTag == null){
			return <Grom.Box>
				<ConsoleDocumentTitle title="Extension Not Found"/>
				<Grom.Heading>jScry Injector Extension not found. Please make sure it's installed.</Grom.Heading>
			</Grom.Box>
		}
		return <Grom.Box>
			<ConsoleDocumentTitle title="Extension Configured"/>
			<Grom.Heading>jScry Injector Extension</Grom.Heading>
			<Grom.Paragraph>Thanks for installing the jScry Injector Extension!</Grom.Paragraph>
			<FirstLoginComp>
				<Grom.Box direction="row" pad={{between:"small"}} align="center">
					<span>The injector will send data to </span>
					<GetProjectsAjax
						request={{}}
						endpoint={GetProjects}
						onFirstLoad={(projects)=>{if(this.apiKey == null){ this.setApiKey(projects[0]||null) }}}
						component={(projects) =>
							<NullableProjectsRowCombo
								label="Project"
								value={projects.find((project) => project.apiKey == this.apiKey) || null}
								options={([null] as (ProjectsRow | null)[]).concat(projects.slice())}
								labelMaker={(project: ProjectsRow | null) => (project && project.name) || "None"}
								onSelect={(project) => {
									this.setApiKey(project)
								}}
							/>
						}
					/>
				</Grom.Box>
			</FirstLoginComp>

		</Grom.Box>;
	}

	setApiKey(project : ProjectsRow|null){
		this.apiKey = (project && project.apiKey) || null;
		window.postMessage({
			type: 'jscry-extension-api-key-change',
			message: this.apiKey
		}, "*")
	}
}

export const ExtensionProjectSelectRoute = new TypedRoute<{}, EmptyLocationProps>("extension", ExtensionProjectSelect);