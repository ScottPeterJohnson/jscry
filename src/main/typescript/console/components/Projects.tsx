import * as React from "react"
import {
	EmptyState, ConsoleDocumentTitle, TypedRoute, ObservableComponent, GoBack, isEqual,
	deepClone, validJsExpression, CodeInput
} from "../utility/ConsoleUtility";
import * as Grom from "../Grom";
import {AjaxOperation, AjaxPropsLoader, LoadingOverlay} from "../utility/AjaxComponents";
import {
	EmptyRequest,
	GetProjects,
	GetProject,
	GetProjectRequest,
	ProjectsRow,
	ToggleProjectEnabled,
	ToggleProjectEnabledRequest,
	UpdateProjectSettings,
	UpdateProjectSettingsRequest
} from "endpoints";
import {ScriptsRoute} from "./Scripts";
import {observer} from "mobx-react/custom";
import {computed, observable} from "mobx";
import {autobind} from "core-decorators";
import {InjectedRouter} from "react-router";
import {HelpButton} from "./HelpButton";
import {parse} from "acorn";
import {ChangeEvent} from "react";
import {ObservableArray} from "mobx/lib/types/observablearray";
import {deepEqual} from "mobx/lib/utils/utils";
import {ShowHide, ShowHideSection, ShowHideSectionWithButton} from "./ShowHideSection";

const host = window.location.host;

function includeScriptTag(apiKey: string) {
	//noinspection JSUnresolvedLibraryURL
	return `<script src="https://${host}/web/config.js?apiKey=${apiKey}"></script>\n<script name="jScryScript" src="https://${host}/web/jscry-web.js"></script>`;
}

interface ProjectQuery {
	apiKey: string
}

interface ProjectProps {
	location: { query: ProjectQuery }
	router: InjectedRouter
}

@observer
class ProjectView extends ObservableComponent<ProjectProps, EmptyState> {
	@observable project = new AjaxPropsLoader<GetProjectRequest, ProjectsRow>(this, GetProject,
		() => ({apiKey: this.props.location.query.apiKey}));

	render(): JSX.Element | any {
		if (!this.project.ready()) {
			return this.project.render();
		}
		const project = this.project.value!!;
		return <Grom.Box>
			<ConsoleDocumentTitle title={project.name}/>
			<Grom.Headline>{project.name}</Grom.Headline>
			{!project.enabled ? <Grom.Notification status="Warning" size="small"
												   message="This project is disabled. No collection will be performed until it is enabled again."/> : null}
			<Grom.Paragraph>
				To track scripts on this project, paste the following into the top of your page's HEAD tag:
			</Grom.Paragraph>
			<pre><code>{includeScriptTag(project.apiKey)}</code></pre>
			<Grom.Anchor path={ProjectSettingsRoute.makePath({apiKey: this.props.location.query.apiKey})}>Project
				settings</Grom.Anchor>
			<Grom.Anchor path={ScriptsRoute.makePath({apiKey: project.apiKey})}>Scripts in this project</Grom.Anchor>
			<Grom.Box direction="row" pad={{vertical: "medium", between: "medium"}}>
				<Grom.Button path={ProjectDisableRoute.makePath({apiKey: this.props.location.query.apiKey})}
							 label={project.enabled ? "Disable Project" : "Enable Project"}/>
				<Grom.Button path={`project/delete/${project.apiKey}`} label="Delete Project"/>
			</Grom.Box>
		</Grom.Box>
	}
}

export const ProjectRoute = new TypedRoute<ProjectQuery, ProjectProps>("project", ProjectView);


interface ProjectsProps {
	location: { query: {} }
}

@observer
class Projects extends ObservableComponent<ProjectsProps, EmptyState> {
	@observable projects = new AjaxPropsLoader<EmptyRequest, Array<ProjectsRow>>(this, GetProjects, () => ({}));

	render(): JSX.Element | any {
		if (!this.projects.ready()) {
			return this.projects.render();
		}
		const projects = this.projects.value!!;
		return <Grom.Box>
			<ConsoleDocumentTitle title="Projects"/>
			<Grom.Headline>Projects</Grom.Headline>
			<Grom.Box margin="medium">
				<Grom.Menu size="large">
					{projects.map((project) =>
						<Grom.Anchor key={project.apiKey} path={ProjectRoute.makePath({apiKey: project.apiKey})}
									 label={project.name}/>
					)}
				</Grom.Menu>
			</Grom.Box>
			{!projects.length ?
				<Grom.Paragraph>No projects currently associated with this account.</Grom.Paragraph> : null}
			<Grom.Anchor path="/projects/new" label="Add New Project" primary={true}/>
		</Grom.Box>;
	}
}

export const ProjectsRoute = new TypedRoute<{}, ProjectsProps>("projects", Projects);

@autobind
@observer
class ProjectDisableView extends ObservableComponent<ProjectProps, EmptyState> {
	@observable project = new AjaxPropsLoader<GetProjectRequest, ProjectsRow>(this, GetProject,
		() => ({apiKey: this.props.location.query.apiKey}));
	@observable disableOrEnable = new AjaxOperation<ToggleProjectEnabledRequest, Boolean>(ToggleProjectEnabled);

	@computed
	get operation(): String {
		return this.project.value!!.enabled ? "Disable" : "Enable";
	}

	render(): JSX.Element | any {
		if (!this.project.ready()) {
			return this.project.render();
		}
		const project = this.project.value!!;
		return <Grom.Box>
			<ConsoleDocumentTitle title={this.operation + " " + project.name}/>
			<LoadingOverlay op={this.disableOrEnable}>
				<Grom.Headline>{this.operation + " " + project.name}</Grom.Headline>
				{project.enabled ?
					<Grom.Paragraph>Disabling this project will stop collection on all pages in it, but it can be
						enabled again at any time. Are you sure?</Grom.Paragraph> : null}
				{!project.enabled ?
					<Grom.Paragraph>Enable this project will start collection on all pages in it. Are you
						sure?</Grom.Paragraph> : null}
				<Grom.Button label="Do it" onClick={this.performOperation}/>
				<Grom.Paragraph><GoBack/></Grom.Paragraph>
			</LoadingOverlay>
		</Grom.Box>
	}

	performOperation() {
		const project = this.project.value!!;
		this.disableOrEnable.sendThen({apiKey: project.apiKey, enabled: !project.enabled}, () => {
			ProjectRoute.go(this.props.router, {apiKey: this.props.location.query.apiKey});
		});
	}
}

export const ProjectDisableRoute = new TypedRoute<ProjectQuery, ProjectProps>("project/disable", ProjectDisableView);

@autobind
@observer
class ProjectSettingsView extends ObservableComponent<ProjectProps, EmptyState> {
	@observable project = new AjaxPropsLoader<GetProjectRequest, ProjectsRow>(this, GetProject,
		() => ({apiKey: this.props.location.query.apiKey}));
	@observable updateSettings = new AjaxOperation<UpdateProjectSettingsRequest, Boolean>(UpdateProjectSettings);
	@observable modifiedProject: ProjectsRow | null = null;
	@observable sourceMapSection = new ShowHide();
	@observable crossOriginPatternsSection = new ShowHide();

	@computed
	get settings(): Readonly<ProjectsRow> {
		if (this.modifiedProject == null) {
			return this.project.value!!;
		}
		return this.modifiedProject;
	}

	render(): JSX.Element | any {
		if (!this.project.ready()) {
			return this.project.render();
		}
		const project = this.project.value!!;
		return <Grom.Box>
			<ConsoleDocumentTitle title={project.name + " Settings"}/>
			<LoadingOverlay op={this.updateSettings}>
				<Grom.Headline>{project.name + " Settings"}</Grom.Headline>
				{this.changed() ? <Grom.Notification status="Unknown" size="small"
													 message="You have unsaved changes."/> : null}
				<Grom.Box pad={{between: "small"}}>
					<Grom.FormField label="Project name" error={this.validName()}>
						<Grom.Box pad="small"><Grom.TextInput value={this.settings.name} onDOMChange={this.changeName}/></Grom.Box>
					</Grom.FormField>
					<Grom.Box direction="row">
						<Grom.CheckBox checked={this.settings.runOnMobileBrowsers} label="Run on mobile browsers"
									   onChange={this.toggleMobileCollection}/>
						<HelpButton tooltip="jScry is disabled by default on mobile browsers to save on load times."/>
					</Grom.Box>

					<CodeInput
						label="Page collection test"
						value={this.settings.shouldTransformPageExpression}
						onChange={this.changeShouldTransformPageExpression}
						help="A boolean JavaScript expression to control whether a page is annotated. Throwing an exception counts as 'false'."
						placeholder="true"
					/>

					<CodeInput
						label="Script collection test"
						help="A boolean JavaScript expression to control whether a specific script is annotated. Use 'script' to get the script's URL."
						value={this.settings.shouldTransformScriptExpression}
						onChange={this.changeShouldTransformScriptExpression}
						placeholder="true"
					/>

					<ShowHideSectionWithButton
						name="Cross Origin Patterns"
						section={this.crossOriginPatternsSection}>
						Allow annotation on cross-origin scripts that match these patterns. Use * for wildcard matching.
						<Grom.List>
							{this.settings.corsAllowedPatterns.map((pattern, index) =>
								<Grom.ListItem key={index} direction="row">
									<Grom.TextInput value={pattern}
													onDOMChange={(evt: KeyboardEvent) => this.changePatternAtIndex(evt,
														index)}/>
									<Grom.Box flex={true} direction="row" justify="end">
										<Grom.Button label="Delete" onClick={() => this.deletePatternAtIndex(index)}/>
									</Grom.Box>
								</Grom.ListItem>
							)}
						</Grom.List>
						<Grom.Button label="Add Pattern" onClick={this.addNewPattern}/>
					</ShowHideSectionWithButton>

					<ShowHideSectionWithButton section={this.sourceMapSection} name="Source Map Options">
						{this.renderSourceMapSection()}
					</ShowHideSectionWithButton>


					<Grom.Button label="Save" primary={true} onClick={this.saveChanges}/>
					<Grom.Button label="Reset" onClick={this.resetChanges}/>
					<Grom.Paragraph><GoBack/></Grom.Paragraph></Grom.Box>
			</LoadingOverlay>
		</Grom.Box>
	}

	renderSourceMapSection() {
		return <Grom.Box>
			<Grom.CheckBox checked={this.settings.followScriptSourceMapComments}
						   label="Download from sourceMappingURL comments"
						   onChange={this.toggleFollowScriptSourceMapComments}
			/>
			<Grom.FormField label="Add headers to source map download">
				<Grom.Table responsive={false}>
					<Grom.TableHeader labels={["Name", "Value", "Delete"]}/>
					<tbody>{this.settings.scriptSourceMapExtraHeaders.map((header, index) => {
						const [name, value] = header.split(":");
						return <Grom.TableRow>
							<td>
								<Grom.TextInput value={name}
												onDOMChange={(evt: KeyboardEvent) => this.changeHeaderNameAtIndex(
													evt, index)}/>
							</td>
							<td>
								<Grom.TextInput value={value}
												onDOMChange={(evt: KeyboardEvent) => this.changeHeaderValueAtIndex(
													evt, index)}/>
							</td>
							<td>
								<Grom.Button label="Delete"
											 onClick={() => this.deleteHeaderAtIndex(index)}/>
							</td>
						</Grom.TableRow>
					})}</tbody>
				</Grom.Table>
				<Grom.Button label="Add Header" onClick={this.addNewHeader}/>
			</Grom.FormField>

			<Grom.FormField label="Add cookies to download">
				<Grom.Table responsive={false}>
					<Grom.TableHeader labels={["Name", "Value", "Delete"]}/>
					<tbody>{this.settings.scriptSourceMapExtraCookies.map((cookie, index) => {
						const [name, value] = cookie.split("=");
						return <Grom.TableRow>
							<td>
								<Grom.TextInput value={name}
												onDOMChange={(evt: KeyboardEvent) => this.changeCookieNameAtIndex(
													evt, index)}/>
							</td>
							<td>
								<Grom.TextInput value={value}
												onDOMChange={(evt: KeyboardEvent) => this.changeCookieValueAtIndex(
													evt, index)}/>
							</td>
							<td>
								<Grom.Button label="Delete"
											 onClick={() => this.deleteCookieAtIndex(index)}/>
							</td>
						</Grom.TableRow>
					})}</tbody>
				</Grom.Table>
				<Grom.Button label="Add Cookie" onClick={this.addNewCookie}/>
			</Grom.FormField>
		</Grom.Box>;
	}

	validShouldTransformScriptExpression(): string | null {
		return validJsExpression(this.settings.shouldTransformScriptExpression);
	}

	validShouldTransformPageExpression(): string | null {
		return validJsExpression(this.settings.shouldTransformPageExpression);
	}


	setSetting(): ProjectsRow {
		if (this.modifiedProject == null) {
			this.modifiedProject = deepClone(this.project.value!!);
		}
		return this.modifiedProject;
	}

	changeShouldTransformScriptExpression(code : string) {
		this.setSetting().shouldTransformScriptExpression = code || null as any as string;
	}

	changeShouldTransformPageExpression(code : string) {
		this.setSetting().shouldTransformPageExpression = code || null as any as string;
	}

	toggleMobileCollection() {
		this.setSetting().runOnMobileBrowsers = !this.settings.runOnMobileBrowsers;
	}

	changeName(evt: KeyboardEvent) {
		this.setSetting().name = (evt.target as HTMLInputElement).value;
	}

	validName(): string | null {
		if (this.settings.name.length == 0) return "Project name must be supplied";
		else if (this.settings.name.length > 128) return "Exceeds limit of 128 characters";
		else return null;
	}

	changePatternAtIndex(evt: KeyboardEvent, index: number) {
		this.setSetting().corsAllowedPatterns[index] = (evt.target as HTMLInputElement).value;
	}

	deletePatternAtIndex(index: number) {
		const array = this.settings.corsAllowedPatterns.slice();
		array.splice(index, 1);
		this.setSetting().corsAllowedPatterns = array;
	}

	addNewPattern() {
		this.setSetting().corsAllowedPatterns = this.settings.corsAllowedPatterns.concat(["*"]);
	}

	toggleFollowScriptSourceMapComments() {
		this.setSetting().followScriptSourceMapComments = !this.settings.followScriptSourceMapComments;
	}

	changeHeaderNameAtIndex(evt: KeyboardEvent, index: number) {
		const [_, headerValue] = this.settings.scriptSourceMapExtraHeaders[index].split(":");
		this.setSetting().scriptSourceMapExtraHeaders[index] = (evt.target as HTMLInputElement).value + ":" + headerValue;
	}
	changeHeaderValueAtIndex(evt: KeyboardEvent, index: number) {
		const [headerName, _] = this.settings.scriptSourceMapExtraHeaders[index].split(":");
		this.setSetting().scriptSourceMapExtraHeaders[index] = headerName + ":" + (evt.target as HTMLInputElement).value;
	}
	deleteHeaderAtIndex(index: number) {
		const array = this.settings.scriptSourceMapExtraHeaders.slice();
		array.splice(index, 1);
		this.setSetting().scriptSourceMapExtraHeaders = array;
	}
	addNewHeader() {
		this.setSetting().scriptSourceMapExtraHeaders = this.settings.scriptSourceMapExtraHeaders.concat(["Name:Value"]);
	}

	changeCookieNameAtIndex(evt: KeyboardEvent, index: number) {
		const [_, cookieValue] = this.settings.scriptSourceMapExtraCookies[index].split("=");
		this.setSetting().scriptSourceMapExtraCookies[index] = (evt.target as HTMLInputElement).value + "=" + cookieValue;
	}
	changeCookieValueAtIndex(evt: KeyboardEvent, index: number) {
		const [cookieName, _] = this.settings.scriptSourceMapExtraCookies[index].split("=");
		this.setSetting().scriptSourceMapExtraCookies[index] = cookieName + "=" + (evt.target as HTMLInputElement).value;
	}
	deleteCookieAtIndex(index: number) {
		const array = this.settings.scriptSourceMapExtraCookies.slice();
		array.splice(index, 1);
		this.setSetting().scriptSourceMapExtraCookies = array;
	}
	addNewCookie() {
		this.setSetting().scriptSourceMapExtraCookies = this.settings.scriptSourceMapExtraCookies.concat(["Name=Value"]);
	}

	changed(): Boolean {
		return !isEqual(this.project.value!!, this.settings);
	}

	saveChanges() {
		const settings = this.settings;
		this.updateSettings.sendThen({project: settings}, (result) => {
			this.project.forceUpdate();
		});
	}

	resetChanges() {
		this.modifiedProject = null;
		this.forceUpdate();
	}
}

export const ProjectSettingsRoute = new TypedRoute<ProjectQuery, ProjectProps>("project/settings", ProjectSettingsView);