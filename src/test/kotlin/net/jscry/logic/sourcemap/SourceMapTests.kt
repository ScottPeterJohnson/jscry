package net.jscry.logic.sourcemap

import net.jscry.collection.dummyScriptConfigurationMessage
import net.jscry.satisfy
import net.jscry.scripts.mapping.sourcemap.SourceMappings
import net.jscry.scripts.mapping.sourcemap.jScryToOriginalSourceMap
import net.jscry.utility.StringWithLines
import net.jscry.utility.applyTransformations
import net.jscry.utility.classpathResource
import net.jscry.utility.getTransformations
import io.kotlintest.matchers.should
import io.kotlintest.matchers.shouldBe
import io.kotlintest.specs.StringSpec

class SourceMappingTest : StringSpec() {
	init {
		"Line numbers should be correct on a mapped script" {
			val source = classpathResource("scripts/Test1.js")
			val configuration = dummyScriptConfigurationMessage
			val transformations = getTransformations(source, configuration)
			val generated = applyTransformations(source, configuration)
			val map = jScryToOriginalSourceMap(scriptUrl = "test.js",
					content = source,
					originalSourceMapJson = null,
					transformations = transformations)
			val mappings = SourceMappings(map.mappings!!)
			val sourceLines = StringWithLines(source)
			val generatedLines = StringWithLines(generated)
			for((index, sourceLine) in sourceLines.lines.withIndex()){
				if(sourceLine.isBlank()){ continue }
				val entries = mappings.sourceLineMappings(0, index)!!
				println("Mapping: " + sourceLine)
				//In this simple test, any transformations should be additive only
				entries.map { generatedLines.lines[it.generatedLine!!] } should satisfy { it.any { it.containsSubSequence(sourceLine) } }
			}
		}
	}
}

class SourceMappingMappingTest : StringSpec() {
	init {
		"Line numbers should also be correct on a mapped script w/ sourcemap" {
			val source = classpathResource("scripts/test-sourcemap.js")
			val sourceMap = classpathResource("scripts/test-sourcemap.js.map")
			val configuration = dummyScriptConfigurationMessage
			val transformations = getTransformations(source, configuration)
			val generated = applyTransformations(source, configuration)
			val map = jScryToOriginalSourceMap(scriptUrl = "test.js",
					content = source,
					originalSourceMapJson = sourceMap,
					transformations = transformations)
			val mappings = SourceMappings(map.mappings!!)
			//This more complex test requires some manual test values
			mappings.mapSourceToGenerated(0, 2, 9).first shouldBe 21
			mappings.mapSourceToGenerated(0, 4, 13).first shouldBe 23
			mappings.mapSourceToGenerated(0, 10, 0).first shouldBe 32
		}
	}
}

internal fun String.containsSubSequence(other : String) : Boolean {
	var otherChar = 0
	for(char in this){
		if(char == other[otherChar]){
			otherChar += 1
			if(otherChar >= other.length){ return true }
		}
	}
	return false
}