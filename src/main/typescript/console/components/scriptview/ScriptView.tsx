import * as React from "react"
import {
	ConsoleDocumentTitle, TypedRoute, SingleCallMemoizer, GoBack, EmptyState,
	ObservableComponent, isEqual, Labeled, numberFormat, IRouterContext
} from "../../utility/ConsoleUtility";
import * as Grom from "../../Grom";
import {InjectedRouter} from "react-router";
import {
	AddedCodeClickable,
	CodeView, CodeViewClickable, CodeViewTransform, HighlightExecutionCountTransform, MouseFollowerTransform,
	ShowAddedCodeTransform
} from "./CodeView";
import {
	AjaxPropsLoader, LoadingOverlay, AjaxOperation
} from "../../utility/AjaxComponents";
import {GetScript, GetScriptRequest, ScriptClientView, StandardizedSourceMap, ScriptSettingsRow, ToggleScriptEnabled, ToggleScriptEnabledRequest, DefaultableBoolean, UploadSourcemap, UploadSourcemapResponse} from "endpoints";
import {autobind} from "core-decorators";
import {SimpleStringCombo, SimpleNumberCombo, SimpleNullableNumberCombo} from "../../utility/SimpleCombo";
import {StatementId} from "./StatementTrackingVisitor";
import {ScriptViewContext} from "./ScriptViewContext";
import {basicComparator, ErrorMessage, range, urlFileName} from "../../../utility/Utility";
import {StatementView} from "./StatementView";
import {observer} from "mobx-react/custom";
import {asMap, computed, isArrayLike, observable} from "mobx";
import FileUploadProgress from "react-fileupload-progress";
import {FormEventHandler} from "react";
import {ShowHide, ShowHideButton, ShowHideLink, ShowHideSection} from "../ShowHideSection";
import * as ReactDOM from "react-dom";
import {sumBy} from "lodash";
import RouterContext from "react-router/lib/RouterContext";
import {isArray} from "util";
import {AddedCodeView} from "./AddedCodeView";
import {hljsLanguages, languageProperNames} from "../../utility/HighlightJsLanguages";
import * as PropTypes from "prop-types";

interface ScriptViewProps {
	scriptId : number
	sourceMapUrl : string|null
	header : ScriptViewHeader
	menu : ScriptViewMenu
	codeViewTransforms : (scriptView: ScriptView, markup : ScriptViewContext) => Array<CodeViewTransform>
}

interface ScriptViewHeader {
	(this : ScriptView) : JSX.Element;
}

interface ScriptViewMenu {
	(this : ScriptView) : JSX.Element;
}

function DefaultScriptViewHeader(this: ScriptView): JSX.Element {
	const script = this.script.value!!;
	return <Grom.Box pad="small">
		{this.sourceMapIndex != null ?
			<div>
				<ConsoleDocumentTitle title={urlFileName(this.sourceMapUrl()!)}/>
				<Grom.Headline>{urlFileName(this.sourceMapUrl()!)}</Grom.Headline>
				<Grom.Heading tag="h2">Source {this.sourceMapUrl()} from {script.url}</Grom.Heading>
			</div>
			: <div>
				<ConsoleDocumentTitle title={script.url}/>
				<Grom.Headline>{script.url}</Grom.Headline>
			</div>
		}
	</Grom.Box>;
}

function DefaultScriptViewMenu(pageQuery : ScriptViewQuery) : ((this: ScriptView)=>JSX.Element) {
	return function() {
		const script = this.script.value!!;
		const sourceMap = script.source.sourceMap;

		const settingsHolder = new ScriptSettingsHolder(this.script.value!!, this.sourceMapUrl());
		return <Grom.Box colorIndex="light-1">
			<Grom.Box separator="vertical" direction="row" pad={{between: "small"}} wrap={true} align="center"
					  justify="center">
				{sourceMap ? <SourceSelector
					initialIndex={this.sourceMapIndex}
					sourceMap={sourceMap}
					query={pageQuery}
				/> : null}
				<VersionSelector selected={this.props.scriptId} availableVersions={pageQuery.availableVersions}
								 query={pageQuery}/>
				{sourceMap ? <LanguageSelector
					selected={this.resolvedLanguage}
					autodetected={this.autoDetectedLanguage}
					onSelect={(lang: string) => this.language = lang}
				/> : null}
				<ShowHideButton section={this.showSettings} show="More" hide="Less"/>
			</Grom.Box>
			<ShowHideSection section={this.showSettings}>
				<Grom.Box direction="column">
					<ToggleCollectionButton settings={settingsHolder}/>
					<SourceMapInfo script={this.script.value!!} scriptView={this}/>
				</Grom.Box>
			</ShowHideSection>
		</Grom.Box>;
	}
}

@observer
@autobind
export class ScriptView extends ObservableComponent<ScriptViewProps, EmptyState> {
	@observable script = new AjaxPropsLoader<GetScriptRequest,ScriptClientView>(this, GetScript, ()=>({ scriptId: this.props.scriptId }));
	@observable language : string|null = null;
	@observable selected : AddedCodeClickable|Array<StatementId>|null = null;
	@observable showSettings = new ShowHide();

	@computed get autoDetectedLanguage() : string|null {
		return this.maybeScriptMarkup.unwrap((markup)=>markup.resolvedLanguage, ()=>null);
	}

	@computed get resolvedLanguage(){
		if(this.language != null){
			return this.language;
		}
		if(this.script.value != null && this.script.value.source.sourceMap){
			return 'auto';
		} else {
			return 'js';
		}
	}

	@computed get sourceMapIndex() : number | null {
		if(this.props.sourceMapUrl == null){
			return null;
		} else {
			const index = this.script.value!!.source.sourceMap.sources.indexOf(this.props.sourceMapUrl);
			if(index>=0){ return index; }
			else { return null; }
		}
	}

	@computed get maybeScriptMarkup(){
		return ScriptViewContext.create(this.script.value!!, this.sourceMapIndex, this.resolvedLanguage)
	}

	render() : JSX.Element {
		if(!this.script.ready()){ return this.script.render() }

		return <Grom.Box full>
				{this.props.header.apply(this)}
				{this.props.menu.apply(this)}
				<div style={{overflow:"scroll"}}>
					{this.maybeScriptMarkup.unwrap(
						(scriptMarkup : ScriptViewContext)=>
							<div>
								<CodeView
									scriptMarkup={scriptMarkup}
									transforms={this.props.codeViewTransforms(this, scriptMarkup)}
								>
									<StatementView
										scriptMarkup={scriptMarkup}
										statements={isArrayLike(this.selected) ? this.selected : []}
										onClose={this.closeSelected}
									/>
									{this.selected && "id" in this.selected ?
										<AddedCodeView script={this.script.value!}
											addedCode={this.selected as AddedCodeClickable} onClose={this.closeSelected}/>
										: null}
								</CodeView>
							</div>,
						(error : ErrorMessage)=> <Grom.Paragraph>{error.message}</Grom.Paragraph>
					)}
					{/* Add a little spacer at the bottom to give scroll space for the statement view. */}
					<div style={{height: "600px", width: "50px"}}/>
				</div>
			</Grom.Box>;
	}

	onCodeClick(clickable : CodeViewClickable){
		let newSelected : CodeViewClickable|Array<StatementId>;
		if(clickable.type == "statement"){
			newSelected = clickable.statements;
		} else {
			newSelected = clickable;
		}
		if(isEqual(this.selected, newSelected)){
			//Toggle selection on doubleclick
			this.selected = null;
		} else {
			this.selected = newSelected;
		}
	}
	closeSelected(){
		this.selected = null;
	}

	sourceMapUrl() : string|null {
		return this.sourceMapIndex == null ? null : this.script.value!!.source.sourceMap.sources[this.sourceMapIndex];
	}
}

interface ScriptViewQuery {
	sourceMapUrl: string|null
	scriptId: number
	availableVersions: number[]
}

interface ScriptViewPageProps { location : { query: ScriptViewQuery } }

class ScriptViewPage extends React.Component<ScriptViewPageProps, EmptyState>{
	render(){
		const query = this.props.location.query;
		return <ScriptView
			scriptId={query.scriptId}
			sourceMapUrl={query.sourceMapUrl}
			menu={DefaultScriptViewMenu(this.props.location.query)}
			header={DefaultScriptViewHeader}
			codeViewTransforms={(scriptView, markup)=>[
				new HighlightExecutionCountTransform(markup),
				new MouseFollowerTransform(markup, scriptView.onCodeClick),
				new ShowAddedCodeTransform(markup)
			]}
		/>;
	}
}
export const ScriptViewPageRoute = new TypedRoute<ScriptViewQuery,ScriptViewPageProps>("script", ScriptViewPage);


//Basic class to pass to buttons in script view to allow them to manipulate the script settings
@autobind
class ScriptSettingsHolder {
	constructor(public script : ScriptClientView, public sourceMapUrl: string|null){}
	@computed get read() : Readonly<ScriptSettingsRow> {
		for(const settings of this.script.settings){
			if(this.sourceMapUrl == settings.fromSourceMapUrl){
				return settings
			}
		}
		return {url:'',fromSourceMapUrl:'', apiKey: '', collectionEnabled: 'DEFAULT' }
	}

	updateSettings(update : (_:ScriptSettingsRow)=>void){
		for(const settings of this.script.settings){
			if(this.sourceMapUrl == settings.fromSourceMapUrl){
				update(settings);
				return;
			}
		}
		const settings : ScriptSettingsRow = {url:this.script.url,fromSourceMapUrl:this.sourceMapUrl!, apiKey: this.script.apiKey, collectionEnabled: 'DEFAULT' };
		update(settings);
		this.script.settings.push(settings);
	}
}

/**
 * Script view buttons
 */
@autobind
class VersionSelector extends React.Component<{
	selected : number,
	availableVersions : number[],
	query : ScriptViewQuery
},EmptyState> {
	render(): JSX.Element {
		return <SimpleNumberCombo
			label="Version"
			value={this.props.selected}
			options={this.props.availableVersions}
			labelMaker={(scriptId) => `${scriptId}${scriptId == this.props.availableVersions[0] ? ' (Latest)' : ''}`}
			onSelect={this.onSelect}
		/>;
	}
	onSelect(version : number){
		const viewQuery: ScriptViewQuery = {...this.props.query};
		viewQuery.scriptId = version;
		ScriptViewPageRoute.go(this.context.router, viewQuery);
	}
	context : IRouterContext;
	static contextTypes = {
		router: PropTypes.object.isRequired
	};
}


@autobind
@observer
export class LanguageSelector extends React.Component<{ selected : string, autodetected : string|null, onSelect : (lang : string)=>void },EmptyState>{
	labelLanguage(language: string) {
		if (language == 'auto') {
			return this.props.autodetected == null ? 'Autodetect' : `${languageProperNames[this.props.autodetected]} (Detected)`;
		} else {
			return languageProperNames[language];
		}
	}
	render() {
		return <SimpleStringCombo
			label="Language"
			value={this.props.selected}
			options={['auto', ...hljsLanguages()]}
			labelMaker={this.labelLanguage}
			onSelect={this.props.onSelect}
		/>;
	}
}

@observer
@autobind
class SourceSelector extends React.Component<{initialIndex: number|null, sourceMap: StandardizedSourceMap, query : ScriptViewQuery},any> {
	render(){
		const sourceMap = this.props.sourceMap;
		const sourceOptions = [...range(0, sourceMap.sources.length)].sort((a, b)=> basicComparator(urlFileName(sourceMap.sources[a]), urlFileName(sourceMap.sources[b])));
		return <SimpleNullableNumberCombo
			label="Original source"
			value={this.props.initialIndex}
			options={[null, ...sourceOptions]}
			labelMaker={this.makeSourceLabel}
			onSelect={this.switchToSource}
		/>;
	}
	switchToSource(source: number) {
		const viewQuery: ScriptViewQuery = {...this.props.query};
		viewQuery.sourceMapUrl = this.props.sourceMap.sources[source];
		ScriptViewPageRoute.go(this.context.router, viewQuery);
	}
	makeSourceLabel(source : number|null) {
		if (source == null) {
			return "None (Actual JS)";
		} else {
			const sourceName = this.props.sourceMap.sources[source];
			const fileName = urlFileName(sourceName);
			if(fileName != sourceName){
				return fileName + " | " + sourceName;
			} else {
				return sourceName;
			}
		}
	}
	context : IRouterContext;
	static contextTypes = {
		router: PropTypes.object.isRequired
	};
}

@autobind
@observer
class ToggleCollectionButton extends React.Component<{settings : ScriptSettingsHolder},{}>{
	@observable toggleCollection = new AjaxOperation<ToggleScriptEnabledRequest,boolean>(ToggleScriptEnabled);
	render(){
		return <LoadingOverlay op={this.toggleCollection}>
			<Grom.CheckBox checked={this.props.settings.read.collectionEnabled != 'FALSE'} onChange={this.toggleCollectionEnabled} label="Collect this file"/>
		</LoadingOverlay>;
	}

	toggleCollectionEnabled() {
		const enabled: DefaultableBoolean = this.props.settings.read.collectionEnabled === 'FALSE' ? 'TRUE' : 'FALSE';
		this.toggleCollection.sendThen({
			apiKey: this.props.settings.script.apiKey,
			scriptUrl: this.props.settings.script.url,
			fromSourceMapUrl: this.props.settings.sourceMapUrl as string,
			enabled: enabled
		}, (result) => {
			this.props.settings.updateSettings((setting)=> setting.collectionEnabled = enabled)
		});
	}
}

@autobind
@observer
class SourceMapInfo extends React.Component<{script : ScriptClientView, scriptView : ScriptView}, EmptyState>{
	uploadSourceMap = new ShowHide();
	render(){
		let sourceMapText = "None";
		const sourceMap = this.props.script.source.sourceMap;
		if(sourceMap){
			const sourceMapSize = Math.round((sourceMap.mappings.length + sumBy(sourceMap.sourcesContent, (val)=>val.length))/1024);
			sourceMapText = `Found, ${numberFormat(sourceMapSize, 2)}k, ${sourceMap.sources.length} sources`;
		}
		return <Grom.Box direction="row" align="center">
			<Grom.Paragraph><b>Source Map:</b> {sourceMapText} &nbsp;&nbsp;</Grom.Paragraph>
			<ShowHideLink section={this.uploadSourceMap} show="Upload" hide="Cancel"/>
			<ShowHideSection section={this.uploadSourceMap} border={true}>
				{this.sourceMapError != null ? <p style={{color:"red"}}>Error: {this.sourceMapError}</p> : null}
				<FileUploadProgress url={UploadSourcemap.endpoint} formRenderer={this.uploadFormRender} formGetter={this.getUploadFormDomNode} onLoad={this.sourceMapUploaded}/>
			</ShowHideSection>
		</Grom.Box>;
	}

	@observable sourceMapError : string|null = null;
	sourceMapUploaded(e : ProgressEvent, req : XMLHttpRequest){
		const response : UploadSourcemapResponse = JSON.parse(req.responseText);
		this.sourceMapError = response.error;
		if(response.error == null) {
			//Reload for sourcemap
			this.props.scriptView.forceUpdate();
		}
	}

	getUploadFormDomNode(){
		return new FormData(ReactDOM.findDOMNode(this.uploadForm!!) as HTMLFormElement)
	}
	uploadForm : Grom.Form|null = null;
	uploadFormRender(onSubmit : FormEventHandler<any>){
		return <Grom.Form compact={true} ref={(form)=>this.uploadForm = form}>
			<Grom.Box direction="row">
				<input type="file" name="file" accept=".map"/>
				<input type="hidden" name="scriptId" value={this.props.script.scriptId}/>
				<Grom.Button label="Upload" type="submit" onClick={onSubmit}/>
			</Grom.Box>
		</Grom.Form>
	}

}