/**
 * Use "npm run scratchpad". Assign things to window object.
 */
import {SingleCallMemoizer} from "./console/utility/ConsoleUtility";
import {binarySearch, closestUnderOrEqualSearch} from "./utility/Utility";

const win = window as any;
win.closestUnderOrEqualSearch = closestUnderOrEqualSearch;
win.binarySearch = binarySearch;