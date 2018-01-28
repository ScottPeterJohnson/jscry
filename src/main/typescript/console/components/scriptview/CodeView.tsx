import * as React from "react"
import * as Grom from "../../Grom";
import {autobind} from "core-decorators";
import {MouseFollower} from "../../utility/MouseFollower";
import {StatementId, statementSpanElementId} from "./StatementTrackingVisitor";
import {ScriptViewContext} from "./ScriptViewContext";
import {Html} from "../../../utility/Utility";
import {EmptyProps, EmptyState, isEqual, numberFormat} from "../../utility/ConsoleUtility";
import CSSProperties = React.CSSProperties;
import {style, media, cssRule} from "typestyle";
import {HtmlContainer, ReactElementAdder} from "./HtmlContainer";
import {ScriptAddCodeCommandData, ScriptCommandsRow} from "endpoints";
import {truncate} from "lodash";

interface CodeViewProps {
	startLine? : number
	scriptMarkup : ScriptViewContext,
	transforms : Array<CodeViewTransform>
}

@autobind
export class CodeView extends React.Component<CodeViewProps, EmptyState>{
	render() {
		const markup = this.props.scriptMarkup;
		return <div style={{minHeight: "400px"}}>

			<Grom.Split fixed={false} flex="right" priority="right">
				<CodeGutter startLine={0} lineCount={markup.lineCount}/>
				<Grom.Box flex={true}>
					<pre>
						<code style={{padding:"5px 0px 0px 5px"}} className={`hljs ${markup.resolvedLanguage}`}>
							<HtmlContainer html={markup.html} transforms={this.props.transforms.map((transform)=>{
								return (container : HTMLDivElement, reactAdder : ReactElementAdder)=>transform.transform(container, reactAdder)
							})}/>
						</code>
					</pre>
					{this.props.children}
				</Grom.Box>
			</Grom.Split>
		</div>;
	}

	static spanToClickable(clickable : HTMLSpanElement) : CodeViewClickable {
		if(clickable.hasAttribute("contains_statements")){
			const statementsHovered : Array<StatementId> = JSON.parse(clickable.getAttribute("contains_statements")!!);
			const topmostStatement = statementsHovered[statementsHovered.length - 1];
			return {type:"statement",activeStatement:topmostStatement, statements: statementsHovered};
		} else {
			return {type:"added_code", id: +clickable.getAttribute("cmdId")!, site: +clickable.getAttribute("cmdSite")!, span: clickable};
		}
	}

	private static clickableSpanIntersectingDom(container : HTMLElement, dom: HTMLElement): HTMLElement|null {
		const down = dom.querySelectorAll("span[clickable]");
		if (down.length == 1) {
			return down[0] as HTMLElement;
		}
		else {
			let current: HTMLElement|null = dom;
			while (current && current != container) {
				if (current.matches("span[clickable]")) {
					return current;
				}
				else {
					current = current.parentElement;
				}
			}
		}
		return null;
	}

	static uniqueClickableIntersectingDom(container : HTMLElement, dom: HTMLElement): CodeViewClickable|null {
		const clickableSpan = CodeView.clickableSpanIntersectingDom(container, dom);
		if(clickableSpan != null){ return CodeView.spanToClickable(clickableSpan); }
		else { return null; }
	}

	static spansForStatement(container : HTMLElement, scriptMarkup : ScriptViewContext, statementId : StatementId) : Array<HTMLSpanElement>{
		const spanIds = scriptMarkup.spanIds.get(statementId) || [];
		const spans : Array<HTMLElement> = [];
		for(const spanId of spanIds){
			const span = container.querySelector("#" + statementSpanElementId(spanId)) as HTMLElement;
			spans.push(span);
		}
		return spans;
	}
}


const lineDivStyle = style({
	display: "inline-block"
});
const lineDivToolsContainerStyle = style({
	display: "inline-block",
	width: "42px"
});

interface CodeGutterLineProps {
	line : number
}

class CodeGutterLine extends React.Component<CodeGutterLineProps, EmptyState>{
	render(){
		return <div>
			<div className={lineDivStyle}>{this.props.line}</div>
			<div className={lineDivToolsContainerStyle}/>
		</div>
	}
}


interface CodeGutterProps {
	startLine: number //0-based
	lineCount: number
}

const codeGutterStyle = style({
	textAlign: "right",
	fontSize: "1em",
	borderRight: "1px solid grey",
	color: "#686868",
	background: "#3b3f42",
	padding: "5px 0px 0px 5px",
	cursor: "default",
	fontFamily: 'Consolas, Menlo, "DejaVu Sans Mono", "Liberation Mono", monospace'
});

class CodeGutter extends React.Component<CodeGutterProps, EmptyState>{
	render(){
		//We're guessing a width for each linecount character
		const projectedLineMarkerWidth = Math.floor(Math.log10(this.props.startLine + this.props.lineCount)+1) * 13;
		const totalWidth = projectedLineMarkerWidth + 42;
		const lines = [];
		for(let i=this.props.startLine+1;i<=this.props.startLine + this.props.lineCount;i++){
			lines.push(<CodeGutterLine key={i} line={i}/>);
		}
		return <div className={codeGutterStyle} style={{width: `${totalWidth}px`}}>{lines}</div>
	}
}

function executionHue(normalizedExecutions : number) : number {
	const logExecutions = Math.min(Math.max(Math.log(normalizedExecutions), 0), 8);
	//Green -> Red
	return (1 - logExecutions/8.0) * 120;
}
function executionAlpha(useCount : number): number {
	return Math.max((Math.min(50, useCount) / 50) * 0.2, 0.05)
}


export interface CodeViewTransform {
	transform : (container : HTMLDivElement, reactAdder : ReactElementAdder)=>void;
}

@autobind
export class HighlightExecutionCountTransform implements CodeViewTransform {
	constructor(private scriptMarkup : ScriptViewContext){}
	transform(container : HTMLDivElement, reactAdder : ReactElementAdder){
		const spans = container.querySelectorAll("span[contains_statements]") as NodeListOf<HTMLSpanElement>;
		for(const span of spans){
			const statements : Array<string> = JSON.parse(span.getAttribute("contains_statements")!!);
			const lastStatement = statements[statements.length-1];
			const {sum, sessionUseCount} = this.scriptMarkup.getStatementExecutions(StatementId.wrap(Number.parseInt(lastStatement)));
			if(sum > 0) {
				const normalizedExecutionsForStatement = sum / Math.max(sessionUseCount, 1);
				const hue = executionHue(normalizedExecutionsForStatement);
				const alpha = executionAlpha(sessionUseCount);
				span.style.background = `hsla(${hue}, 100%, 50%, ${alpha})`
			} else {
				span.style.background = `rgba(120,120,120,0.2)`
			}
		}
	}
}

export function addAddedCodeSpan(container : HTMLElement, scriptMarkup : ScriptViewContext, statement : number, command : ScriptCommandsRow) : HTMLSpanElement {
	const spans = CodeView.spansForStatement(container, scriptMarkup, StatementId.wrap(+statement));
	const firstSpan = spans[0];
	const cmdSpan = document.createElement("span");
	cmdSpan.style.margin="0px 5px 0px 5px";
	cmdSpan.style.color="red";
	cmdSpan.style.cursor="pointer";
	cmdSpan.innerText = (JSON.parse(command.commandData) as ScriptAddCodeCommandData).code;
	cmdSpan.setAttribute("clickable", "true");
	cmdSpan.setAttribute("cmdSite", ""+statement);
	cmdSpan.setAttribute("cmdId", ""+command.scriptCommandId);
	firstSpan.parentElement!.insertBefore(cmdSpan, firstSpan);
	return firstSpan;
}

@autobind
export class ShowAddedCodeTransform implements CodeViewTransform {
	constructor(private scriptMarkup : ScriptViewContext){}
	transform(container : HTMLDivElement, reactAdder : ReactElementAdder){
		const commands = this.scriptMarkup.script.commands;
		for(const [site, siteCommands] of commands){
			for(const command of siteCommands){
				if(command.commandType == "ADD_CODE") {
					addAddedCodeSpan(container, this.scriptMarkup, +site, command);
				}
			}
		}
	}
}


export const selectedStatementStyle = style({
	background: "#3A47A4CC !important"
});
const hoveredStatementStyle = style({
	background: "teal !important"
});

export type AddedCodeClickable = {type: "added_code", id:number, site : number, span : HTMLSpanElement};

export type CodeViewClickable = AddedCodeClickable
	| {type:"statement",activeStatement:StatementId,statements: Array<StatementId>};


@autobind
export class MouseFollowerTransform implements CodeViewTransform {
	constructor(private scriptMarkup : ScriptViewContext, private onClickableClicked: (_:CodeViewClickable)=>void){}

	hoverHighlightedElements : Array<HTMLElement> = [];
	lastHovered : CodeViewClickable | null = null;

	static tooltipStyle = style({
		zIndex:1,backgroundColor: "#702963", color:"#EEEEEE"
	});

	transform(container : HTMLDivElement, reactAdder : ReactElementAdder){
		reactAdder(
			<MouseFollower container={container} child={this.codeTooltip} onClick={this.onCodeClick} />,
			(mountPoint)=>container.appendChild(mountPoint)
		)
	}

	codeTooltip(container: HTMLElement, target: HTMLElement) {
		const clickable = CodeView.uniqueClickableIntersectingDom(container, target);
		if(clickable != null){
			if(!isEqual(clickable, this.lastHovered)){
				const spans = clickable.type == "statement" ? CodeView.spansForStatement(container, this.scriptMarkup, clickable.activeStatement) : [clickable.span];
				this.removeElementHighlights();
				this.lastHovered = clickable;
				this.addElementHighlights(spans);
			}
			if(clickable.type == "statement"){
				const executions = this.scriptMarkup.getStatementExecutions(clickable.activeStatement);

				return <div className={MouseFollowerTransform.tooltipStyle}>
					<div>{executions.sum} uses in {executions.sessionUseCount} sessions ({numberFormat(executions.sum/Math.max(executions.sessionUseCount,1), 3)} per session)</div>
					<div>JS: <code>{truncate(this.scriptMarkup.getGeneratedSnippet(clickable.activeStatement), {length:100})}</code></div>
				</div>;
			} else {
				return <div className={MouseFollowerTransform.tooltipStyle}>This code is being dynamically added to the script</div>;
			}
		} else {
			if (this.lastHovered != null) {
				this.lastHovered = null;
				this.removeElementHighlights();
			}
			return null;
		}
	}

	onCodeClick(container : HTMLElement, target : HTMLElement){
		const clickable = CodeView.uniqueClickableIntersectingDom(container, target);
		if(clickable != null){
			this.onClickableClicked(clickable);
		}
	}

	removeElementHighlights(){
		for(const element of this.hoverHighlightedElements){
			element.classList.remove(hoveredStatementStyle);
		}
		this.hoverHighlightedElements = [];
	}

	addElementHighlights(elements : Array<HTMLElement>){
		for(const element of elements){
			element.classList.add(hoveredStatementStyle);
			this.hoverHighlightedElements.push(element);
		}
	}
}


