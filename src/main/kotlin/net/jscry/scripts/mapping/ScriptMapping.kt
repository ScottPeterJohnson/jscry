package net.jscry.scripts.mapping

import net.jscry.database.tables.dsl.ScriptCommandsRow
import net.jscry.database.tables.dsl.ScriptContentRow
import net.jscry.database.tables.dsl.StatementSetMappingFailuresRow
import net.jscry.database.tables.dsl.StatementSetMembersRow
import net.jscry.scripts.ScriptId
import net.jscry.scripts.commands.ScriptCommandWithStatementSet
import net.jscry.scripts.getScriptContent
import net.jscry.scripts.mapping.diff.DiffingBatcher
import net.jscry.scripts.mapping.diff.VersionMapper
import net.jscry.scripts.mapping.statementsets.FullStatementSet
import net.jscry.scripts.mapping.statementsets.addStatementSetMappingFailures
import net.jscry.scripts.mapping.statementsets.addStatementSetMembers
import net.jscry.utility.log


sealed class ScriptMappingResult {
	class Success(val mapping : StatementSetMembersRow, val new : Boolean) : ScriptMappingResult()
	class Failure(val failure : StatementSetMappingFailuresRow) : ScriptMappingResult()
}

/**
 * Given a script and a list of targets, attempts to map every target position alternative to a symbol position within targetScriptId.
 * @param targets
 * List of statement sets that mapping should be attempted on.
 * Any filtering on known impossible targets (statement_set_mapping_failures) should already be done.
 * All targets should exist in database.
 * @return
 * List of script mapping results, matching elements in targets by index
 */
fun mapPositions(scriptIdToMapTo: ScriptId, scriptContent : ScriptContentRow, targets: List<FullStatementSet>) : List<ScriptMappingResult> {
	val triviallyResolved : List<ScriptMappingResult?> = targets.map {
		it.members.firstOrNull { it.scriptId == scriptIdToMapTo }?.let {
			ScriptMappingResult.Success(it, new = false)
		}
	}
	val unresolved : List<IndexedValue<FullStatementSet>> = triviallyResolved.withIndex().filter { it.value == null }.map { IndexedValue(it.index, targets[it.index]) }
	val unresolvedResults = mutableMapOf<Int, ScriptMappingResult>()

	if(unresolved.isNotEmpty()) {
		val picks = minimumSharedScriptSet(unresolved.map { it.value })

		val diffBatcher = DiffingBatcher()
		val scriptMappers : Map<ScriptId, VersionMapper> = picks.associateBy(keySelector={it}, valueTransform = {
			val oldContent = getScriptContent(it)!! //If we never got script content for it, there shouldn't be a mapping referencing it!
			diffBatcher.diffSourcesFromContent(oldContent, scriptContent)
		})

		for((index, target) in unresolved){
			val result: ScriptMappingResult? = target.members
					.map { member ->
						scriptMappers[member.scriptId] //Did we create a mapper for this option?
								?.mapOldTreeSymbolPositionToNew(member.symbolPosition) //Does it map over?
								?.let {
									ScriptMappingResult.Success(StatementSetMembersRow(
											scriptId = scriptIdToMapTo,
											symbolPosition = it,
											statementSetId = member.statementSetId
									), new = true)
								}
					}.firstOrNull()
			if(result != null){
				unresolvedResults[index] = result
			} else {
				log.warn { "Command $target could not be mapped to $scriptIdToMapTo."}
				//Record the failure
				unresolvedResults[index] = ScriptMappingResult.Failure(
						StatementSetMappingFailuresRow(
								scriptId = scriptIdToMapTo,
								statementSetId = target.statementSetId
						))
			}
		}
	}
	return triviallyResolved.withIndex().map { it.value ?: unresolvedResults[it.index]!! }
}

fun addNewMappingsToDatabase(mappings : List<ScriptMappingResult>){
	addStatementSetMembers(mappings.filterIsInstance(ScriptMappingResult.Success::class.java).filter { it.new }.map { it.mapping })
	addStatementSetMappingFailures(mappings.filterIsInstance(ScriptMappingResult.Failure::class.java).map { it.failure })
}

/**
 * For every script command, find where it should be applied to this script version
 */
fun mapCommandPositions(scriptContent : ScriptContentRow, scriptCommands : List<ScriptCommandWithStatementSet>) : List<ScriptCommandsRow> {
	val targets : List<FullStatementSet> = scriptCommands.map({ it.statementSet })
	val mappings = mapPositions(scriptContent.scriptId, scriptContent, targets)
	addNewMappingsToDatabase(mappings)
	return scriptCommands.mapIndexed { index, command ->
		val mapping = mappings[index]
		when(mapping){
			is ScriptMappingResult.Success -> command.command.copy(
					scriptId = mapping.mapping.scriptId,
					symbolPosition = mapping.mapping.symbolPosition
			)
			//This command could not be mapped to this script version
			else -> null
		}

	}.filterNotNull()
}


/**
 * Finds a close to minimum set of script ids that cover one item in each statement set
 * Actually solving this, as it turns out, is a set cover problem, which is NP-hard, so this is just a greedy approximation
 */
private fun minimumSharedScriptSet(unresolved : List<FullStatementSet>) : Set<ScriptId> {
	val unresolvedScriptOptions : MutableSet<ScriptId> = unresolved.flatMap { it.members.map { it.scriptId } }.toMutableSet()
	val picked = mutableSetOf<Long>()
	val remainingIndexes = unresolved.indices.toMutableSet()
	while (remainingIndexes.isNotEmpty()) {
		var winningVersion = -1L
		var maxItemsCovered = listOf<Int>()
		for (optionScriptId in unresolvedScriptOptions) {
			//How many commands would selecting this script eliminate?
			val itemsCovered = remainingIndexes.filter { unresolved[it].members.any { it.scriptId == optionScriptId } }
			//Is it the best for this step?
			if (itemsCovered.size > maxItemsCovered.size) {
				maxItemsCovered = itemsCovered
				winningVersion = optionScriptId
			}
		}
		//Add the winner, and narrow down both our options and our required indexes
		picked += winningVersion
		unresolvedScriptOptions -= winningVersion
		remainingIndexes -= maxItemsCovered
	}
	return picked
}