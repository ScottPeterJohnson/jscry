package net.jscry.scripts.mapping.diff

import net.jscry.database.tables.dsl.ScriptContentRow
import net.jscry.database.tables.dsl.ScriptsRow
import net.jscry.database.tables.dsl.StatementSetMembersRow
import net.jscry.scripts.ScriptId
import net.jscry.scripts.getScriptContent
import net.jscry.scripts.getScriptRow
import net.jscry.scripts.mapping.statementsets.StatementSetId
import net.jscry.scripts.mapping.statementsets.addStatementSetMembers
import net.jscry.utility.dataClassMapper
import net.jscry.utility.log
import net.jscry.utility.sql

val newScriptMappingLookback : Int = 4
fun mapNewScript(newScriptId : ScriptId, performant : Boolean = true) {
	log.debug { "Mapping new script $newScriptId" }
	val newScriptRow = getScriptRow(newScriptId)
	val newScriptContent = getScriptContent(newScriptId)!!
	val previousVersions = lastVersionsOf(newScriptRow,
			count = newScriptMappingLookback)
	log.debug { "Found ${previousVersions.size} previous versions to map against script $newScriptId" }
	val seenStatementSets = mutableSetOf<StatementSetId>()
	val newScriptStatementSetMemberships = mutableListOf<StatementSetMembersRow>()
	val diffBatcher = DiffingBatcher()
	for((previousVersionContent, previousVersionSets) in previousVersions){
		val hasAnyUnseen = previousVersionSets.any { !seenStatementSets.contains(it.statementSetId) }
		if(hasAnyUnseen || !performant) {
			val matcher = diffBatcher.diffSourcesFromContent(previousVersionContent, newScriptContent)
			for (membership in previousVersionSets) {
				if (!seenStatementSets.contains(membership.statementSetId)) {
					val mapping = matcher.mapOldTreeSymbolPositionToNew(membership.symbolPosition)
					if (mapping != null) {
						seenStatementSets.add(membership.statementSetId)
						newScriptStatementSetMemberships.add(StatementSetMembersRow(
								scriptId = newScriptId,
								symbolPosition = mapping,
								statementSetId = membership.statementSetId
						))
					} else {
						log.trace { "Failed to map $membership"}
					}
				}
			}
		}
	}
	addStatementSetMembers(newScriptStatementSetMemberships)
	//language=PostgreSQL
	val statement = "INSERT INTO script_metadata(script_id, mapped) VALUES (:script_id, true) ON CONFLICT(script_id) DO UPDATE set mapped = true"
	sql.insert(statement, mapOf("script_id" to newScriptId), f={})
	log.debug { "New script mapping complete for $newScriptId" }
}

data class ScriptContentAndMappedSymbols(val content : ScriptContentRow, val mappedSymbols : List<StatementSetMembersRow>)
fun lastVersionsOf(script: ScriptsRow, count: Int): List<ScriptContentAndMappedSymbols> {
	val contentRowMapper = dataClassMapper(ScriptContentRow::class)
	//language=PostgreSQL
	val statement = """
		SELECT script_content.*, coalesce(arrs.symbol_positions, '{}') as symbol_positions, coalesce(arrs.statement_set_ids, '{}') as statement_set_ids
		FROM script_content
			JOIN scripts ON url = :url AND scripts.script_id = script_content.script_id
			LEFT JOIN LATERAL (SELECT array_agg(statement_set_members.symbol_position) symbol_positions, array_agg(statement_set_members.statement_set_id) statement_set_ids FROM statement_set_members WHERE script_id = script_content.script_id) arrs ON TRUE
		WHERE script_content.script_id < :scriptId
		ORDER BY script_id DESC
		LIMIT :count
	"""
	return sql.select(statement,
			mapOf("url" to script.url, "scriptId" to script.scriptId, "count" to count),
			mapper = {
				val content = contentRowMapper(it)
				val symbolPositions : List<Int?> = it.array("symbol_positions")
				val statementSetIds : List<Long?> = it.array("statement_set_ids")
				val members = symbolPositions.filterNotNull().zip(statementSetIds.filterNotNull()).map {
					(symbolPosition, statementSetId) -> StatementSetMembersRow(
						scriptId = content.scriptId,
						symbolPosition = symbolPosition,
						statementSetId = statementSetId
				)
				}
				ScriptContentAndMappedSymbols(content, members)
			})
}