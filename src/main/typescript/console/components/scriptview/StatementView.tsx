import * as React from "react"
import * as Grom from "../../Grom";
import {StatementId, statementSpanElementId, StatementIdCombo} from "./StatementTrackingVisitor";
import {ScriptViewContext} from "./ScriptViewContext";
import {truncate} from "lodash";
import {addAddedCodeSpan, CodeView, selectedStatementStyle} from "./CodeView";
import {style} from "typestyle";
import {autobind} from "core-decorators";
import Close from "grommet/components/icons/base/Close";
import scrollIntoViewIfNeeded from "scroll-into-view-if-needed";
import {HelpButton} from "../HelpButton";
import {CodeInput, EmptyState, numberFormat, validJsExpression} from "../../utility/ConsoleUtility";
import {observable} from "mobx";
import {observer} from "mobx-react/custom";
import {
	InclusionCommandData, ToggleScriptStatementInclusion, ToggleScriptStatementInclusionRequest, ScriptCommandsRow,
	DefaultableBoolean, AddScriptCodeCommandRequest, AddScriptCodeCommand
} from "endpoints";
import {AjaxOperation, LoadingOverlay} from "../../utility/AjaxComponents";
import {SimpleCombo, SimpleStringCombo} from "../../utility/SimpleCombo";
import {identity} from "../../../utility/Utility";
import {ChangeEvent} from "react";
import {CodePopup} from "./CodePopup";
import {ScriptView} from "./ScriptView";

export interface StatementViewProps {
	scriptMarkup : ScriptViewContext,
	statements : Array<StatementId>
	onClose: ()=>void
}

const approximatelyExplanation = "For performance, this figure is only accurate to three significant digits.";

class DefaultableBooleanCombo extends SimpleCombo<DefaultableBoolean>{}

@autobind
@observer
export class StatementView extends React.Component<StatementViewProps, EmptyState> {
	@observable activeStatement : StatementId|undefined = this.props.statements[this.props.statements.length-1];
	@observable changeExecution = new AjaxOperation<ToggleScriptStatementInclusionRequest, ScriptCommandsRow>(ToggleScriptStatementInclusion);
	@observable addCodeOp = new AjaxOperation<AddScriptCodeCommandRequest, ScriptCommandsRow>(AddScriptCodeCommand);

	componentWillReceiveProps(nextProps : StatementViewProps){
		this.activeStatement = nextProps.statements[nextProps.statements.length-1];
	}


	render(){
		const statementId = this.activeStatement;
		if(!this.props.statements.length || !statementId){
			return null;
		}

		const scriptMarkup = this.props.scriptMarkup;
		const sourceSnippet = scriptMarkup.getSourceSnippet(statementId);

		const {sum:executions, sessionUseCount} = scriptMarkup.getStatementExecutions(statementId);
		return <CodePopup
			header={<StatementIdCombo
				label="Statement"
				onSelect={this.setActiveStatement}
				value={this.activeStatement}
				options={this.props.statements}
				labelMaker={this.statementSnippetLabel}
				search={false}
				boxProps={{flex: true}}
			/>}
			selectedSpans={CodeView.spansForStatement(document.body, this.props.scriptMarkup, statementId)}
			onClose={this.props.onClose}
		>
			<Grom.Tabs>
				<Grom.Tab title="Executions">
					<Grom.Paragraph>
						This script has been executed approximately<HelpButton tooltip={approximatelyExplanation}/>&nbsp;
						<b>{numberFormat(executions, 3)}</b> times, or
						<b> {numberFormat(executions/Math.max(sessionUseCount,1), 3)}</b> times per user over <b>{sessionUseCount}</b> sessions.
					</Grom.Paragraph>
					<LoadingOverlay op={this.changeExecution}>
						<DefaultableBooleanCombo
							label="Track executions"
							onSelect={(value)=>{this.changeStatementExecution(statementId!!, value)}}
							value={this.statementExecution(statementId)}
							options={["DEFAULT", "TRUE", "FALSE"]}
							labelMaker={StatementView.trackExecutionLabel}
							search={false}
						/>
					</LoadingOverlay>
				</Grom.Tab>
				<Grom.Tab title="Add Code">
					{
						this.addedCode ? <Grom.Box>
								<Grom.Paragraph>Code added!</Grom.Paragraph>
								<Grom.Button label="Continue" onClick={()=>this.addedCode = false}/>
							</Grom.Box> :
							<LoadingOverlay op={this.addCodeOp}>
								<Grom.Box direction="row" align="center" pad={{between:"small"}}>
									<Grom.Paragraph>Add code</Grom.Paragraph>
									<SimpleStringCombo
										value={this.codeAddPosition}
										options={["before", "after"]}
										labelMaker={identity}
										onSelect={(value) => this.codeAddPosition = value}
									/>
									<Grom.Paragraph>this statement</Grom.Paragraph>
								</Grom.Box>
								<CodeInput label="JavaScript code to insert" value={this.codeToAdd} onChange={this.changeCodeToAdd}/>
								<Grom.Button label="Add" primary onClick={this.addCode}/>
							</LoadingOverlay>
					}
				</Grom.Tab>
				<Grom.Tab title="Source Code">
					<Grom.Accordion>
						<Grom.AccordionPanel heading="Source" animate={false}><pre style={{overflow: "auto"}}><code>{sourceSnippet}</code></pre></Grom.AccordionPanel>
						<Grom.AccordionPanel heading="Generated JavaScript" animate={false}><pre style={{overflow: "auto"}}><code>{scriptMarkup.getGeneratedSnippet(statementId)}</code></pre></Grom.AccordionPanel>
					</Grom.Accordion>
				</Grom.Tab>
			</Grom.Tabs>
		</CodePopup>;
	}

	addCode(){
		const statementId = StatementId.unwrap(this.activeStatement!);
		this.addCodeOp.sendThen({
			scriptId: this.props.scriptMarkup.script.scriptId,
			symbolPosition: statementId,
			code: this.codeToAdd

		}, (result)=>{
			const commands = this.getCommands(StatementId.wrap(statementId));
			commands.push(result);
			this.addedCode = true;
			addAddedCodeSpan(document.body, this.props.scriptMarkup, statementId, result);
		});
	}

	@observable codeAddPosition : string = "before";
	@observable codeToAdd : string = "";
	@observable addedCode : boolean = false;
	changeCodeToAdd(code : string){
		this.codeToAdd = code;
	}

	getCommandsMap(){
		return this.props.scriptMarkup.script.commands;
	}
	getCommands(statementId : StatementId) : ScriptCommandsRow[] {
		const commandsMap = this.getCommandsMap();
		let commands = commandsMap.get(StatementId.unwrap(statementId)+"");
		if(!commands){
			commands = [];
			commandsMap.set(StatementId.unwrap(statementId)+"", commands);
			return commandsMap.get(StatementId.unwrap(statementId)+"")!!;
		}
		return commands;
	}

	removeCommand(statementId : StatementId, command : ScriptCommandsRow){
		const commands = this.getCommands(statementId);
		this.getCommandsMap().set(StatementId.unwrap(statementId)+"", commands.filter((other)=> command.scriptCommandId != other.scriptCommandId));
	}

	updateOrAddInclusionCommand(statementId : StatementId, command : ScriptCommandsRow){
		this.removeCommand(statementId, command);
		const commands = this.getCommands(statementId);
		commands.push(command);
	}

	statementInclusionCommand(statementId: StatementId) : ScriptCommandsRow|null {
		const commands = this.getCommands(statementId);
		for(const command of commands){
			if(command.commandType == "INCLUSION"){
				return command;
			}
		}
		return null;
	}

	statementExecution(statementId : StatementId) : DefaultableBoolean {
		const command = this.statementInclusionCommand(statementId);
		if(command != null){
			return (JSON.parse(command.commandData) as InclusionCommandData).included ? "TRUE" : "FALSE";
		}
		return "DEFAULT";
	}

	changeStatementExecution(statementId : StatementId, value : DefaultableBoolean){
		const command = this.statementInclusionCommand(statementId);
		this.changeExecution.sendThen({
			scriptCommandId: command != null ? command.scriptCommandId : (null as any as number),
			scriptId: this.props.scriptMarkup.script.scriptId,
			symbolPosition: StatementId.unwrap(statementId),
			included: value
		}, (result)=> {
			if (value == "DEFAULT") {
				if (command != null) {
					this.removeCommand(statementId, command);
				}
			} else {
				this.updateOrAddInclusionCommand(statementId, result);
			}
		});
	}
	statementSnippetLabel(statementId : StatementId){
		const scriptMarkup = this.props.scriptMarkup;
		const sourceSnippet = scriptMarkup.getSourceSnippet(statementId);
		return truncate(sourceSnippet, {length:64});
	}

	static trackExecutionLabel(value : DefaultableBoolean){
		switch(value){
			case "DEFAULT": return "Default";
			case "TRUE": return "Always";
			case "FALSE": return "Never";
			default: return value;
		}
	}

	setActiveStatement(statementId : StatementId){
		this.activeStatement = statementId;
	}
}
