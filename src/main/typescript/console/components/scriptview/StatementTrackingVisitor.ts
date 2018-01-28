import {JsVisitor, Insert, Delete, Javascript, visit, output, NodeStack} from "../../../transform/Transform";
import {Statement, Node} from "estree";
import {statementLoggable} from "../../../webembed/WebVisitor";
import stable from "stable";
import {
	Html, escapeHtml, binarySearch, closestUnderOrEqualSearch, copy,
	basicComparator, debugLog, assert
} from "../../../utility/Utility";
import {MappingItem, SourceMapConsumer} from "source-map";
import {StandardizedSourceMap} from "endpoints";
import {SimpleCombo} from "../../utility/SimpleCombo";
import {SourceMapper} from "../../utility/SourceMapper";
import {values, groupBy} from "lodash";

export class StatementIdCombo extends SimpleCombo<StatementId>{}

export class StatementId {
	private unique(){}
	private constructor(){}
	static wrap(obj : number){ return obj as any as StatementId; }
	static unwrap(wrapped : StatementId){ return wrapped as any as number; }
}

export class GeneratedStatementRange{
	private unique(){}
	start: number;
	end : number;
	statementId : StatementId;
	constructor(parameters : {start : number, end : number, statementId : StatementId}){
		copy(parameters, this);
	}
}
export class StatementRange {
	private unique(){}
	start: number;
	end : number;
	statementId : StatementId;
	constructor(parameters : {start : number, end : number, statementId : StatementId}){
		copy(parameters, this);
	}
}


export class IntersectingStatementRange {
	private unique(){}
	start: number;
	end: number;
	statements: Array<StatementId>;
	constructor(parameters: {start: number, end: number, statements: Array<StatementId>}){
		copy(parameters, this);
	}
}

/**
 * A JsVisitor visitor that collects every statement which could be annotated.
 */
export class StatementTrackingVisitor implements JsVisitor {
	statementRanges : Array<StatementRange> = [];
	handleStatement(statement: Statement, stack: NodeStack): void {
		if (statementLoggable(statement, stack)) {
			this.statementRanges.push(new StatementRange({
				start: statement.start,
				end: statement.end,
				statementId: StatementId.wrap(statement.start)
			}));
		}
	}
	handleAssignment(node: Node): void {}
}

//Ordering functions for statement ranges
function statementCompareByStart(a : StatementRange|GeneratedStatementRange, b : StatementRange|GeneratedStatementRange){
	if(a.start < b.start){ return -1; }
	else if(a.start > b.start){ return 1; }
	else { return 0; }
}

function statementCompareByEnd(a : StatementRange|GeneratedStatementRange, b : StatementRange|GeneratedStatementRange){
	if(a.end < b.end){ return -1; }
	else if(a.end > b.end){ return 1; }
	else { return 0; }
}

function addStatementRange(into : Array<IntersectingStatementRange>, start : number, end : number, active : Set<StatementRange>) {
	if(start != end) {
		into.push(new IntersectingStatementRange({
			start: start,
			end: end,
			statements: Array.from(active).map((statement) => statement.statementId)
		}));
	}
}

/**
 * Intersects statements, turning a sorted array of overlapping statement ranges into a nonoverlapping sorted array of
 * multistatement ranges
 */
function intersectStatements(statements : Array<StatementRange>) : Array<IntersectingStatementRange> {
	const result = new Array<IntersectingStatementRange>();
	const openings : Array<StatementRange> = stable(statements, statementCompareByStart);
	const closings = stable(statements, statementCompareByEnd);
	let openingIndex = 0;
	let closingIndex = 0;
	const activeStatements = new Set<StatementRange>();
	let lastEndpoint = 0;
	while(closingIndex < closings.length){
		if(openingIndex < openings.length && openings[openingIndex].start <= closings[closingIndex].end){
			if(activeStatements.size && lastEndpoint != openings[openingIndex].start) {
				addStatementRange(result, lastEndpoint, openings[openingIndex].start, activeStatements);
			}
			lastEndpoint = openings[openingIndex].start;
			activeStatements.add(openings[openingIndex]);
			openingIndex += 1;
		} else {
			if(lastEndpoint != closings[closingIndex].end) {
				addStatementRange(result, lastEndpoint, closings[closingIndex].end, activeStatements);
			}
			lastEndpoint = closings[closingIndex].end;
			activeStatements.delete(closings[closingIndex]);
			closingIndex += 1;
		}
	}
	return result;
}

export type StatementSpanId = number;
export function statementSpanElementId(statementSpanId : StatementSpanId) : string { return `statement_span_${statementSpanId}`; }

function spanOperationsFrom(statements : Array<IntersectingStatementRange>) : {operations: Array<Insert|Delete>, spanIds: Map<StatementId,Set<StatementSpanId>>} {
	const result = new Array<Insert|Delete>();
	const spanIds = new Map<StatementId, Set<StatementSpanId>>();
	let statementSpanId = 0;
	for(const statementRange of statements){
		for(const statementId of statementRange.statements){
			let ids = spanIds.get(statementId);
			if(ids == null){ ids = new Set(); spanIds.set(statementId, ids); }
			ids.add(statementSpanId)
		}
		result.push(
			{
				start: statementRange.start,
				text: `<span id="${statementSpanElementId(statementSpanId)}" style="cursor:pointer;" clickable="true" contains_statements="${JSON.stringify(statementRange.statements)}">`
			},
			{
				start: statementRange.end,
				text: '</span>'
			});
		statementSpanId += 1;
	}
	return {operations:result, spanIds: spanIds};
}

/**
 * Produces a line map from the given source, indexable by 0-based line number. Each entry is the 0-based character
 * position the line starts at.
 */
function lineMap(source : string) : Array<number> {
	const lines = source.split("\n");
	const mapping = [];
	let sourceIndex = 0;
	for(const line of lines){
		mapping.push(sourceIndex);
		sourceIndex += line.length + 1; //+1 for the \n character
	}
	return mapping;
}

function offsetToLineAndColumn(lineMap : Array<number>, pos : number) : {line:number, column:number} {
	const line = closestUnderOrEqualSearch(lineMap, pos);
	const column = pos - lineMap[line];
	return {line, column};
}
function lineAndColumnToOffset(lineMap : Array<number>, line: number, column: number) : number {
	return lineMap[line] + column;
}

/**
 * Including newline character at end of line if present
 */
function endPositionOfLine(source : string, lineMap : Array<number>, line : number){
	const nextLine = line + 1;
	if(nextLine>lineMap.length){
		return source.length;
	} else {
		return lineMap[nextLine];
	}
}

/**
 * Performs source mapping on generated statements to find all ranges in the original source that intersect with that
 * statement in the generated code.
 * @param generated Generated javascript source.
 * @param generatedStatements All statements found in the JS source that require translating to the original.
 * @param sourceMap Source map object.
 * @param sourceIndex Index of source within sourceMap's "source" property
 * @returns {{originalSource: Javascript, originalStatements: Array<StatementRange>}} Original source and corresponding
 *     "original statements"
 */
function generatedStatementsToSource(generated : Javascript, generatedStatements : Array<GeneratedStatementRange>, sourceMap: StandardizedSourceMap, sourceIndex : number){
	const originalSource : string = sourceMap.sourcesContent[sourceIndex];
	const sourceMapConsumer = new SourceMapper(new SourceMapConsumer(sourceMap));
	const sourceName : string = sourceMapConsumer.sourceName(sourceIndex);
	const generatedLines = lineMap(Javascript.unwrap(generated));
	const sourceLines = lineMap(originalSource);

	//First generate a list of every "section" in the generated file, which is a range that maps back to the source.
	type Section = {start:number, end:number, sourceStart: number, sourceEnd : number, sourceLine : number };
	const sections : Array<Section> = [];
	let lastLineSection : MappingItem|null = null;
	function nextMappingSection(nextMapping : MappingItem|null){
		//Only consider adding mappings for this source, but even mappings not in this source factor into sectioning off the generated javascript file
		if(lastLineSection != null && lastLineSection.source == sourceName){
			assert(()=> //Sections should be iterated in increasing line/column order
				nextMapping == null
				|| nextMapping.generatedLine > lastLineSection!!.generatedLine
				|| (nextMapping.generatedLine == lastLineSection!!.generatedLine
					&& nextMapping.generatedColumn > lastLineSection!!.generatedColumn)
			);

			let end;
			//Is the next mapping on the same line? If so, its start is the end for this section
			if(nextMapping != null && nextMapping.generatedLine == lastLineSection.generatedLine){
				end = lineAndColumnToOffset(generatedLines, nextMapping.generatedLine,nextMapping.generatedColumn)
			} else {
				//The next mapping is on another line, so implicitly this section ends at the end-of-line in the generated file
				end = endPositionOfLine(Javascript.unwrap(generated), generatedLines, lastLineSection.generatedLine);
			}
			sections.push({
				start: lineAndColumnToOffset(generatedLines, lastLineSection.generatedLine,lastLineSection.generatedColumn),
				end: end,
				sourceStart: lineAndColumnToOffset(sourceLines, lastLineSection.originalLine, lastLineSection.originalColumn),
				sourceEnd: -1, //Calculated soon
				sourceLine: lastLineSection.originalLine
			});
		}
		lastLineSection = nextMapping;
	}
	//Go over every mapping, implicitly in generated-source order
	sourceMapConsumer.eachMapping(nextMappingSection);
	//Make sure the absolute last section gets considered
	nextMappingSection(null);

	assert(()=>{ //Sections should be in increasing generated source order, not overlap, and have a start before their end
		let last = null;
		for(const section of sections){
			if(last != null && (section.start < last.end || section.start >= section.end)){ return false; }
			last = section;
		}
		return true;
	});

	//Determine where sections implicitly end in the original source
	//Multiple sections can point to the same point in the original source; sections are delineated as between unique places pointed to
	const sectionsBySourceStart : Array<Array<Section>> = values(groupBy(sections, (section)=>section.sourceStart))
		.sort((left,right)=> basicComparator(left[0].sourceStart, right[0].sourceStart));
	for(let i=0; i < sectionsBySourceStart.length; i++){
		const sectionsWithSameStart = sectionsBySourceStart[i];
		const exampleSection = sectionsWithSameStart[0];
		let end;
		//Is the next source section on the same line? If so, this one ends where it starts.
		if (i + 1 < sectionsBySourceStart.length && sectionsBySourceStart[i + 1][0].sourceLine == exampleSection.sourceLine) {
			end = sectionsBySourceStart[i+1][0].sourceStart;
		} else {
			end = endPositionOfLine(originalSource, sourceLines, exampleSection.sourceLine);
		}
		for(const section of sectionsWithSameStart){
			section.sourceEnd = end;
		}
	}

	assert(()=>{ //Sections should have source ends after source starts
		for(const section of sections){
			if(section.sourceEnd <= section.sourceStart){ return false; }
		}
		return true;
	});

	//Now take every generated statement and intersect it with the sections list
	const originalStatements : Array<StatementRange> = [];
	for (const generatedStatement of generatedStatements) {
		const originals = [];
		let sectionIndex = closestUnderOrEqualSearch(sections, generatedStatement.start, (section, start) => basicComparator(section.start, start));
		while(sectionIndex < sections.length
			&& sectionIndex>0
			&& sections[sectionIndex].end > generatedStatement.start){ //Section is at minimum behind statement
			const section = sections[sectionIndex];
			if(generatedStatement.end > section.start){ //Section truly intersects statement
				originals.push(new StatementRange({
					start: section.sourceStart,
					end: section.sourceEnd,
					statementId: generatedStatement.statementId
				}));
			}
			sectionIndex += 1;
		}
		const simplified = intersectStatements(originals);
		for(const statement of simplified){
			originalStatements.push(new StatementRange({
				start: statement.start,
				end: statement.end,
				statementId: generatedStatement.statementId
			}));
		}
	}

	//Done! Phew.
	return {
		originalSource: Javascript.wrap(originalSource),
		originalRanges: originalStatements
	}
}

/**
 * Given a Javascript source, escapes it into HTML and adds <span> tags with extra information denoting which lines
 * sections correspond to. This will generate <span statements_in="[1,2,3..]">js_statement();</span>
 * @param js Actual generated javascript executed by clients.
 * @param sourceMap SourceMap if available.
 * @param sourceIndex Source in sourcemap to annotate. The returned HTML will be the original source code but the statements will
 *     correspond to the generated source.
 */
export function trackStatements(js : Javascript, sourceMap : StandardizedSourceMap|null, sourceIndex : number|null){
	//Generate a list of all statements within the generated source
	const visitor = new StatementTrackingVisitor();
	visit(visitor, js);
	//If we're using a source map, we actually need statements from the original source.
	let source : Javascript;
	let originalStatementRanges : Array<StatementRange>;
	let generatedStatementRanges : Array<StatementRange>;
	if (!sourceMap || sourceIndex == null) {
		source = js;
		originalStatementRanges = generatedStatementRanges = visitor.statementRanges;
	} else {
		const {originalRanges, originalSource} = generatedStatementsToSource(js, visitor.statementRanges.map((s)=>new GeneratedStatementRange(s)), sourceMap, sourceIndex);
		originalStatementRanges = originalRanges;
		generatedStatementRanges = visitor.statementRanges;
		source = originalSource;
	}
	//Sort the statements by order of start.
	stable.inplace(originalStatementRanges, (a : StatementRange, b : StatementRange)=> a.start < b.start);
	//Intersect the statements, producing nonoverlapping ranges that have 1 to many statements in them
	const totalRange = intersectStatements(originalStatementRanges);
	//Create the transform operations to mark up the javascript source
	const {operations, spanIds} = spanOperationsFrom(totalRange);
	//Mark up the source
	const html : Html = Html.wrap(output(source, operations, escapeHtml));
	return {
		html,
		spanIds,
		originalStatementRanges,
		source,
		generatedStatementRanges
	};
}