package net.jscry.scripts

import net.jscry.collection.ScriptContentMessage
import net.jscry.database.tables.dsl.*
import net.jscry.projects.loadProject
import net.jscry.scripts.mapping.sourcemap.extractSourceMap
import net.jscry.utility.*
import net.justmachinery.kdbgen.*
import java.util.*

val scriptHasContentCache = PresenceCache<Long>(508, {
	//language=PostgreSQL
	val statement = "select 1 from script_content where script_id = :scriptId"
	sql.select(statement, mapOf("scriptId" to it), mapper = { true }).firstOrNull() ?: false
})

fun getScriptContent(scriptId: Long) : ScriptContentRow? {
	return from(scriptContentTable).selectAll().where { it.scriptId equalTo scriptId}.query().firstOrNull()
}

fun saveScriptContent(apiKey : UUID, scriptId: Long, content : String){
	val script = getScriptRow(scriptId)
	assert(script.apiKey == apiKey) { "Attempt to save content on $scriptId with non-matching api keys $apiKey, ${script.apiKey}" }
	assert(stringHash(content) == script.hash) { "On $scriptId, script hash of ${script.hash} does not equal computed hash ${stringHash(content)}" }
	assert(getScriptContent(scriptId) == null) { "Attempt to save new content to script which already has it: $scriptId" }
	into(scriptContentTable).insert { values { it.scriptId(script.scriptId).content(content) } }.execute()
}

fun checkForAndSaveSourceMap(apiKey : UUID, script : ScriptContentMessage){
	val project = loadProject(apiKey)!!
	val sourceMap = extractSourceMap(project, script)
	if(sourceMap != null){
		from(scriptContentTable).update { it.sourceMap setTo gson.toJson(sourceMap) }.where { it.scriptId equalTo script.scriptId }.execute()
		val normalizedSources = sourceMap.sources.map(::tryNormalizedUrl)
		if(normalizedSources.isNotEmpty()) {
			into(scriptSourceMappedScriptsTable)
					.insert {
						values(normalizedSources.map { source ->
							{ it: ScriptSourceMappedScriptsTableInsertInit -> it.scriptId(script.scriptId).url(source) }
						})
					}
					.execute()
		}
	}
}

