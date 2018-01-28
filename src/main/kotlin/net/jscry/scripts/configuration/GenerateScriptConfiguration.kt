package net.jscry.scripts.configuration

import net.jscry.database.enums.DefaultableBoolean
import net.jscry.database.enums.JobTypes
import net.jscry.database.enums.ScriptCommandTypes
import net.jscry.database.tables.dsl.JobsRow
import net.jscry.database.tables.dsl.scriptMetadataTable
import net.jscry.executions.executionSumsForScript
import net.jscry.scripts.commands.ScriptCommandData
import net.jscry.scripts.commands.scriptCommandsCache
import net.jscry.scripts.getScriptContent
import net.jscry.scripts.getScriptRow
import net.jscry.scripts.mapping.diff.mapNewScript
import net.jscry.scripts.mapping.mapCommandPositions
import net.jscry.scripts.mapping.sourcemap.sourceMapAndMappings
import net.jscry.scripts.scriptSettingsCache
import net.jscry.utility.*
import mu.KLogging
import net.justmachinery.kdbgen.from
import net.justmachinery.kdbgen.select
import net.justmachinery.kdbgen.where

/**
 * @return Function to await script configuration ID result of task.
 */
fun requestScriptConfiguration(scriptId: Long) : ()->Long? {
	val jobTask = submitJob(jobType = JobTypes.GENERATE_SCRIPT_CONFIGURATION,
			parameter = scriptId.toString(),
			data = JobData.ScriptConfigurationJobData())
	return {
		val result = jobTask()
		result?.toLong()
	}
}

fun generateScriptConfiguration(job : JobsRow) : Long {
	val scriptId = job.parameter.toLong()
	log.debug { "Generating script configuration for script ID $scriptId"}
	val mapped = from(scriptMetadataTable).select(scriptMetadataTable.mapped).where { it.scriptId equalTo scriptId}.query().firstOrNull()?.first ?: false
	if(!mapped){
		mapNewScript(scriptId)
	}
	val config = ScriptConfigurationGenerator(scriptId).create()
	val configJson = gson.toJson(config)
	//language=PostgreSQL
	val statement = "insert into script_configurations(script_id, json) values (:scriptId, cast(:json as JSONB)) returning script_configuration_id"
	val configurationId = sql.insert(
			statement,
			mapOf("scriptId" to scriptId, "json" to configJson),
			f = { it.long("script_configuration_id") }
	).second
	return configurationId
}

private class ScriptConfigurationGenerator(val scriptId: Long) {
	companion object : KLogging()

	private val script by lazy { getScriptRow(scriptId) }
	private val scriptSettings by lazy { scriptSettingsCache.get(script.url)!! }
	private val scriptCommands by lazy { scriptCommandsCache.get(Pair(scriptId, script.url))!! }
	private val mappedScriptCommands by lazy {
		mapCommandPositions(scriptContent,
				scriptCommands)
	}
	private val scriptContent by lazy { getScriptContent(scriptId)!! }



	fun create() : ScriptConfiguration {
		if(scriptSettings.any { it.fromSourceMapUrl == null && it.collectionEnabled == DefaultableBoolean.FALSE }){
			return ScriptConfiguration(active = false)
		} else {
			return ScriptConfiguration()
					.applyScriptCommands()
					.determineSourceMapExcludedRanges()
					.determineExecutionSums()
		}
	}

	private fun ScriptConfiguration.determineExecutionSums() : ScriptConfiguration {
		return this.copy(executions = executionSumsForScript(scriptId))
	}

	/**
	 * Users have the ability to exclude sources within the sourcemap from consideration.
	 * These sources map to ranges in the generated code.
	 */
	private fun ScriptConfiguration.determineSourceMapExcludedRanges() : ScriptConfiguration {
		val excludedRangeStarts = mutableListOf<Int>()
		val excludedRangeEnds = mutableListOf<Int>()
		if(scriptContent.sourceMap == null){
			//We can't exclude anything if we don't have a source map!
			return this
		}
		if(scriptSettings.any { it.fromSourceMapUrl != null && it.collectionEnabled == DefaultableBoolean.FALSE }){
			val excludedSources = scriptSettings
					.filter { it.fromSourceMapUrl != null && it.collectionEnabled == DefaultableBoolean.FALSE }
					.map { it.url }
					.toSet()
			//To properly exclude this subset of the whole script file, we need to do some source mapping.
			val (originalSourceMap, mappings) = sourceMapAndMappings(scriptContent.sourceMap as String)
			for(range in mappings.generatedRanges(scriptContent.content)){
				if(range.sourceFileIndex != null){
					val source = originalSourceMap.sources[range.sourceFileIndex]
					if(excludedSources.contains(source)){
						excludedRangeStarts.add(range.startCharacter)
						excludedRangeEnds.add(range.endCharacter)
					}
				}
			}
		}
		val (simplifiedExcludedStarts, simplifiedExcludedEnds) = simplifyRanges(
				excludedRangeStarts,
				excludedRangeEnds)
		return this.copy(excludedRangeStarts = simplifiedExcludedStarts, excludedRangeEnds = simplifiedExcludedEnds)
	}

	private fun ScriptConfiguration.applyScriptCommands() : ScriptConfiguration {
		val alwaysExclude = mutableListOf<Int>()
		val alwaysInclude = mutableListOf<Int>()
		val codeInserts = mutableMapOf<Int,MutableList<CodeInsert>>()
		for(command in mappedScriptCommands){
			when (command.commandType) {
				ScriptCommandTypes.INCLUSION -> {
					val shouldInclude = gson.fromJson(command.commandData, Boolean::class.java)
					if (shouldInclude) {
						alwaysInclude.add(command.symbolPosition)
					} else {
						alwaysExclude.add(command.symbolPosition)
					}
				}
				ScriptCommandTypes.ADD_CODE -> {
					val commandData = gson.fromJson(command.commandData, ScriptCommandData.ScriptAddCodeCommandData::class.java)
					codeInserts.getOrPut(command.symbolPosition, { mutableListOf() })
							.add(CodeInsert(command.scriptCommandId, commandData.code))
				}
			}
		}
		return this.copy(
				alwaysExclude = alwaysExclude.union(this.alwaysExclude).toList(),
				alwaysInclude = alwaysInclude.union(this.alwaysInclude).toList(),
				codeInserts = codeInserts
		)
	}
}

/**
 * @param[excludedRangeStarts] Sorted ascending list containing the start of every excluded range
 * @param[excludedRangeEnds] List containing the end of every excluded range
 * @return A new start/end list pair with no overlapping ranges
 */
private fun simplifyRanges(excludedRangeStarts : List<Int>, excludedRangeEnds : List<Int>) : Pair<List<Int>, List<Int>> {
	val simplifiedStarts = ArrayList<Int>(excludedRangeStarts.size)
	val simplifiedEnds = ArrayList<Int>(excludedRangeEnds.size)
	var nextEnd = -1
	var index = 0
	while(index < excludedRangeStarts.size){
		val start = excludedRangeStarts[index]
		val end = excludedRangeEnds[index+1]
		if(start <= nextEnd){
			nextEnd = Math.max(nextEnd, end)
		} else {
			if(nextEnd > 0){ simplifiedEnds.add(nextEnd) }
			simplifiedStarts.add(start)
			nextEnd = end
		}
		index += 1
	}
	if(nextEnd>0){ simplifiedEnds.add(nextEnd) }
	return Pair(simplifiedStarts, simplifiedEnds)
}