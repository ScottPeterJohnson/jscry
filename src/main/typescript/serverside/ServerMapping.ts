/*
 * This file is run under Nashorn on the server backend. It uses functionality shared with the web embedding to transform files,
 * in order to get file positions and generate source maps.
 */

import {getTransformations, transform} from "../webembed/WebVisitor";
import {Delete, Insert, Javascript, visit, visitAst} from "../transform/Transform";
import {parse} from "acorn";
import {BaseNode} from "estree";
import {isArrayLike} from "mobx";
import {StatementTrackingVisitor} from "../console/components/scriptview/StatementTrackingVisitor";

declare const global : any;
global.getTransformations = function(source : Javascript, configJson : string) : String {
	const config = JSON.parse(configJson);
	return JSON.stringify(getTransformations(config, source));
};

global.applyTransformations = function(source : Javascript, configJson : string) : Javascript {
	const config = JSON.parse(configJson);
	return transform(config, source)
};

interface JsAstNode {
	type : string
	start : number
	end : number
	children: JsAstNode[],
	name? : string,
	raw? : string
}

function isNode(value : any) : value is BaseNode {
	return value && typeof value === "object" && "type" in value && "start" in value && "end" in value
}

//TODO: Javascript properties are inconsistently ordered. Does the AST need to be ordered?
function directChildAstNodes(obj : any) : JsAstNode[] {
	if (obj && typeof obj === "object") {
		const children : JsAstNode[] = [];
		for(const property in obj){
			if(obj.hasOwnProperty(property)){
				const prop = obj[property];
				if(isNode(prop)){
					children.push(toAstNode(prop));
				} else {
					for(const child of directChildAstNodes(prop)){
						children.push(child);
					}
				}
			}
		}
		return children;
	} else {
		return []
	}
}
function toAstNode(node : BaseNode) : JsAstNode {
	return {
		type: (node as any).type,
		start : node.start,
		end: node.end,
		children: directChildAstNodes(node),
		raw: (node as any).raw,
		name: (node as any).name
	};
}



global.parseJavaScript = function(source : Javascript) : String {
	const rootNode = parse(Javascript.unwrap(source), {});
	const ast = toAstNode(rootNode);
	return JSON.stringify(ast);
};

global.getExecutableSites = function(source : Javascript) : String {
	const rootNode = parse(Javascript.unwrap(source), {});
	const ast = toAstNode(rootNode);
	const visitor = new StatementTrackingVisitor();
	visitAst(visitor, rootNode);
	const statements = visitor.statementRanges;
	return JSON.stringify({ast: ast, sites: statements.map((statement)=>statement.statementId)});
};