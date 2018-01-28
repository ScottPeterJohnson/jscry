import * as React from "react";
import {EmptyProps, EmptyState, isEqual, ObservableComponent} from "./ConsoleUtility";
import Notification from "grommet/components/Notification";
import * as Grom from "../Grom"
import {WebEndpoint} from "endpoints";
import get = Reflect.get;
import {invoke, isError, RequestSuccess, RequestError} from "./ConsoleAjax";
import ReactElement = React.ReactElement;
import {autobind} from "core-decorators";
import {observable} from "mobx";
import {observer} from "mobx-react/custom";
import Spinner from "react-spinner";

interface ReactClass<Props, State> {
	new(props: Props): React.Component<Props,State>
}

interface LoadingOverlayProps {
	op : AjaxOperation<any,any>
}

@observer
export class RequestErrorPopup extends React.Component<{ops : Array<AjaxOperation<any,any>>}, EmptyState>{
	render(){
		const failed = this.props.ops.filter((op)=>op.requestError).map((op, index)=>
			<Grom.Toast status="critical" key={index}>
				{op.requestError || "An error occurred. Try again?"}
			</Grom.Toast>
		);
		if(failed.length){
			return <Grom.Box>{failed}</Grom.Box>;
		} else {
			return null;
		}
	}
}

@observer
export class LoadingOverlay extends React.Component<LoadingOverlayProps, EmptyState>{
	render(){
		return <div style={{position:'relative'}}>
			{this.props.op.running ? <div style={{
				position:'absolute',
				top:0,left:0,
				right:0,
				bottom:0,
				backgroundColor: 'rgba(0,0,0,0.5)',
				color: 'white',
				zIndex: 9999
			}}><span style={{transform: 'translateY(-50%)', top: "50%", position: "relative"}}>Loading...</span></div> : null}
			{this.props.children}
		</div>
	}
}

export class AjaxOperation<RequestType, Value>{
	@observable requestError : boolean = false;
	@observable value : Value|null;
	@observable running : boolean;
	private runningCount : number = 0;
	constructor(
		private endpoint : WebEndpoint<RequestType,Value>
	){}
	send(request : RequestType) : Promise<RequestError|RequestSuccess<Value>> {
		this.requestError = false;
		this.runningCount += 1;
		this.running = true;
		const promise = invoke(this.endpoint, request);
		promise.then((result) => {
			this.runningCount -= 1;
			if(this.runningCount <= 0) {
				this.running = false;
			}
			if (isError(result)) {
				this.requestError = true;
			} else {
				this.value = result.result;
			}
		});
		return promise;
	}
	sendThen(request : RequestType, callback : (_:Value)=>void) : void {
			this.send(request).then((result)=>{
				if(result.type == "success"){
					callback(result.result);
				}
			});
	}
}


@autobind
export class AjaxPropsLoader<RequestType, Value> extends AjaxOperation<RequestType,Value> {
	constructor(
		component : ObservableComponent<any,any>,
		endpoint : WebEndpoint<RequestType,Value>,
		private requestGenerator: ()=>RequestType
	){
		super(endpoint);
		component.componentDidMountEvent.subscribe(()=>this.sendRequest());
		component.componentDidUpdateEvent.subscribe(()=>this.sendRequest());
	}

	protected previousRequest: RequestType | null = null;
	protected sendRequest(force : boolean = false) {
		if(this.running){return;}
		const nextRequest = this.requestGenerator();
		if (force || this.previousRequest == null || !isEqual(this.previousRequest, nextRequest)) {
			this.previousRequest = nextRequest;
			this.send(nextRequest);
			this.value = null;
		}
	}

	forceUpdate(){
		this.sendRequest(true);
	}

	ready() : boolean {
		return !this.requestError && this.value != null && !this.running;
	}
	render() : JSX.Element {
		if (this.requestError) {
			return <Notification status="Critical"
								 message="Uh oh! Something went wrong. Refresh the page and try again."/>
		} else {
			return <Grom.Box flex="grow" align="center" justify="center"><Spinner/></Grom.Box>
		}
	}
}

interface AjaxWrapperProps<Request,Response> {
	request: Request,
	onFirstLoad?: (response: Response)=>void,
	onLoad?: (response : Response)=>void,
	endpoint: WebEndpoint<Request, Response>,
	component: (response: Response) => JSX.Element
}

@observer
export class AjaxWrapper<Request,Response> extends React.Component<AjaxWrapperProps<Request,Response>,EmptyState> {
	@observable ajaxProp: Response|null = null;
	@observable requestError: boolean = false;

	render() {
		const ajaxProp = this.ajaxProp;
		if (ajaxProp != null) {
			return this.props.component(ajaxProp);
		} else {
			if (this.requestError) {
				return <Notification status="Critical"
									 message="Uh oh! Something went wrong. Refresh the page and try again."/>
			} else {
				return <Grom.Box flex="grow" align="center" justify="center"><Spinner/></Grom.Box>
			}
		}
	}

	componentDidMount() {
		this.sendRequest();
	}

	componentDidUpdate(prevProps: AjaxWrapperProps<Request,Response>) {
		if (!isEqual(this.props.request, prevProps.request)) {
			this.sendRequest();
		}
	}

	sendRequest() {
		this.requestError = false;
		invoke(this.props.endpoint, this.props.request).then((result) => {
			if (isError(result)) {
				this.requestError = true;
			} else {
				if(this.ajaxProp == null && this.props.onFirstLoad){
					this.props.onFirstLoad(result.result);
				}
				if(this.props.onLoad){
					this.props.onLoad(result.result);
				}
				this.ajaxProp = result.result;
			}
		});
	}
}