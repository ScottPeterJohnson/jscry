package net.jscry.executions

import net.jscry.scripts.ScriptId
import net.jscry.scripts.SymbolPosition
import net.jscry.utility.sql


fun executionSumsForScript(scriptId: ScriptId) : Map<SymbolPosition, Long> {
	//language=PostgreSQL
	val statement = """
		SELECT symbol_position, weighted_execution_sum
		FROM statement_set_members
		JOIN statement_sets ON statement_sets.statement_set_id = statement_set_members.statement_set_id
		WHERE statement_set_members.script_id = :scriptId
	"""
	return sql.select(statement, mapOf("scriptId" to scriptId), mapper = { Pair(it.int("symbol_position"), it.long("weighted_execution_sum")) })
			.associateBy(keySelector = {it.first}, valueTransform = { it.second })
}

data class SumAndUseCount(val sum : Long, val sessionUseCount: Long)
fun executionSumsAndUsesForScript(scriptId: ScriptId) : Map<SymbolPosition, SumAndUseCount> {
	//language=PostgreSQL
	val statement = """
		SELECT symbol_position, weighted_execution_sum, use_count
		FROM statement_set_members
		JOIN statement_sets ON statement_sets.statement_set_id = statement_set_members.statement_set_id
		JOIN script_sets ON statement_sets.script_set = script_sets.script_set_id
		WHERE statement_set_members.script_id = :scriptId
	"""
	return sql.select(statement, mapOf("scriptId" to scriptId), mapper = { Pair(it.int("symbol_position"),
			SumAndUseCount(it.long("weighted_execution_sum"), it.long("use_count"))) })
			.associateBy(keySelector = {it.first}, valueTransform = { it.second })
}

fun updateExecutionSums() {
	//Call the UPDATE FUNCTION via select
	//language=PostgreSQL
	val statement = "SELECT * FROM update_execution_sums()"
	sql.select(statement,
			mapOf(),
			mapper = {})
}