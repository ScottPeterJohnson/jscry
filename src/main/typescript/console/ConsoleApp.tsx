import * as React from "react"
import * as ReactDOM from "react-dom"

import './branding.scss';
//If changing this, you must also change the name in the loaders section of webpack.config.js
import "highlight.js/styles/androidstudio.css"
import 'react-select/dist/react-select.css';

import Router from "react-router/lib/Router";
import Route from "react-router/lib/Route";
import Link from "react-router/lib/Link";
import {ProjectDisableRoute, ProjectRoute, ProjectSettingsRoute, ProjectsRoute} from "./components/Projects";
import Split from "grommet/components/Split";
import {ConsoleNavigation} from "./components/ConsoleNavigation";
import Box from "grommet/components/Box";
import IndexRoute from "react-router/lib/IndexRoute";
import {InjectedRouter, RedirectFunction, RouterState} from "react-router";
import {Location as HistoryLocation} from "history"
import * as Grom from "./Grom"
import {ScriptsRoute} from "./components/Scripts";
import {ScriptViewPageRoute} from "./components/scriptview/ScriptView";
import {consoleConfig, routerHistory} from "./utility/ConsoleUtility";
import {FeedbackRoute, FeedbackSubmittedRoute} from "./components/Feedback";
import {NewUser, NewUserRoute} from "./components/NewUser";
import {DeadCodeReportViewRoute, DeadCodeRoute} from "./components/DeadCode";
import {createTypeStyle} from "typestyle";
import {installGlobalConsoleCss} from "./ConsoleCss.tsx";
import {ExtensionProjectSelectRoute} from "./components/ExtensionProjectSelect";

function main(){
	installGlobalConsoleCss();
	const root = document.getElementById("root");
	ReactDOM.render(
		<Router history={routerHistory}>
			<Route path="/" component={App}>
				{ ProjectsRoute.route() }
				{ ProjectRoute.route() }
				<Route path="project/stats/:apiKey" component={NoMatch}/>
				{ ScriptsRoute.route() }
				{ ScriptViewPageRoute.route() }
				<Route path="project/delete/:apiKey" component={NoMatch}/>
				{ ProjectDisableRoute.route() }
				{ ProjectSettingsRoute.route() }
				{ FeedbackRoute.route() }
				{ FeedbackSubmittedRoute.route() }
				{ NewUserRoute.route() }
				{ DeadCodeRoute.route() }
				{ DeadCodeReportViewRoute.route() }
				{ ExtensionProjectSelectRoute.route() }
				<Route path="project/script/:apiKey/:scriptId"/>
				<Route path="*" component={NoMatch}/>
				<IndexRoute onEnter={checkFirstTimeUser} component={ConsoleWelcome}/>
			</Route>
		</Router>,
		root
	);
}

interface AppState {
}
interface AppProps {
	location : HistoryLocation, //Injected by React
	router : InjectedRouter
}

function checkFirstTimeUser(nextState: RouterState, replace: RedirectFunction){
	if(consoleConfig.firstLogin){
		replace(NewUserRoute.path);
	}
}

function NoMatch(){
	return <div>
		<h1>404: Not Found</h1>
		<p>Page not found!</p>
		<Grom.Anchor path="/">Return to console.</Grom.Anchor>
	</div>;
}

function ConsoleWelcome(){
	return <Grom.Box>
		<Grom.Headline>Welcome!</Grom.Headline>
		<Grom.Paragraph>From the jScry console you can manage your projects, view information about the scripts within them, and control what gets monitored.</Grom.Paragraph>
	</Grom.Box>
}

class App extends React.Component<AppProps, AppState> {
	constructor(props : AppProps){
		super(props);
		this.state = {};
	}
	render(): JSX.Element {
		return <Grom.App centered={false}>
			<Split separator={true} flex="right">
				<ConsoleNavigation location={this.props.location} router={this.props.router}/>
				<Grom.Box colorIndex="light-2" full={true} pad={{horizontal:"small", vertical:"small"}} primary={true}>
					{this.props.children}
				</Grom.Box>
			</Split>
		</Grom.App>
	}

	componentDidMount(): void {
	}

	componentWillUnmount(): void {
	}
}

window.addEventListener('load', function(){
	main();
});