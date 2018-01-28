
import {Statement, Node} from "estree";
import {JsVisitor, Insert, Delete, Javascript, output, visit, NodeStack} from "../transform/Transform";
import {
	jScryLog, executionArrayName, statementIdArrayName, jScry, jScryScripts,
	jscryExecuteAddedCodeFunction
} from "./Exposed";
import {binarySearch, closestUnderOrEqualSearch} from "../utility/Utility";
import {ScriptConfigurationMessage, CodeInsert} from "endpoints";

export function statementLoggable(statement : Statement, stack : NodeStack) : boolean {
	switch(statement.type){
		case "ExpressionStatement":
			//If we insert anything before "use strict", it ceases to have magical meaning
			const isUseStrict = statement.expression.type == "Literal" && statement.expression.value === "use strict";
			return !isUseStrict;
		case "BlockStatement": //A block ({}) cannot be conventionally breakpointed
		case "DebuggerStatement": //Literally "debugger;" (used a few times in WebEmbedding.ts). Nothing runs.
		case "LabeledStatement": //More of a modifier to a statement than a statement proper.
		case "FunctionDeclaration": //Function declarations don't really have a choice in running, plus they are hoisted.
			//Consider what happens if you define a function within a function after that function returns (it works fine!)
			//If we add any instrumentation, we'd get lots of unreachable code warnings though.
			return false;
		default:
			const parent = stack.peek();
			if(parent.type === "ForStatement" && parent.init == statement){ return false; }
			else if((parent.type === "ForInStatement" || parent.type === "ForOfStatement") && parent.left == statement){ return false; }
			return true;
	}
}

export function needsBlock(statement : Node, stack : NodeStack){
	const parent = stack.peek();
	switch(parent.type){
		case "WithStatement":
		case "IfStatement":
		case "TryStatement":
		case "WhileStatement":
		case "DoWhileStatement":
		case "ForStatement":
		case "ForInStatement":
		case "ForOfStatement":
			return true;
	}
	return false;
}

/**
 * Adds execution logging to statements, and collects its changes for application
 */
class WebVisitor implements JsVisitor {
	constructor(public scriptExecutionConfig : ScriptConfigurationMessage){}
	private changes : Array<Insert|Delete> = [];
	private logStarts : Array<number> = [];

	protected generateLogCall(start : number) : string {
		this.logStarts.push(start);
		const index = this.logStarts.length - 1;
		return `${executionArrayName(this.scriptExecutionConfig.scriptId)}[${index}]++;`;
	}

	protected generateAddCode(codeInsert : CodeInsert) : string {
		return `${jscryExecuteAddedCodeFunction}(this, ${codeInsert.scriptCommandId}, function(){${codeInsert.code}});`;
	}

	protected shouldLog(statement : Statement) : boolean {
		const startChar = statement.start;
		const includedAlwaysIndex = binarySearch(this.scriptExecutionConfig.includedStatements, startChar);
		if(includedAlwaysIndex != -1){ return true; }
		const rangeExcludedIndex = closestUnderOrEqualSearch(this.scriptExecutionConfig.excludedRangeStarts, startChar);
		if(this.scriptExecutionConfig.excludedRangeEnds[rangeExcludedIndex] < startChar){
			return false;
		}
		const explicitlyExcludedIndex = binarySearch(this.scriptExecutionConfig.excludedStatements, startChar);
		return explicitlyExcludedIndex == -1;
	}

	annotateAtNode(insertedText : string, statement : Node, stack : NodeStack){
		if(stack.peek().type === "LabeledStatement") {
			this.annotateAtNode(insertedText, stack.peek(), stack.parentView());
		}
		else if(needsBlock(statement, stack)) {
			//Wrap it in a block (shame on them, though)
			this.changes.push(
				{
					start: statement.start,
					text: '{' + insertedText
				},
				{
					start: statement.end,
					text: '}'
				}
			);
		} else {
			//The happy path
			this.changes.push({
				start: statement.start,
				text: insertedText
			});
		}
	}
	handleStatement(statement: Statement, stack : NodeStack){
		let add : string = "";
		const inserts = this.scriptExecutionConfig.codeInserts[statement.start];
		if(inserts){
			for(const insert of inserts){
				add += this.generateAddCode(insert);
			}
		}
		if(statementLoggable(statement, stack)){
			if(this.shouldLog(statement)){
				add += this.generateLogCall(statement.start);
			}
		}
		if(add !== ""){
			this.annotateAtNode(add, statement, stack);
		}
	}
	handleAssignment(node : Node) {}

	getChanges() : Array<Insert|Delete> {
		let logArray = `const ${executionArrayName(this.scriptExecutionConfig.scriptId)} = new Int16Array(new ArrayBuffer(2 * ${this.logStarts.length}));\n`;
		logArray += `const ${statementIdArrayName(this.scriptExecutionConfig.scriptId)} = ${JSON.stringify(this.logStarts)};\n`;
		logArray += `window.${jScryScripts}.push({scriptId:${this.scriptExecutionConfig.scriptId}, executions:${executionArrayName(this.scriptExecutionConfig.scriptId)},statementIds:${statementIdArrayName(this.scriptExecutionConfig.scriptId)}});\n`;
		const insert : (Insert|Delete)[] = [{start:0, text: logArray}];
		return insert.concat(this.changes);
	}
}



export function transform(config : ScriptConfigurationMessage, source: Javascript): Javascript {
	return Javascript.wrap(output(source, getTransformations(config, source)));
}
export function getTransformations(config : ScriptConfigurationMessage, source : Javascript) : Array<Insert|Delete> {
	const visitor = new WebVisitor(config);
	visit(visitor, source);
	return visitor.getChanges();
}