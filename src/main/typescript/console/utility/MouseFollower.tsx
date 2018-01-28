import * as React from "react"
import * as ReactDOM from "react-dom"
import {EmptyProps, EmptyState} from "./ConsoleUtility";
import * as Grom from "../Grom";
import {autobind} from "core-decorators";

interface MouseFollowerProps {
	container : HTMLElement,
	child: (parent : HTMLElement, target: HTMLElement) => JSX.Element|null,
	onClick: (parent: HTMLElement, target: HTMLElement) => void
}

interface MouseFollowerState {
	pageX : number
	pageY : number
	offsetX: number
	offsetY: number,
	target: HTMLElement|null
	hidden : boolean
}

@autobind
export class MouseFollower extends React.Component<MouseFollowerProps, MouseFollowerState> {
	state = { pageX: 0, pageY: 0, offsetX: 0, offsetY: 0, hidden: true, target: null };
	div : HTMLDivElement|null = null;

	render(): JSX.Element|any {
		let child;
		if(!this.state.hidden && this.state.target != null){ child = this.props.child(this.props.container, this.state.target!!); }
		return <div
			style={{ position: "fixed", top: `${this.state.pageY+10}px`, left: `${this.state.pageX+10}px` }}
			hidden={child == null}
			ref={(div)=>{this.div = div;}}
		>{child}</div>;
	}
	onMouseOut(){
		this.setState({hidden:true});
	}
	onMouseMove(event : MouseEvent){
		this.setState({
			pageX: event.pageX,
			pageY: event.pageY,
			offsetX: event.offsetX,
			offsetY: event.offsetY,
			target: event.target as HTMLElement,
			hidden: false
		})
	}

	onMouseClick(event : MouseEvent){
		this.props.onClick(this.props.container, event.target as HTMLElement);
	}

	componentWillUnmount(){
		if(this.div != null){
			const parent = this.props.container;
			parent.removeEventListener("mouseout", this.onMouseOut);
			parent.removeEventListener("mousemove", this.onMouseMove);
			parent.removeEventListener("click", this.onMouseClick);
		}
	}
	componentDidMount(){
		if(this.div != null){
			const parent = this.props.container;
			parent.addEventListener("mouseout", this.onMouseOut);
			parent.addEventListener("mousemove", this.onMouseMove);
			parent.addEventListener("click", this.onMouseClick);
		}
	}
}