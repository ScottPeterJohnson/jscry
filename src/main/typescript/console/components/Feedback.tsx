import * as React from "react"
import * as ReactDOM from "react-dom"
import {EmptyProps, EmptyState, ConsoleDocumentTitle, TypedRoute, EmptyLocationProps} from "../utility/ConsoleUtility";
import * as Grom from "../Grom"
import {ShowHideSection} from "./ShowHideSection";
import {observable} from "mobx";
import {autobind} from "core-decorators";
import {observer} from "mobx-react/custom";
import {ChangeEvent} from "react";
import {AjaxOperation, LoadingOverlay, RequestErrorPopup} from "../utility/AjaxComponents";
import {
	SubmitFeedbackRequest, SubmitFeedback
} from "endpoints";
import {InjectedRouter} from "react-router";

interface FeedbackProps {
	router: InjectedRouter,
	location: {query:{}}
}

@autobind
@observer
export class Feedback extends React.Component<FeedbackProps, EmptyState>{
	@observable text : string;
	@observable sendFeedback = new AjaxOperation<SubmitFeedbackRequest, Boolean>(SubmitFeedback);

	render(): JSX.Element|any {
		return <Grom.Box>
			<RequestErrorPopup ops={[this.sendFeedback]}/>
			<LoadingOverlay op={this.sendFeedback}>
				<ConsoleDocumentTitle title="Feedback"/>
				<Grom.Heading>Feedback</Grom.Heading>
				<Grom.Paragraph>
					Run into a bug? Hit a snag setting things up? Got a good suggestion? Drop it here.
					We might email you to ask for more details.
				</Grom.Paragraph>
				<Grom.Box><textarea rows={8} value={this.text} onChange={this.handleChange}/></Grom.Box>
				<Grom.Button label="Submit" onClick={this.submitFeedback}/>
				</LoadingOverlay>
		</Grom.Box>;
	}
	handleChange(event : ChangeEvent<HTMLTextAreaElement>){
		this.text = event.target.value;
	}
	submitFeedback(){
		this.sendFeedback.sendThen({
			text: this.text
		}, ()=>{
			FeedbackSubmittedRoute.go(this.props.router, {});
		});
	}
}

export const FeedbackRoute = new TypedRoute<{}, FeedbackProps>("feedback", Feedback);

export class FeedbackSubmitted extends React.Component<EmptyLocationProps, EmptyState>{
	render() : JSX.Element|any {
		return <Grom.Box>
			<ConsoleDocumentTitle title="Feedback submitted!"/>
			<Grom.Heading>Feedback submitted!</Grom.Heading>
			<Grom.Paragraph>
				Thanks for the feedback!
			</Grom.Paragraph>
		</Grom.Box>;
	}
}

export const FeedbackSubmittedRoute = new TypedRoute<{}, EmptyLocationProps>("feedbackSubmitted", FeedbackSubmitted);