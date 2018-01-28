import {parse} from "acorn";
import {Statement, Expression, Node, Pattern, Super, Program} from "estree";
import IParse = acorn.IParse;
import stable from "stable";

declare module "estree" {
	interface BaseNode {
		start: number,
		end: number
	}
}

export class Javascript extends String {
	private unique(){}
	private constructor(){super()}
	static wrap(obj : string){ return obj as any as Javascript; }
	static unwrap(wrapped : Javascript){ return wrapped as any as string; }
}

export interface Insert {
	start : number;
	text : string;
}

export interface Delete {
	start : number;
	endBefore : number;
}

export function isInsert(op : Insert | Delete) : op is Insert {
	return (op as Insert).text !== undefined;
}

export interface JsVisitor {
	handleStatement(statement : Statement, stack : NodeStack) : void;
	handleAssignment(node : Node) : void;
}


export class NodeStack {
	private stack : Array<Node>;
	private end : number = -1;
	constructor(stack : Array<Node>|null = null, end : number = -1){
		this.stack = stack||[];
		this.end = end;
	}
	push(node : Node){
		this.stack.push(node);
		this.end += 1;
	}
	pop(){ this.stack.pop(); }
	peek() : Node { return this.stack[Math.min(this.stack.length-1, this.end)]; }
	parentView() : NodeStack {
		return new NodeStack(this.stack, Math.min(this.stack.length-1, this.end) - 1);
	}
}

/**
 * Applies change operations to an original source.
 * @param originalSource
 * @param changes
 * @param originalTransform Optional function to apply to all original source text added.
 * @returns {string} Transformed source.
 */
export function output(originalSource : Javascript, changes : Array<Insert|Delete>, originalTransform?: (str: string)=>string) : string {
	sortChanges(changes);
	const out : Array<string> = [];
	let originalPos = 0;
	const addOriginal = (upTo : number)=>{
		const text = originalSource.substring(originalPos, upTo);
		if(originalTransform){
			out.push(originalTransform(text));
		} else {
			out.push(text);
		}
		originalPos = upTo;
	};
	for(const op of changes){
		addOriginal(op.start);
		if(isInsert(op)){
			out.push(op.text);
		} else {
			originalPos = op.endBefore;
		}
	}
	addOriginal(originalSource.length);
	return out.join("");
}

export function sortChanges(changes : Array<Insert|Delete>){
	stable.inplace(changes, (left : Insert|Delete, right : Insert|Delete)=>left.start - right.start);
}



/**
 * Walks a javascript source on a visitor
 */
class Annotator {
	constructor(public visitor : JsVisitor) {}

	run(source : Javascript){
		const ast = parse(Javascript.unwrap(source), {});
		this.walkAst(ast);
	}

	private stack : NodeStack = new NodeStack();

	protected handleAssignment(node: Node) {
		this.visitor.handleAssignment(node);
	}


	protected handleStatement(statement : Statement){
		this.visitor.handleStatement(statement, this.stack);
	}

	protected walkPatterns(patterns: Array<Pattern>) {
		for (const pattern of patterns) {
			this.walkPattern(pattern);
		}
	}

	protected walkPattern(pattern: Pattern) {
		this.stack.push(pattern);
		switch (pattern.type) {
			case "Identifier":
				break;
			case "ObjectPattern":
				for (const prop of pattern.properties) {
					this.walkPattern(prop.value)
				}
				break;
			case "ArrayPattern":
				this.walkPatterns(pattern.elements);
				break;
			case "RestElement":
				this.walkPattern(pattern.argument);
				break;
			case "AssignmentPattern":
				this.handleAssignment(pattern);
				this.walkPattern(pattern.left);
				this.walkExpression(pattern.right);
				break;
			case "MemberExpression":
				this.walkExpressionOrSuper(pattern.object);
				this.walkExpression(pattern.property);
				break;
		}
		this.stack.pop();
	}

	protected walkExpressionOrSuper(expression: Expression | Super) {
		if (expression.type !== "Super") {
			this.walkExpression(expression);
		}
	}

	protected walkExpressions(expressions: Array<Expression>) {
		for (const expression of expressions) {
			this.walkExpression(expression);
		}
	}

	protected walkExpression(expression: Expression) {
		this.stack.push(expression);
		switch (expression.type) {
			case "ThisExpression":
				break;
			case "ArrayExpression":
				for (const el of expression.elements) {
					if(el) { //Apparently these can be "null"?
						switch (el.type) {
							case "SpreadElement":
								this.walkExpression(el.argument);
								break;
							default:
								this.walkExpression(el);
								break;
						}
					}
				}
				break;
			case "ObjectExpression":
				for (const property of expression.properties) {
					switch (property.value.type) {
						case "AssignmentPattern":
						case "Identifier":
						case "ObjectPattern":
						case "ArrayPattern":
						case "RestElement":
						case "MemberExpression":
							this.walkPattern(property.value);
							break;
						default:
							this.walkExpression(property.value);
							break;
					}
				}
				break;
			case "FunctionExpression":
				this.walkPatterns(expression.params);
				this.walkStatement(expression.body);
				break;
			case "ArrowFunctionExpression":
				this.walkPatterns(expression.params);
				switch (expression.body.type) {
					case "BlockStatement":
						this.walkStatement(expression.body);
						break;
					default:
						this.walkExpression(expression.body);
						break;
				}
				break;
			case "YieldExpression":
				expression.argument && this.walkExpression(expression.argument);
				break;
			case "Literal":
				break;
			case "UnaryExpression":
				this.walkExpression(expression.argument);
				break;
			case "UpdateExpression": // foo++
				this.walkExpression(expression.argument);
				break;
			case "BinaryExpression":
				this.walkExpression(expression.left);
				this.walkExpression(expression.right);
				break;
			case "AssignmentExpression":
				this.handleAssignment(expression);
				if (expression.left.type === "MemberExpression") {
					this.walkExpressionOrSuper(expression.left.object);
					this.walkExpression(expression.left.property);
				} else {
					this.walkPattern(expression.left);
				}
				this.walkExpression(expression.right);
				break;
			case "LogicalExpression":
				this.walkExpression(expression.left);
				this.walkExpression(expression.right);
				break;
			case "MemberExpression":
				this.walkExpressionOrSuper(expression.object);
				this.walkExpression(expression.property);
				break;
			case "ConditionalExpression":
				this.walkExpression(expression.test);
				this.walkExpression(expression.consequent);
				this.walkExpression(expression.alternate);
				break;
			case "CallExpression":
				this.walkExpressionOrSuper(expression.callee);
				for(const argument of expression.arguments){
					if(argument.type === "SpreadElement"){
						this.walkExpression(argument.argument);
					} else {
						this.walkExpression(argument);
					}
				}
				break;
			case "NewExpression":
				break;
			case "SequenceExpression": //Comma-separated list of expressions (because javascript)
				this.walkExpressions(expression.expressions);
				break;
			case "TemplateLiteral":
				this.walkExpressions(expression.expressions);
				break;
			case "TaggedTemplateExpression":
				this.walkExpression(expression.tag);
				this.walkExpression(expression.quasi);
				break;
			case "ClassExpression":
				expression.superClass && this.walkExpression(expression.superClass);
				for (const method of expression.body.body) {
					this.walkExpression(method.key);
					this.walkExpression(method.value);
				}
				break;
			case "MetaProperty":
				break;
			case "Identifier":
				break;
			case "AwaitExpression":
				this.walkExpression(expression.argument);
				break;
		}
		this.stack.pop();
	}

	protected walkStatements(statements: Array<Statement>) {
		for (const statement of statements) {
			this.walkStatement(statement);
		}
	}

	protected walkStatement(statement: Statement) {
		this.handleStatement(statement);
		this.stack.push(statement);
		switch (statement.type) {
			case "ExpressionStatement":
				this.walkExpression(statement.expression);
				break;
			case "BlockStatement":
				this.walkStatements(statement.body);
				break;
			case "EmptyStatement":
				break;
			case "DebuggerStatement":
				break;
			case "WithStatement":
				this.walkExpression(statement.object);
				this.walkStatement(statement.body);
				break;
			case "ReturnStatement":
				statement.argument && this.walkExpression(statement.argument);
				break;
			case "LabeledStatement":
				this.walkStatement(statement.body);
				break;
			case "BreakStatement":
				break;
			case "ContinueStatement":
				break;
			case "IfStatement":
				this.walkExpression(statement.test);
				this.walkStatement(statement.consequent);
				statement.alternate && this.walkStatement(statement.alternate);
				break;
			case "SwitchStatement":
				this.walkExpression(statement.discriminant);
				for (const theCase of statement.cases) {
					this.walkStatements(theCase.consequent);
				}
				break;
			case "ThrowStatement":
				this.walkExpression(statement.argument);
				break;
			case "TryStatement":
				this.walkStatement(statement.block);
				if (statement.handler) {
					this.walkPattern(statement.handler.param);
					this.walkStatement(statement.handler.body);
				}
				statement.finalizer && this.walkStatement(statement.finalizer);
				break;
			case "WhileStatement":
				this.walkExpression(statement.test);
				this.walkStatement(statement.body);
				break;
			case "DoWhileStatement":
				this.walkStatement(statement.body);
				this.walkExpression(statement.test);
				break;
			case "ForStatement":
				if (statement.init) {
					if (statement.init.type === "VariableDeclaration") {
						this.walkStatement(statement.init);
					} else {
						this.walkExpression(statement.init);
					}
				}
				statement.test && this.walkExpression(statement.test);
				statement.update && this.walkExpression(statement.update);
				this.walkStatement(statement.body);
				break;
			case "ForInStatement":
			case "ForOfStatement":
				if (statement.left.type === "VariableDeclaration") {
					this.walkStatement(statement.left)
				} else {
					//An "AssignmentExpression" -> Pattern
					this.walkPattern(statement.left);
				}
				this.walkExpression(statement.right);
				this.walkStatement(statement.body);
				break;
			//Declarations
			case "FunctionDeclaration":
				this.walkPatterns(statement.params);
				this.walkStatement(statement.body);
				break;
			case "VariableDeclaration":
				for (const decl of statement.declarations) {
					this.walkPattern(decl.id);
					decl.init && this.walkExpression(decl.init);
				}
				break;
			case "ClassDeclaration":
				statement.superClass && this.walkExpression(statement.superClass);
				for (const method of statement.body.body) {
					this.walkExpression(method.key);
					this.walkExpression(method.value);
				}
				break;
		}
		this.stack.pop();
	}

	walkAst(program: Program) {
		for (const topLevel of program.body) {
			switch (topLevel.type) {
				case "ImportDeclaration":
				case "ExportNamedDeclaration":
				case "ExportDefaultDeclaration":
				case "ExportAllDeclaration":
					break;
				default:
					this.stack.push(topLevel);
					this.walkStatement(topLevel);
					this.stack.pop();
					break;
			}
		}
	}
}

export function visit(visitor : JsVisitor, source : Javascript) : void {
	const annotator = new Annotator(visitor);
	annotator.run(source)
}

export function visitAst(visitor : JsVisitor, ast : Program) : void {
	const annotator = new Annotator(visitor);
	annotator.walkAst(ast)
}

