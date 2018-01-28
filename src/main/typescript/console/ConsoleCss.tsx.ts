import {cssRule} from "typestyle";

export function installGlobalConsoleCss(){
	//Fixes clash with Grommet styling
	cssRule('.Select .Select-input input', {
		border: "0px"
	});
}