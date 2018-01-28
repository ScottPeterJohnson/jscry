import * as React from "react"
import * as ReactDOM from "react-dom"

import '../console/branding.scss';
//If changing this, you must also change the name in the loaders section of webpack.config.js
import "highlight.js/styles/androidstudio.css"

import Router from "react-router/lib/Router";
import Route from "react-router/lib/Route";
import IndexRoute from "react-router/lib/IndexRoute";
import {
	AnchorSections,
	ConsoleDocumentTitle, deepClone, EmptyProps, EmptyState, FrontPageDocumentTitle, PageSection,
	PageWithSection, routerHistory,
	TypedRoute
} from "../console/utility/ConsoleUtility";
import * as Grom from "../console/Grom"
function main(){
	//Prevents redirection on /welcome path
	if(document.location.hash == ""){ document.location.hash = "/"; }
	const root = document.getElementById("root");
	ReactDOM.render(
		<Router history={routerHistory}>
			<Route path="/" component={FrontPage}>
				<Route path="about" component={About}/>
				<Route path="contact" component={Contact}/>
				{ProductRoute.route()}
				<Route path="start" component={GetStarted}/>
				<Route path="*" component={NoMatch}/>
				<IndexRoute component={Welcome}/>
			</Route>
		</Router>,
		root
	);
}

class FrontPage extends React.Component<EmptyProps, EmptyState> {
	render(): JSX.Element {
		return <Grom.App>
			<Grom.Header fixed={true} pad="medium">
				<Logo/>
				<Grom.Box flex={true} align="center" direction="row" justify="end" pad={{between:"medium"}}>
					<Grom.Anchor path="/product">Product</Grom.Anchor>
					<Grom.Anchor href="/console/">Console</Grom.Anchor>
					<Grom.Button primary={true} path="/start" label="Get started"/>
				</Grom.Box>
			</Grom.Header>
			{this.props.children}
			<Grom.Footer justify="end">
				<Logo/>
				<Grom.Box direction='row'
						  align='center'
						  justify="end"
						  pad={{"between": "medium"}}>
					<Grom.Paragraph margin='none'>
						© {new Date().getFullYear()} jScry
					</Grom.Paragraph>
					<Grom.Menu direction='row'
							   size='small'
							   dropAlign={{"right": "right"}}>
						<Grom.Anchor path='/contact'>
							Contact
						</Grom.Anchor>
						<Grom.Anchor path='/about'>
							About
						</Grom.Anchor>
					</Grom.Menu>
				</Grom.Box>
			</Grom.Footer>
		</Grom.App>
	}

	componentDidMount(): void {}
	componentWillUnmount(): void {}
}

function Logo(){
	return <Grom.Anchor path="/">
		<Grom.Box direction="row">
			<img src="images/logo.png" width="32" height="32"/>
			<Grom.Title>jScry</Grom.Title>
		</Grom.Box>
	</Grom.Anchor>;
}
function HeroSplash(options : {img : string, heading : string, extra? : ()=>JSX.Element[]}) : JSX.Element {
	return <Grom.Box>
		<Grom.Hero background={<Grom.Image fit="cover" src={options.img}/>}>
			<Grom.Box direction='row'
					  justify='center'
					  align='center'>
				<Grom.Box basis='1/2'
						  align='end'
						  pad='medium' />
				<Grom.Box basis='1/2'
						  align='start'
						  pad='medium'>
					<div style={{backgroundColor: "rgba(59, 63, 66, 0.565)", borderRadius: "40px", padding:"25px"}}>
						<Grom.Heading margin='none' strong={true} tag="h2">
							<span style={{color:"#DDDDDD"}}>{options.heading}</span>
						</Grom.Heading>
						{options.extra && options.extra()}
					</div>
				</Grom.Box>
			</Grom.Box>
		</Grom.Hero>
	</Grom.Box>;
}

function GetStarted(){
	return <Grom.Box>
		<FrontPageDocumentTitle title="Getting Started"/>
		<HeroSplash
			img='images/beach.jpeg'
			heading="Getting Started"
		/>
		<Grom.Section>
			<Grom.Heading>Great choice!</Grom.Heading>
			<Grom.Paragraph>
				It should only take a few minutes to get started.
				First, you'll need access to your webpage, preferably in a local or development environment to start with.
			</Grom.Paragraph>
			<Grom.Paragraph>
				<ol>
					<li>
						Sign in to the <Grom.Anchor href="/console/console.html" label="jScry console"/> with any email account.
						There's no need to register.
					</li>
					<li>
						Click on the Projects tab. A new project named "Example Project" has already been created for you!
						Click it to go to its page. Feel free to change its name and other settings.
					</li>
					<li>
						Copy the supplied script tags and add them to the top of your page's "HEAD" tag.
						It's important they come before any other scripts on the page.
					</li>
					<li>
						You should be done! jScry will now intercept the scripts on your page, which will show up under the "Scripts" tab.
						From there you can view information about them and alter how they're transformed.
					</li>
				</ol>
				Some pages which have complex loading processes may not work well with jScry.
				Send feedback from within the console if you find any issues, or need any help.
			</Grom.Paragraph>
		</Grom.Section>
	</Grom.Box>;
}

interface ProductProps {
	location:{query:PageWithSection}
}

class SectionAnchorSections extends AnchorSections<PageWithSection>{}

class Product extends React.Component<ProductProps, EmptyState>{
	render(){
		return <Grom.Box>
			<FrontPageDocumentTitle title="Product"/>
			<HeroSplash
				img='images/lake.jpg'
				heading="Product"
			/>
			<SectionAnchorSections query={this.props.location.query} scrollOffset={-88} route={ProductRoute} withSections={ (Section)=>
				<Grom.Box>
					<Section heading="How It Works" sectionName="howitworks">
						Adding jScry to your page is as simple as adding a few script tags.
						jScry then intercepts your page's scripts before they execute and modifies them as needed before handing
						them off to the browser for execution.
					</Section>
					<Section heading="See Execution Counts" sectionName="executioncounts">
						<Grom.Paragraph>
							View the original source of your scripts, and see how many times each line of code executed.
						</Grom.Paragraph>
					</Section>
					<Section heading="Find Dead Code" sectionName="deadcode">
						<Grom.Paragraph>
							Keep a clean codebase. Find out what lines almost never execute, and eliminate them.
							Less code means a smaller website, faster render times, fewer security holes, and better maintainability.
						</Grom.Paragraph>
					</Section>
					<Section heading="Add New Code" sectionName="addcode">
						<Grom.Paragraph>
							You can annotate your code from the jScry console, allowing you to collect ad-hoc data without the hassle of a redeploy.
							Use this to:
						</Grom.Paragraph>
						<ul>
							<li>Collect more information about that hard-to-track error</li>
							<li>Try out temporary fixes for a subset of users</li>
							<li>Validate assumptions about code (such as variable types, conditions)</li>
						</ul>
						<Grom.Paragraph>
							jScry will automatically attempt to figure out the right spot to place these annotations when your scripts change,
							though this is not guaranteed in the case of major structural changes.
						</Grom.Paragraph>
					</Section>
					<Section heading="Source Maps" sectionName="sourcemaps">
						<Grom.Paragraph>
							jScry supports source maps, so you can see information related to the original source of your scripts,
							before compiling from another language or minifying. When it sees a new script or script version,
							jScry will attempt to follow standard #sourceMappingURL comments to download sourceMaps. This is done
							from jScry servers, not from the machine of the user who first encountered the script.
						</Grom.Paragraph>
						<Grom.Paragraph>
							If you want to protect your original sources behind authentication, jScry supports adding arbitrary
							headers or cookies to its download requests from the Project settings page. If all else fails, you can also manually
							upload sourcemaps from the script page.
						</Grom.Paragraph>
					</Section>
				</Grom.Box>
			}/>
		</Grom.Box>;
	}
}

export const ProductRoute : TypedRoute<PageWithSection,ProductProps> = new TypedRoute<PageWithSection,ProductProps>("product", Product);

function Contact(){
	return <Grom.Box>
		<FrontPageDocumentTitle title="Contact"/>
		<HeroSplash
			img='images/ships.jpeg'
			heading="Contact Us"
		/>
		<Grom.Paragraph>
			Drop us an email at <Grom.Anchor href="mailto:jscry@justmachinery.net">jscry@justmachinery.net</Grom.Anchor>, and we'll try to get back to you as soon as possible.
		</Grom.Paragraph>
	</Grom.Box>;
}

function About(){
	return <Grom.Box>
		<FrontPageDocumentTitle title="About"/>
		<HeroSplash
			img='images/skyscraper.jpeg'
			heading="About Us"
		/>
		<Grom.Paragraph>
			jScry is the personal project of Scott Johnson, a software engineer living near San Francisco, CA.
		</Grom.Paragraph>
	</Grom.Box>;
}

function Welcome(){
	return <Grom.Box>
		<FrontPageDocumentTitle title="Welcome"/>
		<HeroSplash
			img='images/hero.jpg'
			heading="Peek Inside Your Website"
			extra={() => [
				<Grom.Paragraph key="0"><span style={{color: "#FFFFFF",textShadow:"1pt 1pt 1pt rgba(0, 0, 0, 0.87)"}}>Stop guessing what your site's code is doing. jScry tracks its execution to the statement.</span></Grom.Paragraph>,
				<Grom.Button key="1" primary={true} path="/start" label="Start"/>
			]}
		/>
		<Grom.Section>
			<Grom.Heading>
				Transform JavaScript on the fly
			</Grom.Heading>
			<Grom.Paragraph>Add logging statements, monitor a variable, or even test a quick fix- all without redeploying your code.</Grom.Paragraph>
		</Grom.Section>
		<Grom.Box direction="row">
			<Grom.Card
				thumbnail='images/keyboard.jpg'
				heading='How It Works'
				description="Add our script tag to your page, and it will intercept your scripts as they're downloaded, dynamically adding any code required."
				link={<Grom.Anchor path='' label='Learn more'/>}/>
			<Grom.Card
				thumbnail='images/eye.jpg'
				heading='Find Dead Code'
				description='jScry can track how many times each line of code is executed, to help identify dead or problematic areas of your codebase.'
				link={<Grom.Anchor path='' label='Learn more'/>}/>
			<Grom.Card
				thumbnail='images/mosaic.jpg'
				heading='Add New Code'
				description='Use the jScry console to inject JavaScript code and have its result logged and stored for retrieval.'
				link={<Grom.Anchor path='' label='Learn more'/>}/>
		</Grom.Box>
	</Grom.Box>
}

function NoMatch(){
	return <div>
		<FrontPageDocumentTitle title="Not Found"/>
		<HeroSplash img="images/sky.jpg" heading="404 Not Found"/>
		<p>Page not found!</p>
		<Grom.Anchor path="/">Return to the front page.</Grom.Anchor>
	</div>;
}

window.addEventListener('load', function(){
	main();
});