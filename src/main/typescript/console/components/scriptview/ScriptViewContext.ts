import {
	trackStatements, StatementSpanId, StatementId, StatementRange
} from "./StatementTrackingVisitor";
import {ErrorOr, countLines, Html, mapGetOrPut, basicComparator} from "../../../utility/Utility";
import {ScriptClientView, SumAndUseCount} from "endpoints";
import {Javascript} from "../../../transform/Transform";
import {consoleHighlightBlock, getHljsLanguage} from "../../utility/HighlightJsLanguages";

export class ScriptViewContext {
	readonly resolvedLanguage : string;
	readonly spanIds: Map<StatementId,Set<StatementSpanId>>;
	readonly html : Html;
	readonly source : string;
	readonly generatedJs: Javascript|null = null;
	readonly lineCount : number;
	readonly probablyMinified : boolean =  false;
	private readonly statementsMap = new Map<StatementId,Array<StatementRange>>();
	private readonly generatedStatementsMap = new Map<StatementId, StatementRange>();

	private constructor(public script : ScriptClientView, public originalSourceIndex : number|null, language: string|'auto'){
		//Calculate statement ranges and statement span HTML
		const js = Javascript.wrap(script.source.text);
		const sourceMap = script.source.sourceMap;
		const {html: trackedHtml, spanIds, originalStatementRanges, source, generatedStatementRanges} = trackStatements(js, sourceMap, originalSourceIndex);
		for(const statement of originalStatementRanges){
			mapGetOrPut(this.statementsMap, statement.statementId, ()=>[]).push(statement)
		}
		this.spanIds = spanIds;
		this.source = Javascript.unwrap(source);
		this.lineCount = countLines(Javascript.unwrap(source));
		this.generatedJs = js;
		for(const generatedStatement of generatedStatementRanges){
			this.generatedStatementsMap.set(generatedStatement.statementId, generatedStatement);
		}
		if(originalSourceIndex == null){
			this.probablyMinified = ScriptViewContext.isProbablyMinified(this.source);
		}

		//Add highlighting via highlightjs
		const node = document.createElement('div');
		node.innerHTML = Html.unwrap(trackedHtml);
		if(language != 'auto'){
			node.setAttribute("class", language);
		}
		if(!this.probablyMinified) {
			consoleHighlightBlock(node);
		}
		this.html = Html.wrap(node.innerHTML);
		if(language != 'auto'){
			this.resolvedLanguage = language;
		} else {
			for(const clazz of node.classList){
				if(clazz != 'hljs'){
					this.resolvedLanguage = clazz;
					break;
				}
			}
		}
	}

	static isProbablyMinified(source : string){
		let nonBlankLineCount = 1;
		let lineCharacterCount = 0;
		for(const char of source){
			if(char == '\n'){
				if(lineCharacterCount != 0) {
					lineCharacterCount = 0;
					nonBlankLineCount += 1;
				}
			} else {
				lineCharacterCount += 1;
			}
		}
		return source.length / nonBlankLineCount >= 100.0;
	}

	hasSourceMap() : boolean {
		return !!this.script.source.sourceMap;
	}
	usingSourceMap() : boolean {
		return this.hasSourceMap() && this.originalSourceIndex != null;
	}
	hasMultipleOriginalSources(): boolean {
		return this.script.source.sourceMap && this.script.source.sourceMap.sources.length>1;
	}
	getStatementExecutions(statementId : StatementId) : SumAndUseCount {
		const statement = statementId;
		if(this.generatedJs){
		}
		return this.script.executionSums.get(StatementId.unwrap(statement)+"")||{sum:0, sessionUseCount:0};
	}
	getStatementRanges(statementId : StatementId){
		const statement = this.statementsMap.get(statementId);
		if(!statement){
			throw Error(`Statement ${statementId} not found`);
		} else {
			return statement;
		}
	}

	getSourceSnippet(statementId : StatementId){
		const statementRanges = this.getStatementRanges(statementId);
		return statementRanges.slice().sort((left,right)=>basicComparator(left.start, right.start)).map((statementRange)=>this.source.substring(statementRange.start, statementRange.end)).join("");
	}

	getGeneratedSnippet(statementId : StatementId){
		const statementGeneratedRange = this.getGeneratedStatement(statementId);
		return (this.generatedJs || this.source).substring(statementGeneratedRange.start, statementGeneratedRange.end);
	}

	getGeneratedStatement(statementId : StatementId){
		const statement = this.generatedStatementsMap.get(statementId);
		if(!statement){
			throw Error(`Generated statement for ${statementId} not found`);
		} else {
			return statement;
		}
	}
	static create(script : ScriptClientView, originalSourceIndex : number|null, language: string|'auto') : ErrorOr<ScriptViewContext>{
		if(!script.source.text){
			return ErrorOr.error<ScriptViewContext>({code: 'no_source_content', message: `No source content was captured for this script.`});
		}
		const sourceMap = script.source.sourceMap;
		if(originalSourceIndex && originalSourceIndex >= sourceMap.sources.length) {
			return ErrorOr.error<ScriptViewContext>({code: 'invalid_source_map', message: `Invalid sourcemap index`});
		} else {
			return ErrorOr.just(new ScriptViewContext(script, originalSourceIndex, language));
		}
	}
}