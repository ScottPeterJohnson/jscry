import * as React from "react"
import * as Grom from "../../Grom";
import {AddedCodeClickable, CodeView, selectedStatementStyle} from "./CodeView";
import {style} from "typestyle";
import {autobind} from "core-decorators";
import Close from "grommet/components/icons/base/Close";
import scrollIntoViewIfNeeded from "scroll-into-view-if-needed";
import {EmptyState, numberFormat, validJsExpression} from "../../utility/ConsoleUtility";
import {observer} from "mobx-react/custom";

export interface CodePopupProps {
	selectedSpans : HTMLSpanElement[]
	onClose: ()=>void,
	header : JSX.Element|null
}


@autobind
@observer
export class CodePopup extends React.Component<CodePopupProps, EmptyState> {
	static style = style({
		border:"2px solid grey",
		borderRadius:"3px",
		float: "left",
		width: "800px",
		height: "600px",
		position: "absolute",
		margin: "0px 0px 0px 10px",
		padding: "5px",
		zIndex: 1,
		background: "#FFFFFF",
		overflowY: "auto"
	});

	componentDidMount(){
		this.afterRender();
	}

	componentDidUpdate(){
		this.afterRender();
	}

	afterRender(){
		this.setStatementSelectionHighlights();
		if(this.container){ scrollIntoViewIfNeeded(this.container, true, {easing: "easeIn"}); }
	}

	static clearStatementSelectionHighlights(spans : Array<HTMLSpanElement>){
		for(const span of spans){
			span.classList.remove(selectedStatementStyle);
		}
	}

	setStatementSelectionHighlights(){
		for (const span of this.props.selectedSpans) {
			span.classList.add(selectedStatementStyle);
		}
	}

	componentWillUnmount(){
		CodePopup.clearStatementSelectionHighlights(this.props.selectedSpans);
	}

	container : HTMLDivElement;

	render() {
		let bottomSpanPosition = 0;
		for(const span of this.props.selectedSpans){
			const bottom = span.offsetTop + span.offsetHeight;
			if(bottom > bottomSpanPosition){ bottomSpanPosition = bottom; }
		}

		return <div className={CodePopup.style} style={{top: bottomSpanPosition}} ref={(ref) => this.container = ref!}>
			<Grom.Box direction="row" justify="end" separator="bottom">
				<Grom.Box direction="row" alignContent="stretch" flex={true}>
					{this.props.header}
				</Grom.Box>
				<Grom.Button icon={<Close/>} onClick={this.close}/>
			</Grom.Box>
			<Grom.Box flex={true} colorIndex="light-2">
				{this.props.children}
			</Grom.Box>
		</div>;
	}

	close(){
		this.props.onClose();
	}
}
