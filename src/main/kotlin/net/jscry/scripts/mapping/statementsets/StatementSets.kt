package net.jscry.scripts.mapping.statementsets

import net.jscry.database.tables.dsl.*
import net.jscry.utility.execute
import net.jscry.utility.multiValue
import net.jscry.utility.sql
import net.jscry.utility.intoChunks
import net.justmachinery.kdbgen.insert
import net.justmachinery.kdbgen.into

typealias StatementSetId = Long

data class FullStatementSet(val statementSetId : StatementSetId, val members : List<StatementSetMembersRow>)

private data class MergeResult(val existingSetId : Long, val newSetId : Long)
/**
 * Adds a set of statement set members rows, potentially merging some sets that are now equivalent
 */
fun addStatementSetMembers(members: List<StatementSetMembersRow>) {
	if (members.isNotEmpty()) {
		members.intoChunks(ofSize = 10 * 1000).forEach { chunk ->
			val (valuesSql, paramsList) = multiValue(chunk.map {
				listOf(it.scriptId,
						it.symbolPosition,
						it.statementSetId)
			})
			sql.transaction {
				//language=PostgreSQL
				val statement = """
			WITH
				insertRows("script_id", "symbol_position", "statement_set_id") AS (VALUES $valuesSql),
				updated AS (
					INSERT INTO statement_set_members(script_id, symbol_position, statement_set_id) SELECT * FROM insertRows
					ON CONFLICT(script_id, symbol_position) DO NOTHING RETURNING *
				)
			SELECT COALESCE(updated.statement_set_id, statement_set_members.statement_set_id) AS statement_set_id FROM insertRows
				LEFT JOIN updated USING("script_id", "symbol_position")
				LEFT JOIN statement_set_members USING ("script_id", "symbol_position")
			"""
				val resolved = sql.select(
						sql = statement,
						parameters = paramsList,
						mapper = { it.long("statement_set_id") }
				)
				val needsMerge: List<Pair<StatementSetId, List<StatementSetId>>> = chunk
						.mapIndexed { index, it ->
							MergeResult(existingSetId = resolved[index],
									newSetId = it.statementSetId)
						}
						//For every membership that couldn't be added because another statement set ID conflicted
						.filter { it.existingSetId != it.newSetId }
						.distinct()
						.map { mutableSetOf(it.existingSetId, it.newSetId) }
						//Find a transitive set of statement set IDs that can be said to be equal to update all to, with preference for earlier statement sets
						.let({ transitiveEqualSet(it) })
						.map {
							val min = it.min()!!
							Pair(min, it.minus(min).toList())
						}
				if (needsMerge.isNotEmpty()) {
					//language=PostgreSQL
					val merge = """UPDATE statement_set_members SET statement_set_id = :existingMappingSet WHERE statement_set_id IN (:newMappingSets)"""
					sql.batchUpdate(merge,
							needsMerge.map { mapOf("existingMappingSet" to it.first, "newMappingSets" to it.second) })
				}

			}
		}
	}
}

fun transitiveEqualSet(sets: List<MutableSet<StatementSetId>>) : List<Set<StatementSetId>> {
	val resultSets = mutableListOf<MutableSet<StatementSetId>>()
	val seenStatementSets = mutableMapOf<StatementSetId, MutableSet<StatementSetId>>()
	for(set in sets){
		val extant : MutableSet<StatementSetId>? = set
				.firstOrNull { seenStatementSets[it] != null }
				?.let { seenStatementSets[it] }
		val targetSet = extant ?: set
		for(statement in set){ seenStatementSets[statement] = targetSet }
		if(extant == null){
			resultSets.add(set)
		} else {
			extant.addAll(set)
		}
	}
	return resultSets
}

fun addStatementSetMappingFailures(failures : List<StatementSetMappingFailuresRow>){
	if(failures.isNotEmpty()) {
		into(statementSetMappingFailuresTable).insert {
			values(failures.map { failure ->
				{ it: StatementSetMappingFailuresTableInsertInit ->
					it
							.scriptId(failure.scriptId)
							.statementSetId(failure.statementSetId)
				}
			})
		}.execute()
	}
}