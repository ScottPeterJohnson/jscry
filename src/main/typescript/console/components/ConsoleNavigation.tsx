import * as React from "react"
import * as ReactDOM from "react-dom"

import Sidebar from "grommet/components/Sidebar";
import Header from "grommet/components/Header";
import Title from "grommet/components/Title";
import Box from "grommet/components/Box";
import Menu from "grommet/components/Menu";
import {EmptyState, EmptyProps, TypedRoute} from "../utility/ConsoleUtility";
import Link from "react-router/lib/Link";
import Anchor from "grommet/components/Anchor";
import Headline from "grommet/components/Headline";
import {Badge} from "./Badge";
import Heading from "grommet/components/Heading";
import {InjectedRouter} from "react-router";
import {Location as HistoryLocation} from "history"
import {ProjectsRoute} from "./Projects";
import {FeedbackRoute} from "./Feedback";
import {ScriptsRoute} from "./Scripts";
import * as Grom from "../Grom";
import {DeadCodeRoute} from "./DeadCode";

export interface ConsoleNavigationProps {
	location : HistoryLocation,
	router: InjectedRouter
}

export class ConsoleNavigation extends React.Component<ConsoleNavigationProps, EmptyState> {
	heading(path : TypedRoute<{}, any>, name : String){
		let content = <span>{name}</span>;
		if(this.props.location.pathname == path.path){
			content = <span style={{textDecoration:"underline", fontWeight: "bold"}}>{name}</span>;
		}
		return <Anchor path={path.makePath({})}>{content}</Anchor>
	}

	render(): JSX.Element|any {
		return <Sidebar size="small" colorIndex="brand">
			<Box justify="start">
				<Box colorIndex="grey-4" direction="column" justify="center" align="center">
					<Heading tag="h2" strong={true}>
						<Grom.Anchor href="/">jScry</Grom.Anchor>
					</Heading>
					<Badge/>
				</Box>
				<Menu primary={true}>
					{this.heading(ProjectsRoute, "Projects")}
					{this.heading(ScriptsRoute, "Scripts")}
					{this.heading(DeadCodeRoute, "Dead Code")}
					<Anchor href="/welcome/#/">About</Anchor>
					{this.heading(FeedbackRoute, "Feedback")}
				</Menu>
			</Box>
		</Sidebar>;
	}
}