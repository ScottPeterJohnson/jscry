package net.jscry.collection

import net.jscry.database.tables.dsl.*
import net.jscry.scripts.configuration.ScriptConfiguration
import net.jscry.scripts.configuration.weightExecutions
import net.jscry.utility.background
import net.jscry.utility.execute
import net.jscry.utility.sql
import net.justmachinery.kdbgen.insert
import net.justmachinery.kdbgen.into

fun recordCollectionData(sessionId: Long, scriptConfigurations: Map<Long, ScriptConfiguration>, data: CollectionData) {
	if(data.executionData.isNotEmpty()){
		//Submit to the unsummed table to be added to execution sums
		submitUnsummed(data, scriptConfigurations)
		submitCodeResults(sessionId, data.addedCodeResults)
		background {
			//Log for auditing
			recordLines(sessionId, scriptConfigurations, data)
		}
	}
}

private fun submitUnsummed(data : CollectionData, scriptConfigurations: Map<Long, ScriptConfiguration>){
	sql.transaction {
		//language=PostgreSQL
		val insertExecutedLine = """
		INSERT INTO unsummed_executed_lines(script_id, symbol_position, weighted_executions) VALUES (:scriptId, :symbolPosition, :weightedExecutions)
		"""
		sql.batchInsert(insertExecutedLine, data.executionData.entries.flatMap {
			val (scriptId, executions) = it
			val script: ScriptConfiguration = scriptConfigurations[scriptId]!!
			executions.map {
				val weight: Int = script.executions[it.key.toInt()]?.let(::weightExecutions) ?: 1
				mapOf("scriptId" to scriptId,
						"symbolPosition" to it.key.toInt(),
						"weightedExecutions" to weight * it.value)
			}
		}, f = {})
	}
}

private fun submitCodeResults(sessionId : Long, results : List<AddedCodeResult>){
	if(results.isNotEmpty()) {
		into(scriptCommandAddedCodeResultsTable).insert {
			values(results.map { result ->
				{ it: ScriptCommandAddedCodeResultsTableInsertInit ->
					it
							.scriptCommandId(result.scriptCommandId)
							.result(result.result)
							.transformedSessionId(sessionId)
				}
			})
		}.execute()
	}
}

private fun recordLines(sessionId : Long, scriptConfigurations : Map<Long, ScriptConfiguration>, data : CollectionData){
	sql.transaction {
		//language=PostgreSQL
		val insertExecutedLine = """
		INSERT INTO executed_lines_log(script_id, transformed_session_id, symbol_position, weighted_executions) VALUES (:scriptId, :sessionId, :symbolPosition, :weightedExecutions)
			ON CONFLICT(script_id, transformed_session_id, symbol_position) DO UPDATE SET weighted_executions = executed_lines_log.weighted_executions + excluded.weighted_executions
		"""
		sql.batchInsert(insertExecutedLine, data.executionData.entries.sortedBy { it.key }.flatMap {
			val (scriptId, executions) = it
			val script: ScriptConfiguration = scriptConfigurations[scriptId]!!
			executions.entries.sortedBy { it.key }.map {
				val weight: Int = script.executions[it.key.toInt()]?.let(::weightExecutions) ?: 1
				mapOf("scriptId" to scriptId,
						"sessionId" to sessionId,
						"symbolPosition" to it.key.toInt(),
						"weightedExecutions" to weight * it.value)
			}
		}, f = {})
	}
}