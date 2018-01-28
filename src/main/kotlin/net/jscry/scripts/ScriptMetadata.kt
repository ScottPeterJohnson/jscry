package net.jscry.scripts

import net.jscry.database.tables.dsl.scriptMetadataTable
import net.jscry.utility.query
import net.jscry.utility.sql
import net.justmachinery.kdbgen.from
import net.justmachinery.kdbgen.select
import net.justmachinery.kdbgen.where


fun incrementScriptUseCount(scriptId : Long) {
	//language=PostgreSQL
	val statement = """
		INSERT INTO script_metadata(script_id, use_count) VALUES (:scriptId, 1)
		ON CONFLICT(script_id) DO UPDATE SET use_count = script_metadata.use_count + 1
	"""
	sql.insert(statement, mapOf("scriptId" to scriptId), f={})
}
