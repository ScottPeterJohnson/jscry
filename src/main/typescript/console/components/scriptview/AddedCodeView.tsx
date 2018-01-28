import * as React from "react"
import * as Grom from "../../Grom";
import {AddedCodeClickable} from "./CodeView";
import {autobind} from "core-decorators";
import {CodeInput, EmptyState, GridTable} from "../../utility/ConsoleUtility";
import {observable} from "mobx";
import {observer} from "mobx-react/custom";
import {
 GetAddedCodeResults, GetAddedCodeResultsRequest, ScriptCommandAddedCodeResultsRow, ScriptAddCodeCommandData, ScriptClientView, DeleteScriptCodeCommandRequest, DeleteScriptCodeCommand, ChangeScriptCodeCommand, ChangeScriptCodeCommandRequest
} from "endpoints";
import {AjaxOperation, AjaxWrapper} from "../../utility/AjaxComponents";
import {CodePopup} from "./CodePopup";
import LazyLoad from "react-lazyload";
import {basicComparator} from "../../../utility/Utility";

export interface AddedCodeViewProps {
	script : ScriptClientView
	addedCode : AddedCodeClickable
	onClose: ()=>void
}

class AddedCodeResultGridTable extends GridTable<ScriptCommandAddedCodeResultsRow>{}
class GetAddedCodeResultsAjax extends AjaxWrapper<GetAddedCodeResultsRequest, ScriptCommandAddedCodeResultsRow[]> {}

@autobind
@observer
export class AddedCodeView extends React.Component<AddedCodeViewProps, EmptyState> {
	@observable currentCode : string = this.code();
	@observable deleteOp = new AjaxOperation<DeleteScriptCodeCommandRequest, {}>(DeleteScriptCodeCommand);
	@observable changeOp = new AjaxOperation<ChangeScriptCodeCommandRequest, {}>(ChangeScriptCodeCommand);

	render(){
		const span = this.props.addedCode.span;
		return <CodePopup header={<Grom.Heading tag="h2">Added Code</Grom.Heading>} selectedSpans={[span]} onClose={this.props.onClose}>
			<Grom.Tabs>
				<Grom.Tab title="Edit">
					<Grom.Box pad={{between:"small"}}>
						<CodeInput label="Code" value={this.currentCode} onChange={this.changeCode}/>
						<Grom.Box direction="row" pad={{between:"small"}} align="end">
							<Grom.Button label="Delete" onClick={this.deleteCommand}/>
							<Grom.Button primary label="Save" onClick={this.save}/>
						</Grom.Box>
					</Grom.Box>
				</Grom.Tab>
				<Grom.Tab title="Results">
					<LazyLoad once>
						<GetAddedCodeResultsAjax endpoint={GetAddedCodeResults} request={{scriptCommandId:this.props.addedCode.id}} component={(results)=>
							<Grom.Box>
								<AddedCodeResultGridTable
									itemKey={(row)=>row.addedCodeResultId}
									columns={[
										{label: 'Time', value: (row)=>row.time.toLocaleString(), sorter: (left, right)=>basicComparator(left.time, right.time)},
										{label: 'Value', value: (row)=>row.result, sorter: basicComparator}
									]}
									items={results}
									onItemClick={()=>void 0}
									initialSortAscending={false}
								/>
							</Grom.Box>
						}>
						</GetAddedCodeResultsAjax>
					</LazyLoad>
				</Grom.Tab>
			</Grom.Tabs>
		</CodePopup>
	}

	candidates(){
		return this.props.script.commands.get(""+this.props.addedCode.site)!;
	}
	command(){
		const candidates = this.candidates();
		for(const cmd of candidates){
			if(cmd.scriptCommandId == this.props.addedCode.id){
				return cmd;
			}
		}
		throw Error("Command not found for command view");
	}
	code(){
		return (JSON.parse(this.command().commandData) as ScriptAddCodeCommandData).code;
	}
	changeCode(code : string){
		this.currentCode = code;
	}

	deleteCommand(){
		this.deleteOp.sendThen({
			commandId: this.props.addedCode.id
		}, ()=>{
			this.props.onClose();
			const filteredCommands = this.candidates().filter((cmd)=> cmd.scriptCommandId != this.props.addedCode.id);
			this.props.script.commands.set(""+this.props.addedCode.site, filteredCommands);
			const span = this.props.addedCode.span;
			span.parentNode!.removeChild(span);
		});
	}
	save(){
		const data = {
			code: this.currentCode
		};
		this.changeOp.sendThen({
			commandId: this.props.addedCode.id,
			commandData: data
		}, ()=>{
			this.command().commandData = JSON.stringify(data);
			this.props.addedCode.span.innerText = this.currentCode;
			this.props.onClose();
		});
	}
}
