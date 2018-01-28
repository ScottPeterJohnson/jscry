import {
	Position, MappedPosition, MappingItem, SourceMapConsumer, NullablePosition,
	NullableMappedPosition
} from "source-map";
import {filterNotNull} from "../../utility/Utility";
/**
 * Wraps some of the dumb behavior in Mozilla's source-map package.
 * Egregiously, its lines are 1-based, which is AGAINST THE SPEC AND STUPID
 */
export class SourceMapper {
	constructor(private consumer : SourceMapConsumer){}

	public computeColumnSpans(): void { this.consumer.computeColumnSpans(); }

	public originalPositionFor(generatedPosition: Position): NullableMappedPosition {
		return toZeroBased(this.consumer.originalPositionFor(toOneBased(generatedPosition)));
	}

	public generatedPositionFor(originalPosition: MappedPosition): NullablePosition {
		return toZeroBased(this.consumer.generatedPositionFor(toOneBased<MappedPosition>(originalPosition)));
	}

	public allGeneratedPositionsFor(originalPosition: MappedPosition): NullablePosition[] {
		return this.consumer.allGeneratedPositionsFor(toOneBased(originalPosition)!).map(toZeroBased);
	}

	public hasContentsOfAllSources(): boolean { return this.consumer.hasContentsOfAllSources(); }

	public sourceContentFor(source: string, returnNullOnMissing?: boolean) : string|null { return this.consumer.sourceContentFor(source, returnNullOnMissing); }

	public eachMapping(callback: (mapping: MappingItem) => void, context?: any, order?: number): void {
		this.consumer.eachMapping(function(mapping : MappingItem){
			callback({...mapping, generatedLine: mapping.generatedLine-1, originalLine: mapping.originalLine-1});
		}, context, order);
	}

	public sourceName(sourceIndex : number) : string {
		return (this.consumer as any).sources[sourceIndex];
	}
	public sourceIndex(sourceName : string) : number {
		return (this.consumer as any).sources.indexOf(sourceName);
	}
}

function toZeroBased<T extends {line:number|null, column:number|null}>(pos : T) : T {
	return {...pos as any, line: pos.line != null ? pos.line - 1 : null}
}
function toOneBased<T extends {line:number, column:number}>(pos : T) : T {
	return {...pos as any, line: pos.line + 1}
}