import * as React from "react"
import * as ReactDOM from "react-dom"
import {EmptyState, EmptyProps, consoleConfig} from "../utility/ConsoleUtility";
import * as Grom from "../Grom";
import UserIcon from "grommet/components/icons/base/User";


function badgeName(){
	if(consoleConfig.name && consoleConfig.email){
		return `${consoleConfig.name} (${consoleConfig.email})`;
	} else if (consoleConfig.name) {
		return consoleConfig.name;
	} else if (consoleConfig.email) {
		return consoleConfig.email;
	} else {
		return consoleConfig.uid;
	}
}

function logout(){
	window.location.href = "logout.html"
}

function BadgeClickable(){
	return <Grom.Box direction="column" align="center">
		<span style={{marginBottom:"5px"}}>Hi, {consoleConfig.name}</span>
		<div>{consoleConfig.picture ? <Grom.Image full={false} size="thumb" alt="Your Account" src={consoleConfig.picture}/>: <UserIcon size="large"/>}</div>
	</Grom.Box>
}

export class Badge extends React.Component<EmptyProps, EmptyState> {
	render(): JSX.Element {
		return <Grom.Menu icon={BadgeClickable()}>
			<Grom.Heading tag="h3">{badgeName()}</Grom.Heading>
			<Grom.Anchor onClick = {logout}>Log Out</Grom.Anchor>
		</Grom.Menu>;
	}
}