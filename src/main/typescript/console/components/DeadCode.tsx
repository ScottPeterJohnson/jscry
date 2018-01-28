import * as React from "react";
import {ConsoleDocumentTitle, EmptyState, GoBack, IRouterContext, TypedRoute} from "../utility/ConsoleUtility";
import * as Grom from "../Grom";
import {InjectedRouter} from "react-router";
import {AjaxOperation, AjaxWrapper, LoadingOverlay} from "../utility/AjaxComponents";
import {
	DeadCodeReport, DeadCodeReportDisplayRequest, DeadCodeScriptReference, DeadCodeSearch, DeadCodeSearchRequest,
	DeadCodeSearchResult, ExecutionCountType, GetDeadCodeReportDisplay, GetProjects, GetScripts, ProjectsRow
} from "endpoints";
import {LanguageSelector, ScriptView} from "./scriptview/ScriptView";
import {autobind} from "core-decorators";
import {observer} from "mobx-react/custom";
import {autorun, observable} from "mobx";
import {ProjectsRowCombo, ReactSelect, SimpleCombo, SimpleNullableNumberCombo} from "../utility/SimpleCombo";
import {range, urlFileName} from "../../utility/Utility";
import {GetProjectsAjax, GetScriptAjax} from "./Scripts";
import {Option} from "react-select";
import {CodeView, CodeViewTransform, MouseFollowerTransform} from "./scriptview/CodeView";
import {ScriptViewContext} from "./scriptview/ScriptViewContext";
import {ReactElementAdder} from "./scriptview/HtmlContainer";
import {StatementId} from "./scriptview/StatementTrackingVisitor";
import scrollIntoViewIfNeeded from "scroll-into-view-if-needed";
import * as PropTypes from "prop-types";

export interface DeadCodeQuery {}
export interface DeadCodeProps {
	location: {query: DeadCodeQuery},
	router: InjectedRouter
}

export class ExecutionCountTypeCombo extends SimpleCombo<ExecutionCountType>{}


@autobind
@observer
export class DeadCode extends React.Component<DeadCodeProps, EmptyState> {
	@observable searchOperation = new AjaxOperation<DeadCodeSearchRequest, number>(DeadCodeSearch);
	@observable searchProject : string;
	@observable searchScripts : number[] = [];
	@observable searchScriptOptions : DeadCodeScriptReference[] = [];
	@observable searchCountType: ExecutionCountType = "TOTAL";
	@observable searchCount : number = 3;

	render() {
		return <Grom.Box direction="row">
			<LoadingOverlay op={this.searchOperation}>
				<Grom.Box basis="3/4">
					<Grom.Heading>Find Dead Code</Grom.Heading>
					<ConsoleDocumentTitle title="Dead Code"/>
					<GetProjectsAjax
						request={{}}
						endpoint={GetProjects}
						onFirstLoad={(projects)=>this.searchProject=projects[0].apiKey}
						component={(projects) =>
							<GetScriptAjax
								request={{apiKey: this.searchProject as string, showOriginal: true}}
								endpoint={GetScripts}
								onLoad={(options)=>{
									this.searchScripts=[];
									this.searchScriptOptions = options.map((option)=>({ scriptId: option.versions[0], ...option}));
								}}
								component={()=>
									<Grom.Box direction="column">
										<ProjectsRowCombo
											label="Project"
											value={projects.find((project) => project.apiKey == this.searchProject)}
											options={projects.slice()}
											labelMaker={(project: ProjectsRow) => project.name}
											onSelect={(project) => {
												this.searchProject = project.apiKey;
											}}
										/>
										<Grom.Box direction="row" align="center" pad={{between:"small"}}>
											<Grom.Paragraph><b>Scripts</b></Grom.Paragraph>
											<div style={{flexGrow:1}}>
												<ReactSelect
													value={this.searchScripts.slice()}
													options={this.searchScriptOptions.map((script, index)=>({
														value:index,
														label:urlFileName(script.url)
													}))}
													onChange={(scripts)=>this.searchScripts = (scripts as Option<number>[]).map((script)=>script.value!!)}
													multi={true}
													placeholder="All"
													inputProps={{style:{border:"0px"}}}
												/>
											</div>
										</Grom.Box>
									</Grom.Box>}
							/>}
					/>
					<Grom.Box direction="row" pad={{between: "small"}} align="center">
						<Grom.Paragraph>Find all lines with less than</Grom.Paragraph>
						<input type="number" min="1" value={this.searchCount} onChange={(evt)=>this.searchCount = evt.target.valueAsNumber}/>
						<ExecutionCountTypeCombo
							value={this.searchCountType}
							options={["TOTAL", "PER_SESSION"]}
							labelMaker={(type) => type == "TOTAL" ? "total executions" : "per session"}
							onSelect={(type) => {
								this.searchCountType = type;
							}}
						/>
					</Grom.Box>
					<Grom.Button label="Search" onClick={this.performSearch}/>
				</Grom.Box>
			</LoadingOverlay>
		</Grom.Box>
	}

	performSearch(){
		const scriptOptions = this.searchScripts.map((index)=>this.searchScriptOptions[index]);
		this.searchOperation.sendThen({
			project: this.searchProject,
			scripts: scriptOptions,
			countType: this.searchCountType,
			count: this.searchCount
		}, (result)=>{
			DeadCodeReportViewRoute.go(this.props.router, {
				reportId: result,
				item: 0
			});
		});
	}
}

export const DeadCodeRoute = new TypedRoute<DeadCodeQuery, DeadCodeProps>("deadcode", DeadCode);


export interface DeadCodeReportViewQuery {
	reportId: number,
	item: number
}
export interface DeadCodeReportViewProps {
	location: {query: DeadCodeReportViewQuery},
	router: InjectedRouter
}

export class GetReportAjax extends AjaxWrapper<DeadCodeReportDisplayRequest, DeadCodeReport> {
}

export class DeadCodeReportView extends React.Component<DeadCodeReportViewProps, EmptyState>{
	render() : JSX.Element|any {
		const query = this.props.location.query;
		return <GetReportAjax
			request={{reportId: query.reportId}}
			endpoint={GetDeadCodeReportDisplay}
			component={(report) => {
				const item = report.results[query.item];
				if(report.results.length == 0){
					return <Grom.Box>
						<ConsoleDocumentTitle title={"Dead Code Report: Nothing found"}/>
						<Grom.Headline>Dead Code Report: Nothing found</Grom.Headline>
						<Grom.Paragraph>No lines were found that matched your search. <GoBack/></Grom.Paragraph>
					</Grom.Box>
				}
				const state = new DeadCodeViewState(item);
				return <ScriptView
					scriptId = {item.scriptId}
					sourceMapUrl = {item.fromSourceMap ? item.url : null}
					header={DeadCodeReportScriptViewHeader}
					menu={DeadCodeReportScriptViewMenu(state, report, query)}
					codeViewTransforms={(scriptView, markup)=>[
						new HighlightDeadCodeTransform(state, item),
						new MouseFollowerTransform(markup, (clickable)=> {
							scriptView.onCodeClick(clickable);
							if(clickable.type == "statement") {
								DeadCodeReportView.updateFocusIndex(state, item, clickable.statements);
							}
						}),
						new DeadCodeFocusTransform(state, item, markup)
					]}
				/>;
			}}
		/>;
	}

	static updateFocusIndex(state : DeadCodeViewState, item : DeadCodeSearchResult, statements : Array<StatementId>){
		const selected = statements[statements.length-1];
		state.focusIndex = state.deadSiteToIndex[StatementId.unwrap(selected)];
	}
}
export const DeadCodeReportViewRoute = new TypedRoute<DeadCodeReportViewQuery, DeadCodeReportViewProps>("deadcode/report", DeadCodeReportView);

@autobind
export class HighlightDeadCodeTransform implements CodeViewTransform {
	constructor(private state : DeadCodeViewState, private item : DeadCodeSearchResult){}
	transform(container : HTMLDivElement, reactAdder : ReactElementAdder){

		const spans = container.querySelectorAll("span[contains_statements]") as NodeListOf<HTMLSpanElement>;
		for(const span of spans){
			const statements : Array<string> = JSON.parse(span.getAttribute("contains_statements")!!);
			const lastStatement = Number.parseInt(statements[statements.length-1]);
			if(this.state.deadSiteToIndex[lastStatement] !== undefined) {
				span.style.background = `rgba(240, 40, 40, 0.44)`;
			}
		}
	}
}

@autobind
export class DeadCodeFocusTransform implements CodeViewTransform {
	constructor(private state : DeadCodeViewState, private item : DeadCodeSearchResult, private scriptMarkup : ScriptViewContext){}
	private focusedSpans : Array<HTMLSpanElement>=[];
	transform(container : HTMLDivElement, reactAdder : ReactElementAdder){
		autorun(()=>{
			for(const span of this.focusedSpans){
				span.style.borderTopWidth="";
				span.style.borderBottomWidth="";
				span.style.borderLeftWidth="";
				span.style.borderRightWidth="";
				span.style.borderStyle="";
				span.style.borderColor="";
			}
			const site = this.item.sites[this.state.focusIndex];
			this.focusedSpans = CodeView.spansForStatement(container, this.scriptMarkup, StatementId.wrap(site.site));
			for(let i=0; i<this.focusedSpans.length;i++){
				const span = this.focusedSpans[i];
				//Omit the border between two adjoining subspans that are part of the same selected statement
				if(!span.style.borderLeftWidth){
					span.style.borderLeftWidth="2px";
				}
				if(i+1<this.focusedSpans.length){
					const next = this.focusedSpans[i+1];
					//Adjoining?
					if(span.offsetLeft + span.offsetWidth == next.offsetLeft && span.offsetTop == next.offsetTop){
						span.style.borderRightWidth="0px";
						next.style.borderLeftWidth="0px";
					}
				}
				span.style.borderColor="blue";
				span.style.borderStyle="solid";
				span.style.borderTopWidth="2px";
				span.style.borderBottomWidth="2px";
				if(!span.style.borderRightWidth) span.style.borderRightWidth="2px";
			}

			if(this.focusedSpans[0]){
				//A short timeout for the initial scroll into view, as the HTML won't actually be added to the DOM yet
				setTimeout(()=>scrollIntoViewIfNeeded(this.focusedSpans[0], true), 0);
			}
		});
	}
}

function DeadCodeReportScriptViewHeader(this : ScriptView) : JSX.Element {
	const script = this.script.value!!;
	return <div>
		<ConsoleDocumentTitle title={"Dead Code for " + script.url}/>
		<Grom.Headline>Dead Code for {script.url}</Grom.Headline>
	</div>;
}

function DeadCodeReportScriptViewMenu(state : DeadCodeViewState, report : DeadCodeReport, query : DeadCodeReportViewQuery) : ((this: ScriptView)=>JSX.Element) {
	return function() {
		const script = this.script.value!!;
		const sourceMap = script.source.sourceMap;
		const item = report.results[query.item];
		return <Grom.Box colorIndex="light-1">
			<Grom.Box separator="vertical" direction="row" pad={{between: "small"}} wrap={true} align="center"
					  justify="center">
				<DeadCodeSourceSelector report={report} query={query}/>
				{sourceMap ? <LanguageSelector
					selected={this.resolvedLanguage}
					autodetected={this.autoDetectedLanguage}
					onSelect={(lang: string) => this.language = lang}
				/> : null}
				<DeadCodeNextBackButtons state={state} item={item}/>
			</Grom.Box>
		</Grom.Box>;
	}
}

class DeadCodeViewState {
	@observable public focusIndex : number = 0;
	public deadSiteToIndex : {[site : number] : number} = {};
	constructor(item : DeadCodeSearchResult){
		for(let i=0;i<item.sites.length;i++){
			this.deadSiteToIndex[item.sites[i].site] = i;
		}
	}
}

@observer
@autobind
class DeadCodeNextBackButtons extends React.Component<{state : DeadCodeViewState, item : DeadCodeSearchResult},EmptyState>{
	componentDidMount(){
		this.move(0);
	}
	render(){
		return <Grom.Box direction="row" pad={{between:"small"}} align="center">
			<Grom.Button label="Back" onClick={this.back}/>
			<Grom.Paragraph>
				<input style={{width:"120px"}} type="number" min={1} max={this.props.item.sites.length}
					   value={this.props.state.focusIndex+1}
					   onChange={(evt)=>this.props.state.focusIndex=Number.parseInt(evt.target.value)}
				/>/{this.props.item.sites.length}</Grom.Paragraph>
			<Grom.Button label="Next" onClick={this.next}/>
		</Grom.Box>;
	}

	private move(inc : number){
		let index = this.props.state.focusIndex + inc;
		if(index < 0) index = this.props.item.sites.length-1;
		index %= this.props.item.sites.length;
		this.props.state.focusIndex = index;
	}

	back(){ this.move(-1); }
	next(){ this.move(1); }
}

@observer
@autobind
class DeadCodeSourceSelector extends React.Component<{
	report: DeadCodeReport,
	query: DeadCodeReportViewQuery
}, any> {
	render() {
		const reportOptions = this.props.report.results;
		const optionIndices = range(0, reportOptions.length);
		return <SimpleNullableNumberCombo
			label="File"
			value={this.props.query.item}
			options={[...optionIndices]}
			labelMaker={this.makeItemLabel}
			onSelect={this.switchToItem}
			boxProps={{basis:"1/3"}}
		/>;
	}

	switchToItem(item: number|null) {
		if(item === null){ return; }
		const viewQuery: DeadCodeReportViewQuery = {...this.props.query};
		viewQuery.item = item;
		DeadCodeReportViewRoute.go(this.context.router, viewQuery);
	}

	makeItemLabel(itemIndex: number|null) {
		if(itemIndex === null){ return ""; }
		const item = this.props.report.results[itemIndex];
		const fileName = urlFileName(item.url);
		if (fileName != item.url) {
			return fileName + " | " + item.url;
		} else {
			return item.url;
		}
	}

	context: IRouterContext;
	static contextTypes = {
		router: PropTypes.object.isRequired
	};
}
