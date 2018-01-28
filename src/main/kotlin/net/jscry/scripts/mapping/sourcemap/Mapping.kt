package net.jscry.scripts.mapping.sourcemap

import net.jscry.utility.*
import org.apache.commons.collections4.list.TreeList
import java.util.*


fun jScryToOriginalSourceMap(
		scriptUrl: String,
		content : String,
		originalSourceMapJson: String?,
		transformations: List<Operation>
) : StandardizedSourceMap {
	val jScryToJs = createJScryToJsMapping(content, transformations)
	if(originalSourceMapJson != null){
		val (originalSourceMap, jsToOriginal) = sourceMapAndMappings(
				originalSourceMapJson)
		return originalSourceMap.copy(
				mappings = jsToOriginal.rebase(jScryToJs).generate()
		)
	} else {
		return StandardizedSourceMap(
				version = 3,
				sources = listOf(scriptUrl),
				sourcesContent = listOf(content),
				mappings = jScryToJs.generate()
		)
	}
}


private fun createJScryToJsMapping(originalContent: String, transformations : List<Operation>) : SourceMappings {
	var transformationIndex = 0
	//0-based character index into the content
	var originalContentIndex = 0

	var sourceLine = 0
	var sourceColumn = 0

	var generatedLine = 0
	var generatedColumn = 0

	//Controls whether to emit a source section when traversing a new character in the original content index.
	//By default we only want to do this when beginning a new section.
	//A section can be either part of the original source, a portion of inserted text, or a portion of deleted original source text.
	var emitNewOriginalContentSection = true

	val mappings = SourceMappings()
	while(originalContentIndex < originalContent.length || transformationIndex < transformations.size){
		if(transformationIndex < transformations.size){
			val transformation = transformations[transformationIndex]
			if(transformation.start <= originalContentIndex){
				when(transformation){
					is Operation.Insert -> {
						val lines = transformation.text.lines()
						lines.withIndex().forEach { (index, line) ->
							if(line.isNotEmpty()) {
								mappings.addMapping(
										generatedLine = generatedLine, generatedColumn = generatedColumn,
										sourceLine = null, sourceColumn = null,
										sourceFileIndex = null, sourceSymbolNameIndex = null
								)
							}
							if(index+1<lines.size){
								generatedLine += 1
								generatedColumn = line.length
							} else {
								generatedColumn += line.length
							}
						}
					}
					is Operation.Delete -> {
						mappings.addMapping(
								generatedLine = generatedLine, generatedColumn = generatedColumn,
								sourceLine = sourceLine, sourceColumn = sourceColumn,
								sourceFileIndex = 0, sourceSymbolNameIndex = null
						)
						while(originalContentIndex < transformation.endBefore){
							val char = originalContent[originalContentIndex]
							if(char == '\n'){
								sourceLine += 1
								sourceColumn = 0
							} else {
								sourceColumn += 1
							}
							originalContentIndex += 1
						}
					}
				}
				transformationIndex += 1
				emitNewOriginalContentSection = true
				continue
			}
		}
		//Advance into the original source
		val char = originalContent[originalContentIndex]
		if(emitNewOriginalContentSection){
			emitNewOriginalContentSection = false
			mappings.addMapping(
					generatedLine = generatedLine, generatedColumn = generatedColumn,
					sourceLine = sourceLine, sourceColumn = sourceColumn,
					sourceFileIndex = 0, sourceSymbolNameIndex = null
			)
		}
		if(char == '\n'){
			sourceLine += 1
			sourceColumn = 0
			generatedLine += 1
			generatedColumn = 0
			emitNewOriginalContentSection = true
		} else {
			sourceColumn += 1
			generatedColumn += 1
		}
		originalContentIndex += 1

	}
	return mappings
}

fun parseSourceMap(json : String) : StandardizedSourceMap {
	return gson.fromJson(json.removePrefix(")]}"), StandardizedSourceMap::class.java)
}

fun sourceMapAndMappings(content : String) : Pair<StandardizedSourceMap, SourceMappings> {
	val sourceMap = parseSourceMap(content)
	val mappings = SourceMappings(sourceMap.mappings!!)
	return Pair(sourceMap, mappings)
}

private typealias GeneratedLine = Int
private typealias GeneratedColumn = Int
private typealias SourceIndex = Int
private typealias SourceLine = Int
private typealias SourceColumn = Int

data class GeneratedLineEntry(val generatedColumn: GeneratedColumn, val sourceLine : SourceLine?, val sourceColumn : SourceColumn?, val sourceFileIndex: Int?, val sourceSymbolNameIndex : Int?)
data class GeneratedLineMapping(val generatedLine: GeneratedLine, val entries: TreeList<GeneratedLineEntry>)
private val GeneratedLineEntryComparator = Comparator<GeneratedLineEntry>{ left, right -> left.generatedColumn.compareTo(right.generatedColumn) }

data class SourceLineEntry(val sourceColumn: SourceColumn, val generatedLine : GeneratedLine?, val generatedColumn : GeneratedColumn?)
data class SourceLineMapping(val sourceLine: SourceLine, val entries: TreeList<SourceLineEntry>)
private val SourceLineEntryComparator = Comparator<SourceLineEntry>{ left, right -> left.sourceColumn.compareTo(right.sourceColumn) }

data class GeneratedRange(val startCharacter : Int, val endCharacter : Int, val sourceFileIndex : Int?)

class SourceMappings() {
	constructor(mappings : String) : this() {
		if(mappings.isNotEmpty()) {
			val iterator = mappings.iterator()
			var generatedLine = 0

			var previousGeneratedColumn = 0
			var previousSourceColumn = 0
			var previousSourceLine = 0
			var previousSourceId = 0
			var previousSourceSymbolId = 0

			var char = iterator.next()
			while (iterator.hasNext()) {
				if (char == ';') {
					generatedLine += 1
					previousGeneratedColumn = 0
					char = iterator.next()
				} else if (char == ',') {
					char = iterator.next()
				} else {
					val entryValues = IntArray(5)
					var entryIndex = 0
					while (entryIndex < 5 && char != ';' && char != ',') {
						entryValues[entryIndex] = Base64VLQ.decode(char, iterator)
						entryIndex += 1
						if (iterator.hasNext()) {
							char = iterator.next()
						} else {
							break //End of mappings, so no more values
						}
					}
					//Decode the mapping into an entry
					val generatedColumn : Int = entryValues[0] + previousGeneratedColumn
					previousGeneratedColumn = generatedColumn

					var sourceLine : Int? = null
					var sourceColumn : Int? = null
					var sourceFileIndex : Int? = null
					var sourceSymbolNameIndex : Int? = null
					if(entryIndex>=4){
						sourceFileIndex = entryValues[1] + previousSourceId
						sourceLine = entryValues[2] + previousSourceLine
						sourceColumn = entryValues[3] + previousSourceColumn

						previousSourceId = sourceFileIndex
						previousSourceLine = sourceLine
						previousSourceColumn = sourceColumn
					}
					if(entryIndex>=5){
						sourceSymbolNameIndex = entryValues[4] + previousSourceSymbolId

						previousSourceSymbolId = sourceSymbolNameIndex
					}

					addMapping(
							generatedLine = generatedLine, generatedColumn = generatedColumn,
							sourceLine = sourceLine, sourceColumn = sourceColumn,
							sourceFileIndex = sourceFileIndex, sourceSymbolNameIndex = sourceSymbolNameIndex
					)
				}
			}
		}
	}

	//TreeMap to preserve ordering
	val generatedLines = TreeMap<Int, GeneratedLineMapping>(Comparator(Int::compareTo))
	val sourceLines = HashMap<Pair<SourceIndex, SourceLine>, SourceLineMapping>()
	fun addMapping(
			generatedLine : GeneratedLine?, generatedColumn : GeneratedColumn?,
			sourceLine : SourceLine?, sourceColumn : SourceColumn?,
			sourceFileIndex: Int?, sourceSymbolNameIndex : Int?
	){
		if(generatedLine != null && generatedColumn != null) {
			generatedLines.getOrPut(generatedLine, {
				GeneratedLineMapping(generatedLine,
						TreeList())
			}).entries.sortedInsert(
					value = GeneratedLineEntry(
							generatedColumn = generatedColumn,
							sourceLine = sourceLine,
							sourceColumn = sourceColumn,
							sourceFileIndex = sourceFileIndex,
							sourceSymbolNameIndex = sourceSymbolNameIndex),
					comp = GeneratedLineEntryComparator
			)
		}
		if(sourceLine != null && sourceColumn != null && sourceFileIndex != null) {
			sourceLines.getOrPut(Pair(sourceFileIndex, sourceLine), {
				SourceLineMapping(sourceLine,
						TreeList())
			}).entries.sortedInsert(
					value = SourceLineEntry(sourceColumn,
							generatedLine,
							generatedColumn),
					comp = SourceLineEntryComparator
			)
		}
	}

	private fun getClosestGeneratedEntry(line : GeneratedLineMapping, column : GeneratedColumn) : GeneratedLineEntry? {
		return line.entries.closestUnderOrEqual(GeneratedLineEntry(column,
				0,
				0,
				0,
				0),
				GeneratedLineEntryComparator)
	}
	private fun getClosestSourceEntry(line : SourceLineMapping, column : SourceColumn) : SourceLineEntry? {
		return line.entries.closestUnderOrEqual(SourceLineEntry(column, 0, 0),
				SourceLineEntryComparator)
	}



	/**
	 * Maps a line/column in the GENERATED file to one in a SOURCE file, or just the original generated position if none exists
	 */
	fun mapGeneratedToSource(generatedLine: GeneratedLine, generatedColumn: GeneratedColumn) : LineColumnSource {
		val generatedLineMapping = generatedLines[generatedLine]
		if(generatedLineMapping == null){
			//This line has no mapping information in the generated source, so we assume it maps to the same place in the original
			return LineColumnSource(generatedLine, generatedColumn, null)
		} else {
			val closestEntry = getClosestGeneratedEntry(generatedLineMapping, generatedColumn) ?: return LineColumnSource(generatedLine, generatedColumn, null)
			if(closestEntry.sourceLine == null || closestEntry.sourceColumn == null){
				return LineColumnSource(generatedLine, generatedColumn, null)
			} else {
				return LineColumnSource(closestEntry.sourceLine, closestEntry.sourceColumn + (generatedColumn - closestEntry.generatedColumn), closestEntry.sourceFileIndex)
			}
		}
	}

	fun sourceLineMappings(sourceFileIndex: Int, sourceLine : SourceLine) : List<SourceLineEntry>? {
		return sourceLines[Pair(sourceFileIndex, sourceLine)]?.entries
	}

	/**
	 * Maps a line/column in a SOURCE file to one in the GENERATED file
	 */
	fun mapSourceToGenerated(sourceFileIndex : SourceIndex?, sourceLine : SourceLine, sourceColumn : SourceColumn) : Pair<GeneratedLine?, GeneratedColumn?> {
		val sourceLineMapping = sourceLines[Pair(sourceFileIndex, sourceLine)]
		if(sourceLineMapping == null){
			//We have no specific mappings for this line in the specified source.
			//TODO: Should we return no mapping, or an extrapolated mapping?
			return Pair(null, null)
		} else {
			//If the sourceColumn asked for is before all of our entries, then we don't know where to put it
			val closestEntry = getClosestSourceEntry(sourceLineMapping, sourceColumn) ?: return Pair(null, null)
			if(closestEntry.generatedLine == null || closestEntry.generatedColumn == null){
				return Pair(null, null)
			} else {
				//Perform some interpolation based on how many columns we are away from the requested target
				return Pair(closestEntry.generatedLine, closestEntry.generatedColumn + (sourceColumn - closestEntry.sourceColumn))
			}
		}
	}

	//See: https://docs.google.com/document/d/1U1RGAehQwRypUTovF1KRlpiOFze0b-_2gc6fAH0KY0k/edit
	fun generate() : String {
		val output = StringBuilder()
		var previousSourceLine = 0
		var previousSourceColumn = 0
		var previousSourceIndex = 0
		var previousSourceSymbolNameIndex = 0
		var lastLine = 0
		for((lineIndex, line) in generatedLines){
			while(lastLine < lineIndex){
				output.append(";")
				lastLine += 1
			}
			var previousColumn = 0
			for((entryIndex, entry) in line.entries.withIndex()){
				if(entryIndex>0) output.append(",")
				//Relative generated column number
				Base64VLQ.encode(output, entry.generatedColumn - previousColumn)
				previousColumn = entry.generatedColumn
				if(entry.sourceFileIndex != null && entry.sourceLine != null && entry.sourceColumn != null){
					//Relative source file
					Base64VLQ.encode(output,
							entry.sourceFileIndex - previousSourceIndex)
					previousSourceIndex = entry.sourceFileIndex
					//Relative source line
					Base64VLQ.encode(output, entry.sourceLine - previousSourceLine)
					previousSourceLine = entry.sourceLine
					//Relative source column
					Base64VLQ.encode(output,
							entry.sourceColumn - previousSourceColumn)
					previousSourceColumn = entry.sourceColumn

					if(entry.sourceSymbolNameIndex != null){
						//Source symbol name
						Base64VLQ.encode(output,
								entry.sourceSymbolNameIndex - previousSourceSymbolNameIndex)
						previousSourceSymbolNameIndex = entry.sourceSymbolNameIndex
					}
				}
			}
		}
		return output.toString()
	}

	/**
	 * Add the transformations of another map after this one
	 * Given a source A, an intermediate B, and a final C:
	 * -This sourcemap is A->B
	 * -newSourceMap is B->C
	 * -We want A->C
	 * We take every A->B entry in this and find out what C newSourceMap maps it to.
	 * This gives us an A->C entry.
	 */
	fun rebase(newSourceMap: SourceMappings): SourceMappings {
		val rebasedMap = SourceMappings()
		for((_,originalLine) in generatedLines){
			for(entry in originalLine.entries){
				val (finalGeneratedLine, finalGeneratedColumn) = newSourceMap.mapSourceToGenerated(
						sourceFileIndex = entry.sourceFileIndex, sourceLine = originalLine.generatedLine, sourceColumn = entry.generatedColumn
				)
				rebasedMap.addMapping(
						generatedLine = finalGeneratedLine,
						generatedColumn = finalGeneratedColumn,
						sourceLine = entry.sourceLine,
						sourceColumn = entry.sourceColumn,
						sourceFileIndex = entry.sourceFileIndex,
						sourceSymbolNameIndex = entry.sourceSymbolNameIndex
				)
			}
		}
		return rebasedMap
	}

	/**
	 * Given the generated source, splits into mapping sections, each mapping to one source file location
	 */
	fun generatedRanges(generatedSource: String) : List<GeneratedRange> {
		val result = mutableListOf<GeneratedRange>()
		val stringWithLines = StringWithLines(generatedSource)
		for((lineNum, line) in generatedLines){
			val lineOffset = stringWithLines.lineStartOffset(lineNum)
			for((entryIndex,entry) in line.entries.withIndex()){
				if(entryIndex+1 >= line.entries.size){
					result.add(GeneratedRange(
							startCharacter = lineOffset + entry.generatedColumn,
							endCharacter = lineOffset + stringWithLines.lines[lineNum].length,
							sourceFileIndex = entry.sourceFileIndex
					))
				} else {
					val otherEntry = line.entries[entryIndex+1]
					result.add(GeneratedRange(
							startCharacter = lineOffset + entry.generatedColumn,
							endCharacter = lineOffset + otherEntry.generatedColumn,
							sourceFileIndex = entry.sourceFileIndex
					))
				}
			}
		}
		return result
	}
}
