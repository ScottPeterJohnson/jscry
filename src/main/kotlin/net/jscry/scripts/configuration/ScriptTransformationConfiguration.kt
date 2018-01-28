package net.jscry.scripts.configuration

import net.jscry.database.tables.dsl.ScriptConfigurationsRow
import net.jscry.collection.ScriptConfigurationMessage
import net.jscry.utility.gson
import java.util.*

/**
 * Data class containing options for how clients annotate a script. Not directly sent to clients.
 */
data class ScriptConfiguration(
		val active : Boolean = true,
		val executions : Map<Int,Long> = mapOf(),
		//Individual statements to include/exclude
		val alwaysInclude : List<Int> = listOf(),
        val alwaysExclude : List<Int> = listOf(),
		//Swathes of statements to include/exclude, i.e. mapped sources within a file
        val excludedRangeStarts : List<Int> = listOf(),
        val excludedRangeEnds : List<Int> = listOf(),
		//Any code to insert
		val codeInserts : Map<Int,List<CodeInsert>> = mapOf()
)

data class CodeInsert(val scriptCommandId : Long, val code : String)

/**
 * Returns a "weight" for an execution count that preserves 3 significant figures on average.
 * IE for a statement executed 1000 times, there will be a 1/10 chance a client executes it, and it'll count as 10 when they do.
 */
fun weightExecutions(numberOfExecutions : Long) : Int {
	val magnitude = Math.log10(numberOfExecutions.toDouble())
	return Math.pow(10.0, Math.max(magnitude-2.0, 0.0)).toInt()
}

/**
 * Augment the QueryDSL generated type for convenience
 */
val ScriptConfigurationsRow.config: ScriptConfiguration
	get() = scriptConfigurationsRowCache.getOrPut(this, { gson.fromJson(this.json, ScriptConfiguration::class.java) })
private val scriptConfigurationsRowCache = Collections.synchronizedMap(WeakHashMap<ScriptConfigurationsRow, ScriptConfiguration>())


fun determineExcludedStatements(scriptConfiguration: ScriptConfiguration, seed : Int): List<Int> {
	val random = Random(seed.toLong())
	return scriptConfiguration.executions.entries.sortedBy { it.key }.fold(ArrayList(scriptConfiguration.executions.size), {
		list, entry ->
		if (entry.value > 1 && random.nextInt(weightExecutions(entry.value)) != 0) {
			list.add(entry.key)
		}
		list
	})
}

fun ScriptConfigurationsRow.toClientMessage(url : String, hash : Int, seed : Int) : ScriptConfigurationMessage {
	val configuration : ScriptConfiguration = this.config
	if(!configuration.active){ return inactiveClientMessage
	}
	val excluded = configuration.alwaysExclude.union(determineExcludedStatements(
			configuration,
			seed)).toList()
	return ScriptConfigurationMessage(
			active = true,
			url = url,
			hash = hash,
			scriptId = scriptId,
			excludedRangeStarts = configuration.excludedRangeStarts,
			excludedRangeEnds = configuration.excludedRangeEnds,
			excludedStatements = excluded,
			includedStatements = configuration.alwaysInclude,
			codeInserts = configuration.codeInserts,
			scriptConfigurationId = scriptConfigurationId,
			seed = seed
	)
}

val inactiveClientMessage = ScriptConfigurationMessage(
		active = false,
		url = "",
		hash = 0,
		scriptId = 0,
		excludedRangeStarts = listOf(),
		excludedRangeEnds = listOf(),
		excludedStatements = listOf(),
		includedStatements = listOf(),
		codeInserts = emptyMap(),
		scriptConfigurationId = 0,
		seed = 0
)