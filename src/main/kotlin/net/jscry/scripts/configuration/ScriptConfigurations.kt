package net.jscry.scripts.configuration

import net.jscry.Server.Companion.config
import net.jscry.database.tables.dsl.ScriptConfigurationsRow
import net.jscry.database.tables.dsl.scriptConfigurationsTable
import net.jscry.scripts.ScriptId
import net.jscry.utility.*
import net.justmachinery.kdbgen.from
import net.justmachinery.kdbgen.selectAll
import net.justmachinery.kdbgen.where
import java.sql.Timestamp
import java.util.*
import java.util.concurrent.Future


private val scriptConfigurationExpirationMillis : Long = 30 * 60 * 1000
fun ScriptConfigurationsRow.stale() : Boolean {
	val lastAcceptableTime = Timestamp(Date().time - scriptConfigurationExpirationMillis)
	return this.time.before(lastAcceptableTime)
}

private val scriptConfigurationCache = MaybeLoadingCacheView<Long, ScriptConfigurationsRow>(127, { key ->
	from(scriptConfigurationsTable).selectAll().where { it.scriptConfigurationId equalTo key }.query().firstOrNull()
})

fun scriptConfigurationById(scriptConfigurationId : Long) : ScriptConfigurationsRow? {
	return scriptConfigurationCache.maybeLoad(scriptConfigurationId)
}

private val scriptConfigurationByScriptIdCache = MaybeLoadingCacheView<ScriptId, ScriptConfigurationsRow>(128, { key ->
	//language=PostgreSQL
	val statement = """SELECT * FROM script_configurations WHERE script_id = :scriptId ORDER BY TIME DESC LIMIT 1"""
	val scriptConfig = sql.select(statement, mapOf("scriptId" to key), mapper= dataClassMapper(ScriptConfigurationsRow::class)).firstOrNull()
	scriptConfig
})

fun cachedScriptConfigurationFor(scriptId : ScriptId) : ScriptConfigurationsRow? {
	val configuration by lazy { scriptConfigurationByScriptIdCache.maybeLoad(scriptId) }
	if(config.disableCaching || configuration == null){
		return null
	} else {
		//Construct a new configuration in the background, but give the outdated one to this client.
		if(configuration.stale()) {
			constructConfiguration(scriptId)
		}
		return configuration
	}
}
fun newScriptConfigurationFor(scriptId : Long) : ScriptConfigurationsRow? {
	val newConfigurationFuture = constructConfiguration(scriptId)
	return newConfigurationFuture.get()
}

private val configurationGeneration = SingleConcurrentComputation<Long, ScriptConfigurationsRow?>()
private fun constructConfiguration(scriptId: Long): Future<ScriptConfigurationsRow?> {
	return future({ configurationGeneration.compute(scriptId, {
		val id = requestScriptConfiguration(scriptId).invoke()
		if(id == null){ null }
		else {
			val result = from(scriptConfigurationsTable).selectAll().where { it.scriptConfigurationId equalTo id }.query().first()
			scriptConfigurationByScriptIdCache.put(id, result)
			result
		}
	}) })
}