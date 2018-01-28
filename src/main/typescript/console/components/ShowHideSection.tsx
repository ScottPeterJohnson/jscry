import * as Grom from "../Grom";
import {observable} from "mobx";
import {observer} from "mobx-react";
import * as React from "react";
import {autobind} from "core-decorators";
import {EmptyState} from "../utility/ConsoleUtility";


export class ShowHide {
	@observable show : boolean = false;
}

export interface ShowHideButtonProps {
	section : ShowHide
	show? : string
	hide? : string
}

@autobind
@observer
export class ShowHideButton extends React.Component<ShowHideButtonProps, EmptyState> {
	render(){
		if(this.props.section.show){
			return <Grom.Button label={this.props.hide || "Hide"} onClick={this.toggleShowHide}/>;
		} else {
			return <Grom.Button label={this.props.show || "Show"} onClick={this.toggleShowHide}/>;
		}
	}
	toggleShowHide(){
		this.props.section.show = !this.props.section.show;
	}
}

@autobind
@observer
export class ShowHideLink extends React.Component<ShowHideButtonProps, EmptyState> {
	render(){
		if(this.props.section.show){
			return <Grom.Anchor label={this.props.hide || "Hide"} onClick={this.toggleShowHide}/>;
		} else {
			return <Grom.Anchor label={this.props.show || "Show"} onClick={this.toggleShowHide}/>;
		}
	}
	toggleShowHide(){
		this.props.section.show = !this.props.section.show;
	}
}

export interface ShowHideSectionProps {
	section : ShowHide,
	border?: boolean
}

@autobind
@observer
export class ShowHideSection extends React.Component<ShowHideSectionProps, EmptyState> {
	render(){
		return <div
			style={{
				border: this.props.border ? "1px solid grey" : "",
				display:this.props.section.show ? "" : "none"
			}}>{this.props.children}</div>
	}
}

interface ShowHideSectionWithButtonProps {
	name : string
	section : ShowHide
}
@autobind
@observer
export class ShowHideSectionWithButton extends React.Component<ShowHideSectionWithButtonProps, EmptyState> {
	render(){
		return <div>
			<ShowHideButton section={this.props.section} show={"Show " + this.props.name} hide={"Hide " + this.props.name}/>
			<ShowHideSection section={this.props.section} border={true}><Grom.Box pad="small">{this.props.children}</Grom.Box></ShowHideSection>
		</div>
	}
}

interface AutoShowHideSectionProps {
	name : string
}
@autobind
@observer
export class AutoShowHideSection extends React.Component<AutoShowHideSectionProps, EmptyState> {
	@observable section : ShowHide = new ShowHide();
	render(){
		return <ShowHideSectionWithButton name={this.props.name} section={this.section}/>
	}
}
