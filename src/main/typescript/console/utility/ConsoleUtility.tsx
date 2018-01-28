import {ConsoleConfig} from "endpoints";
import * as React from "react"
import * as ReactDOM from "react-dom"
import {InjectedRouter} from "react-router";
import Route from "react-router/lib/Route";
import * as _ from "lodash";
import useRouterHistory from "react-router/lib/useRouterHistory";
import createHashHistory from "history/lib/createHashHistory";
import * as Grom from "../Grom";
import {autobind} from "core-decorators";
import {isObservable, observable, toJS} from "mobx";
import {jsonQueryParseObjectBare, jsonQueryStringifyObjectBare} from "json-query-string";
import {observer} from "mobx-react/custom";
import {basicComparator, Observable} from "../../utility/Utility";
import stable from "stable";
import {parse} from "acorn";
import {ChangeEvent} from "react";
import * as PropTypes from "prop-types";
//const stringifyQuery = (query : any) => stringify(query, {arrayFormat: 'brackets', encode: false, strictNullHandling: true});
//const parseQueryString = (str : string) => parse(str, {strictNullHandling: true});
export const routerHistory = useRouterHistory(createHashHistory)({ parseQueryString: jsonQueryParseObjectBare, stringifyQuery: jsonQueryStringifyObjectBare});

export interface EmptyState {}
export interface EmptyProps {}
export interface EmptyLocationProps {
	location: {query: {}}
}

export const consoleConfig : ConsoleConfig = (window as any).consoleConfig;

export interface DocumentTitleProps {
	title : string
}

export class ConsoleDocumentTitle extends React.Component<DocumentTitleProps, EmptyState> {
	render(){
		return <DocumentTitle title={this.props.title + " | jScry Console"}>{this.props.children}</DocumentTitle>
	}
}

export class FrontPageDocumentTitle extends React.Component<DocumentTitleProps, EmptyState> {
	render(){
		return <DocumentTitle title={this.props.title + " | jScry"}>{this.props.children}</DocumentTitle>
	}
}

export class DocumentTitle extends React.Component<DocumentTitleProps, EmptyState> {
	render(){
		if(this.props.children){
			return React.Children.only(this.props.children);
		} else {
			return null;
		}
	}
	componentDidUpdate(){
		document.title = this.props.title;
	}
	componentDidMount(){
		document.title = this.props.title;
	}
}

export class TypedRoute<Query, Props extends {location:{query:Query}}> {
	constructor(public path : string, private component : new(props : Props, context?: any) => React.Component<Props,any>){}
	go(router : InjectedRouter, query: Query){
		router.push({
			pathname: this.path,
			query: query
		});
	}
	route(){
		return <Route path={this.path} component = {this.component} />
	}
	makePath(query : Query) : string {
		return routerHistory.createPath({
			pathname: this.path,
				query: query
		});
	}
}


export class SingleCallMemoizer {
	private cache = new Map<Function, {args: Array<any>|null, result: any, f : Function}>();
	on<T extends Function>(func : T):T{
		let cached = this.cache.get(func);
		if (!cached) {
			cached = {
				args: null, result: null, f: function(this:any){
					const oldArgs = cached!!.args;
					if(oldArgs != null && oldArgs.length === arguments.length) {
						let allEqual = true;
						for (let i=0;i<arguments.length;i++) {
							if(!isEqual(arguments[i], oldArgs[i])){ allEqual = false; break; }
						}
						if(allEqual){
							return cached!!.result;
						}
					}
					cached!!.args = Array.prototype.slice.apply(arguments);
					cached!!.result = func.apply(this, cached!!.args);
					return cached!!.result
				}
			};
			this.cache.set(func, cached);
		}
		return cached.f as T;
	}
}

@autobind
export class GoBack extends React.Component<EmptyProps,EmptyState> {
	render(){
		return <Grom.Anchor onClick={this.goBack}>Go back.</Grom.Anchor>
	}
	goBack(){
		this.context.router.goBack()
	}
	static contextTypes = {
		router: PropTypes.object.isRequired
	}
}


interface GridTableProps<T> {
	itemKey : (_:T)=>string|number
	columns : {
		label:string,
		value : (_:T)=>any,
		sorter?: (a:T, b:T)=>number
	}[],
	items: T[]
	onItemClick: (_:T)=>void
	initialSort? : number
	initialSortAscending? : boolean
}

@autobind
@observer
export class GridTable<T> extends React.Component<GridTableProps<T>, EmptyState> {
	@observable sortAscending : boolean = this.props.initialSortAscending !== undefined ? this.props.initialSortAscending : true;
	@observable sortIndex : number = this.props.initialSort || 0;

	render(){
		const sorted = this.props.items.slice();
		const valueExtract = this.props.columns[this.sortIndex].value;
		const comparator = this.props.columns[this.sortIndex].sorter || ((leftItem:T, rightItem:T)=>basicComparator(valueExtract(leftItem), valueExtract(rightItem)));
		if(this.sortAscending) { stable.inplace(sorted, comparator); }
		else { stable.inplace(sorted, (left, right)=> -1 * comparator(left, right)); }
		return <Grom.Table selectable={true}>
			<Grom.TableHeader
				labels={this.props.columns.map((column)=>column.label)}
				sortAscending={this.sortAscending}
				sortIndex={this.sortIndex}
				onSort={this.onSort}
			/>
			<tbody>
			{sorted.map((item)=>
				<Grom.TableRow key={this.props.itemKey(item)} onClick={ ()=>this.props.onItemClick(item) }>
					{this.props.columns.map((column, idx)=><td key={idx}>{column.value(item)}</td>)}
				</Grom.TableRow>
			)}
			</tbody>
		</Grom.Table>;
	}
	onSort(index : number){
		if(index != this.sortIndex) {
			this.sortIndex = index;
			this.sortAscending = true;
		} else {
			this.sortAscending = !this.sortAscending;
		}
	}
}

export abstract class ObservableComponent<Props,State> extends React.Component<Props,State> {
	componentWillMountEvent = new Observable<null>();
	componentWillMount(): void {this.componentWillMountEvent.fire(null); };
	componentDidMountEvent = new Observable<null>();
	componentDidMount(): void {this.componentDidMountEvent.fire(null);};
	componentWillReceivePropsEvent = new Observable<{nextProps:Readonly<Props>, nextContext:any}>();
	componentWillReceiveProps(nextProps: Readonly<Props>, nextContext: any): void {this.componentWillReceivePropsEvent.fire({nextProps, nextContext});};
	componentWillUpdateEvent = new Observable<{nextProps:Readonly<Props>,nextState:Readonly<State>,nextContext:any}>();
	componentWillUpdate(nextProps: Readonly<Props>, nextState: Readonly<State>, nextContext: any): void { this.componentWillUpdateEvent.fire({nextProps, nextState, nextContext})};
	componentDidUpdateEvent = new Observable<{prevProps:Readonly<Props>,prevState:Readonly<State>,prevContext:any}>();
	componentDidUpdate(prevProps: Readonly<Props>, prevState: Readonly<State>, prevContext: any): void { this.componentDidUpdateEvent.fire({prevProps, prevState, prevContext})};
	componentWillUnmountEvent = new Observable<null>();
	componentWillUnmount(): void {this.componentWillUnmountEvent.fire(null)};
}

export function isEqual<T>(left : T, right : T){
	if(isObservable(left)){
		left = toJS(left)
	}
	if(isObservable(right)){
		right = toJS(right);
	}
	return _.isEqual(left, right);

}

export function deepClone<T>(obj : T){
	if(isObservable(obj)){
		obj = toJS(obj);
	}
	return _.cloneDeep(obj);
}

interface LabeledProps {
	label : string
}
export class Labeled extends React.Component<LabeledProps, EmptyState> {
	render(){
		return <Grom.Box direction="row" align="center">
			<Grom.Label><b>{this.props.label}</b></Grom.Label>
			<Grom.Box flex>{this.props.children}</Grom.Box>
		</Grom.Box>
	}
}

export function numberFormat(num : number, toPrecision : number) : number {
	return parseFloat(Math.round(num).toPrecision(toPrecision));
}



export interface PageWithSection {
	section?: string
}
export type PageSection = (section: {heading : string, sectionName : string, children?: any})=>JSX.Element
export class AnchorSections<Query extends PageWithSection> extends React.Component<{
	query : Query,
	route: TypedRoute<Query,any>,
	scrollOffset?: number,
	withSections : (pageSection : PageSection)=>JSX.Element
}, EmptyState> {
	componentDidMount(){
		if(this.props.query.section){
			document.querySelector(`[id=section_${this.props.query.section}]`)!.scrollIntoView();
			this.props.scrollOffset && window.scroll(0, window.scrollY + this.props.scrollOffset);
		}
	}
	componentDidUpdate(){
		this.componentDidMount();
	}
	render(){
		return this.props.withSections((section: { heading: string, sectionName: string, children?: any })=>{
			const newQuery = deepClone(this.props.query);
			newQuery.section = section.sectionName;
			const sectionPath = this.props.route.makePath(newQuery);
			return <Grom.Section>
				<Grom.Anchor path={sectionPath}><Grom.Heading><span
					id={"section_" + section.sectionName}/>{section.heading}</Grom.Heading></Grom.Anchor>
				<Grom.Paragraph>
					{section.children}
				</Grom.Paragraph>
			</Grom.Section>
		});
	}
}

export interface IRouterContext {
	router : InjectedRouter
}



export function validJsExpression(expression: string | null): string | null {
	if (!expression) {
		return null;
	}
	try {
		const parsed = parse(expression);
		if (!parsed.body.length) {
			return "No expression provided"
		}
		if (parsed.body.length > 1) {
			return "Not a single expression (use an IIFE if necessary)";
		}
		const type = parsed.body[0].type;
		if (type !== "ExpressionStatement") {
			return `Found ${type}, not expression`;
		}
		return null;
	}
	catch (e) {
		return "Could not parse";
	}
}

export interface CodeInputProps {
	label : string
	value : string
	onChange: (code : string) => void
	placeholder? : string
	help? : string
}

@autobind
export class CodeInput extends React.Component<CodeInputProps, EmptyState> {
	render() {
		return <Grom.FormField
			label={this.props.label} error={this.validCodeToAdd()} help={this.props.help}
		>
			<textarea
				value={this.props.value} onChange={this.changeCodeToAdd} placeholder={this.props.placeholder}
			/> </Grom.FormField>;
	}

	validCodeToAdd() {
		return validJsExpression(this.props.value)
	}

	changeCodeToAdd(ev: ChangeEvent<HTMLTextAreaElement>) {
		this.props.onChange(ev.target.value);
	}
}