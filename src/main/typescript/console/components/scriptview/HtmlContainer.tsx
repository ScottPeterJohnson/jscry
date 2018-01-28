import * as React from "react";
import * as ReactDOM from "react-dom";
import {EmptyProps, EmptyState, isEqual} from "../../utility/ConsoleUtility";
import {Html} from "../../../utility/Utility";
import {computed, observable} from "mobx";
import {observer} from "mobx-react/custom";


type MountPointAdder = (mountPoint:HTMLDivElement)=>void;
export type ReactElementAdder = (element : JSX.Element, mountPointAdder:MountPointAdder)=>void;

interface HtmlContainerProps {
	html : Html,
	transforms: Array<(container : HTMLDivElement, reactAdder: ReactElementAdder)=>void>
}

export class HtmlContainer extends React.Component<HtmlContainerProps,EmptyState>{

	div : HTMLElement;
	render(){
		return <div ref={(div)=>this.div=div!}/>;
	}

	componentDidMount(){
		this.addDom();
	}
	shouldComponentUpdate(newProps : HtmlContainerProps){
		return newProps.html != this.props.html;
	}
	componentDidUpdate(oldProps : HtmlContainerProps){
		this.addDom();
	}

	componentWillUnmount(){
		this.cleanMountPoints();
	}

	addDom(){
		const dom = this.generateDom();
		while(this.div.firstChild){
			this.div.removeChild(this.div.firstChild);
		}
		this.div.appendChild(dom);
	}

	generateDom(){
		this.cleanMountPoints();

		const dom = document.createElement("div");
		dom.innerHTML = Html.unwrap(this.props.html);

		const elementAdder = (element : JSX.Element, mountPointAdder:MountPointAdder)=>{
			const mountPoint = document.createElement("div");
			mountPoint.style.display="inline";
			mountPointAdder(mountPoint);
			ReactDOM.render(element, mountPoint);
			this.mountPoints.push(mountPoint);
		};
		for(const transform of this.props.transforms){
			transform(dom, elementAdder);
		}
		return dom;
	}

	mountPoints : Array<HTMLElement> = [];
	cleanMountPoints(){
		for(const oldMountPoint of this.mountPoints){
			ReactDOM.unmountComponentAtNode(oldMountPoint);
		}
		this.mountPoints = [];
	}
}