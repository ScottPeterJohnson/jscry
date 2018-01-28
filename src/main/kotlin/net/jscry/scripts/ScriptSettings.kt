package net.jscry.scripts

import com.google.common.cache.CacheBuilder
import com.google.common.cache.CacheLoader
import com.google.common.cache.LoadingCache
import net.jscry.database.enums.DefaultableBoolean
import net.jscry.database.tables.dsl.ScriptSettingsRow
import net.jscry.database.tables.dsl.scriptSettingsTable
import net.jscry.utility.*
import mu.KLogging
import net.justmachinery.kdbgen.from
import net.justmachinery.kdbgen.selectAll
import net.justmachinery.kdbgen.where
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.*
import java.util.concurrent.TimeUnit
import javax.servlet.http.HttpServletRequest


data class ToggleScriptEnabledRequest(val apiKey : UUID, val scriptUrl : String, val fromSourceMapUrl : String?, val enabled : DefaultableBoolean)

@RestController
class ToggleScriptEnabled : WebEndpoint<ToggleScriptEnabledRequest, Boolean>(){
	companion object : KLogging()

	@RequestMapping("rest/project/script/toggleEnabled")
	override fun run(httpRequest : HttpServletRequest): Boolean = standard(httpRequest, {
		val securityProof = checkApiAccess(httpRequest, it.apiKey)
		//language=PostgreSQL
		val statement = """
			INSERT INTO script_settings(api_key, url, from_source_map_url, collection_enabled)
			VALUES(:apiKey, :url, :fromSourceMapUrl, CAST(:enabled AS DEFAULTABLE_BOOLEAN))
			ON CONFLICT(api_key, url, from_source_map_url) DO UPDATE
				SET collection_enabled = excluded.collection_enabled
		"""
		sql.update(statement, mapOf(
				"apiKey" to it.apiKey,
				"url" to it.scriptUrl,
				"fromSourceMapUrl" to it.fromSourceMapUrl,
				"enabled" to it.enabled.toString()
		))
		WebResult(true, securityProof)
	})
}


val scriptSettingsCache: LoadingCache<String, List<ScriptSettingsRow>> = CacheBuilder.newBuilder()
		.maximumSize(100 * 1000)
		.expireAfterWrite(30, TimeUnit.MINUTES)
		.build(object : CacheLoader<String, List<ScriptSettingsRow>>() {
			override fun load(url: String): List<ScriptSettingsRow> {
				return getScriptSettings(url)
			}
		})

fun getScriptSettings(url : String) : List<ScriptSettingsRow> {
	return from(scriptSettingsTable).selectAll().where { it.url equalTo url }.query()
}


