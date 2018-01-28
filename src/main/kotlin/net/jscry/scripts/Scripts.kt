package net.jscry.scripts

import net.jscry.build.IntJsMap
import net.jscry.console.getUserAccessibleApiKeys
import net.jscry.console.userId
import net.jscry.database.tables.dsl.ScriptCommandsRow
import net.jscry.database.tables.dsl.ScriptSettingsRow
import net.jscry.database.tables.dsl.ScriptsRow
import net.jscry.database.tables.dsl.scriptsTable
import net.jscry.executions.SumAndUseCount
import net.jscry.executions.executionSumsAndUsesForScript
import net.jscry.scripts.commands.loadScriptCommands
import net.jscry.scripts.mapping.mapCommandPositions
import net.jscry.scripts.mapping.sourcemap.StandardizedSourceMap
import net.jscry.scripts.mapping.sourcemap.parseSourceMap
import net.jscry.utility.*
import mu.KLogging
import net.justmachinery.kdbgen.from
import net.justmachinery.kdbgen.selectAll
import net.justmachinery.kdbgen.where
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseBody
import org.springframework.web.bind.annotation.RestController
import java.util.*
import javax.servlet.http.HttpServletRequest

typealias ScriptId = Long
typealias SymbolPosition = Int

data class ScriptGetOrCreateResult(val scriptId: ScriptId, val needsContent : Boolean)

data class ScriptClientView(
		val apiKey: UUID,
		val scriptId: Long,
		val url: String,
		val source: Source,
		val executionSums: IntJsMap<SumAndUseCount>,
		val settings : List<ScriptSettingsRow>,
		val commands : IntJsMap<List<ScriptCommandsRow>>
)

data class Source(
		val text: String?,
		val sourceMap: StandardizedSourceMap?
)

data class ScriptIdentifier(
		val apiKey : UUID,
		val url : String,
		val hash : Int
)

data class GetScriptRequest(val scriptId: Long)
@RestController
class GetScript : WebEndpoint<GetScriptRequest, ScriptClientView>() {
	@RequestMapping("rest/project/script") @ResponseBody
	override fun run(httpRequest : HttpServletRequest): ScriptClientView = standard(httpRequest) {
		val script = getScriptClientView(it.scriptId)
		val securityProof = checkApiAccess(httpRequest, script.apiKey)
		WebResult(script, securityProof)
	}
}


private val scriptsCache = MaybeLoadingCacheView<ScriptId, ScriptsRow>(183, { key ->
	from(scriptsTable).selectAll().where { it.scriptId equalTo key }.query().firstOrNull()
})
private val scriptIdentifierCache = LoadingCacheView<ScriptIdentifier, ScriptId>(184, { key ->
	//language=PostgreSQL
	val statement = """
		INSERT INTO scripts(api_key, url, hash) VALUES (:apiKey, :url, :hash)
		ON CONFLICT(api_key, url, hash) DO UPDATE SET hash = excluded.hash RETURNING script_id
	""".trimIndent()
	sql.select(statement, mapOf("apiKey" to key.apiKey, "url" to key.url, "hash" to key.hash), mapper = { it.long("script_id" )}).first()
})

fun getOrCreateScriptId(apiKey : UUID, url : String, hash : Int) : ScriptId {
	return scriptIdentifierCache.load(ScriptIdentifier(apiKey, url, hash))
}

fun getScriptRow(scriptId : Long) : ScriptsRow {
	return scriptsCache.maybeLoad(scriptId) ?: throw IllegalArgumentException("Script $scriptId does not exist")
}
fun getScriptClientView(scriptId : Long) : ScriptClientView {
	val script = getScriptRow(scriptId)
	val scriptSettings = scriptSettingsCache.get(script.url)
	val scriptContent = getScriptContent(script.scriptId)
	val sourceMap = if (scriptContent?.sourceMap == null) null else parseSourceMap(
			scriptContent.sourceMap)
	val executionSums = executionSumsAndUsesForScript(script.scriptId)
	val originalCommands = loadScriptCommands(script.scriptId, script.url)
	val mappedCommands : List<ScriptCommandsRow> = if(scriptContent != null) {
		mapCommandPositions(scriptContent, originalCommands)
	} else {
		originalCommands.filter { it.command.scriptId == script.scriptId }.map { it.command }
	}
	return ScriptClientView(
			apiKey = script.apiKey,
			scriptId = script.scriptId,
			url = script.url,
			source = Source(
					text = scriptContent?.content,
					sourceMap = sourceMap
			),
			executionSums = IntJsMap(executionSums),
			settings = scriptSettings,
			commands = IntJsMap(mappedCommands.groupBy { it.symbolPosition })
	)
}

data class GetScriptsRequest(val apiKey: UUID?, val showOriginal: Boolean)
data class ScriptSummary(val apiKey: UUID, val url: String, val fromSourceMap: Boolean, val versions: List<Long>)
@RestController
class GetScripts : WebEndpoint<GetScriptsRequest, List<ScriptSummary>>() {
	companion object : KLogging()

	@RequestMapping("rest/project/scripts")
	override fun run(httpRequest : HttpServletRequest): List<ScriptSummary> = standard(httpRequest, {
		val securityProof = checkApiAccess(httpRequest, it.apiKey)
		val apiKeys = if(it.apiKey == null) getUserAccessibleApiKeys(httpRequest.userId()) else setOf(it.apiKey)

		val statement: String
		if (it.showOriginal) {
			//language=PostgreSQL
			statement = """
				WITH entries AS (SELECT DISTINCT api_key, url FROM scripts WHERE api_key IN (:apiKeys))
				SELECT api_key,
					coalesce(script_source_mapped_scripts.url, entries.url) as url2,
					array_agg(script_id ORDER BY script_id DESC) as versions,
					script_source_mapped_scripts.url IS NOT NULL AS from_source_map
				FROM entries
					JOIN scripts USING (api_key, url)
					LEFT JOIN script_source_mapped_scripts USING (script_id)
				GROUP BY api_key, url2, from_source_map
			"""
		} else {
			//language=PostgreSQL
			statement = """
				SELECT
				  api_key,
				  url as url2,
				  FALSE AS FROM_SOURCE_MAP,
				  array_agg(script_id ORDER BY script_id DESC) AS versions
				FROM scripts WHERE api_key IN (:apiKeys) GROUP BY api_key, url;
			"""
		}
		val scripts = sql.select(statement, mapOf("apiKeys" to apiKeys), mapper = {
			ScriptSummary(
					it.uuid("api_key"),
					it.string("url2"),
					it.boolean("from_source_map"),
					it.array("versions")
			)
		})
		WebResult(scripts, securityProof)
	})
}