import * as React from "react"
import * as ReactDOM from "react-dom"
import {EmptyProps, EmptyState} from "./ConsoleUtility";
import * as Grom from "../Grom";
import {autobind} from "core-decorators";
import Box = Grommet.Box;
import BoxProps = Grommet.BoxProps;
import {ProjectsRow} from "endpoints";
import ReactSelect from "react-select";

export {ReactSelect as ReactSelect};
export interface SimpleComboProps<T> {
	labelMaker: (t:T)=>string
	options: Array<T>
	onSelect: (t:T)=>void
	value: T|undefined
	label?: string,
	search?: boolean,
	boxProps?: any
}

interface SimpleComboState {
	search : string
}
interface SelectOption<T> {
	label: string,
	value: T
}

@autobind
export class SimpleCombo<T> extends React.Component<SimpleComboProps<T>, SimpleComboState> {
	state : SimpleComboState = { search: '' };

	render(): JSX.Element|any {
		const props = this.props;
		const opts = props.options.map((option)=>this.makeLabel(option));
		let value;
		if(props.value !== undefined){
			value = this.makeLabel(props.value);
		} else {
			value = this.makeLabel(props.options[0]);
		}
		return <Grom.Box direction="row" align="center" {...(this.props.boxProps || {})}>
			{this.props.label ? <Grom.Label margin="small"><b>{this.props.label}&nbsp;</b></Grom.Label> : undefined}
			<Grom.Box flex={true}>
				<Grom.Select value={value} options={this.filterOptions(opts)} onChange={this.onChange} onSearch={this.props.search == false ? undefined : this.onSearch}/>
			</Grom.Box>
		</Grom.Box>;
	}
	onChange({value} : {value:SelectOption<T>}){ this.props.onSelect(value.value); }
	onSearch(event : KeyboardEvent){
		const searchValue = (event.target as HTMLInputElement).value;
		this.setState({search: searchValue});
	}
	filterOptions(opts : Array<SelectOption<T>> ){
		return opts.filter((opt)=>opt.label.indexOf(this.state.search) !== -1);
	}
	makeLabel(t : T) : SelectOption<T> {
		return {
			value: t,
			label: this.props.labelMaker(t)
		};
	}
}

export class SimpleStringCombo extends SimpleCombo<string>{}
export class SimpleNullableStringCombo extends SimpleCombo<string>{}
export class SimpleNumberCombo extends SimpleCombo<number>{}
export class SimpleNullableNumberCombo extends SimpleCombo<number|null>{}
export class ProjectsRowCombo extends SimpleCombo<ProjectsRow>{}
export class NullableProjectsRowCombo extends SimpleCombo<ProjectsRow|null>{}

