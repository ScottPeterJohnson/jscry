import * as React from "react"
import * as ReactDOM from "react-dom"
import {EmptyProps, EmptyState, ConsoleDocumentTitle, TypedRoute, EmptyLocationProps} from "../utility/ConsoleUtility";
import * as Grom from "../Grom"
import {ShowHideSection} from "./ShowHideSection";
import {AjaxWrapper} from "../utility/AjaxComponents";
import {FirstLogin} from "endpoints";

export class FirstLoginAjax extends AjaxWrapper<FirstLogin, {}> {
}

export class FirstLoginComp extends React.Component<EmptyProps, EmptyState>{
	render() : JSX.Element|any {
		return <FirstLoginAjax
			request={FirstLogin} endpoint={FirstLogin} component={(resp) =>
			<div>
				{resp ?
				<Grom.Paragraph>Since this is your first time accessing the console, we've created an example project to
					get you started.</Grom.Paragraph>
				: null}
				{this.props.children}
			</div>}
		/>;
	}
}

export class NewUser extends React.Component<EmptyLocationProps, EmptyState>{
	render(): JSX.Element|any {
		return <Grom.Box>
			<ConsoleDocumentTitle title="Hello!"/>
			<Grom.Heading>Welcome to the jScry Console</Grom.Heading>
			<Grom.Paragraph>
				This is the console page for <b>jScry</b>, a library to transform and instrument Javascript code on the fly.
			</Grom.Paragraph>
			<FirstLoginComp/>
		</Grom.Box>;
	}
}

export const NewUserRoute = new TypedRoute<{}, EmptyLocationProps>("newuser", NewUser);