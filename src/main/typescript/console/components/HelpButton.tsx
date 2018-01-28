import * as React from "react"
import * as Grom from "../Grom";
import {EmptyState, EmptyProps} from "../utility/ConsoleUtility";
import Help from "grommet/components/icons/base/Help";
import {omit} from "lodash";


class PassThroughDiv extends React.Component<EmptyProps,EmptyState> {
	render() {
		const rest = omit(this.props,
			['style', 'theme', 'tooltip', 'tooltipDelay', 'tooltipHideOnClick']);

		return <div style={{display:"inline-block"}} {...rest}>{this.props.children}</div>;
	}
}


interface HelpButtonProps {
	tooltip : string
}
export class HelpButton extends React.Component<HelpButtonProps, EmptyState>{
	render(){
		return <img title={this.props.tooltip} src="images/help.png" style={{width: "15px", height:"15px", margin:"0 0 10px 0px"}}/>;
	}
}