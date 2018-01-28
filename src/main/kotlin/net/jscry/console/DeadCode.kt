package net.jscry.console

import net.jscry.database.tables.dsl.*
import net.jscry.executions.executionSumsAndUsesForScript
import net.jscry.scripts.ScriptId
import net.jscry.scripts.mapping.sourcemap.SourceMappings
import net.jscry.scripts.mapping.sourcemap.parseSourceMap
import net.jscry.utility.*
import mu.KLogging
import net.justmachinery.kdbgen.*
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.*
import javax.servlet.http.HttpServletRequest

enum class ExecutionCountType {
	TOTAL,
	PER_SESSION
}
data class DeadCodeScriptReference(val scriptId: Long, val url : String, val fromSourceMap : Boolean)
data class DeadCodeSearchRequest(val project : UUID, val scripts : List<DeadCodeScriptReference>, val countType : ExecutionCountType, val count : Double)
data class DeadCodeSite(val site : Int, val sum : Long, val useCount : Long)
data class DeadCodeSearchResult(val scriptId : Long, val url : String, val fromSourceMap : Boolean, val sites : List<DeadCodeSite>)

data class DeadCodeReport(
	val request : DeadCodeSearchRequest,
	val results : List<DeadCodeSearchResult>
)

@RestController
class DeadCodeSearch : WebEndpoint<DeadCodeSearchRequest, Long>() {
	companion object : KLogging()

	@RequestMapping("rest/project/deadcode")
	override fun run(httpRequest : HttpServletRequest) : Long = standard(httpRequest, { req ->
		val securityProof = checkApiAccess(httpRequest, req.project)
		//Either search against all scripts or a specific set, but get actual end-js script IDs
		val actualScripts : List<ScriptId> =
			if (req.scripts.isEmpty()) {
				//language=PostgreSQL
				val scriptsSql = "SELECT max(script_id) as script_id FROM scripts WHERE api_key = :apiKey GROUP BY url"
				sql.select(scriptsSql, mapOf("apiKey" to req.project), mapper = { it.long("script_id") })
			} else {
				req.scripts.map { it.scriptId }
			}.distinct()
		//Get all script content, all execution sums, and all executable sites
		val scriptContents = from(scriptContentTable).selectAll().where { it.scriptId within actualScripts }.query()
		val scriptAsts = scriptContents.map { acornGetExecutableSites(it.content) }
		val scriptUses = actualScripts.map(::executionSumsAndUsesForScript)
		val scriptToReference = req.scripts.groupBy { it.scriptId }
		//Filter each script
		val requestUrlIndexes = req.scripts.withIndex().associateBy({it.value.url}, {it.index})
		val results = actualScripts.mapIndexed { index, scriptId ->
			val contents = scriptContents[index]
			val sites = scriptAsts[index].sites
			val uses = scriptUses[index]
			val references = scriptToReference[scriptId]!!

			val deadSites = sites.map {
				val siteUses = uses[it]
				DeadCodeSite(it, siteUses?.sum ?: 0, siteUses?.sessionUseCount ?: 0)
			}.filter {
				if(it.useCount == 0L) true //Never used, must be dead
				else when(req.countType){
					ExecutionCountType.TOTAL -> it.sum < req.count
					ExecutionCountType.PER_SESSION -> it.sum / it.useCount < req.count
				}
			}
			if(references.size == 1 && !references.single().fromSourceMap){
				val single = references.single()
				listOf(DeadCodeSearchResult(scriptId, single.url, false, deadSites))
			} else {
				//Restrict and filter dead sites to only from the specified original sources for this script
				val sourceMap = parseSourceMap(contents.sourceMap!!)
				val sourceMapper = SourceMappings(sourceMap.mappings!!)
				val lines = StringWithLines(contents.content)
				deadSites.groupBy {
					val siteGeneratedPos = lines.atPos(it.site)!!
					val siteSourceMapping = sourceMapper.mapGeneratedToSource(siteGeneratedPos.line, siteGeneratedPos.column)
					if(siteSourceMapping.source != null){
						sourceMap.sources[siteSourceMapping.source]
					} else {
						null
					}
				}.mapNotNull { (url, sites) -> url?.let { DeadCodeSearchResult(scriptId, url, true, sites) } }
						.filter { requestUrlIndexes.containsKey(it.url) }
			}
		}.flatMap { it }.filter { it.sites.isNotEmpty() }

		val report = DeadCodeReport(results = results.sortedBy { requestUrlIndexes[it.url] }, request = req)
		val reportId = into(deadCodeReportsTable)
				.insert { values { it.apiKey(req.project).reportJson(gson.toJson(report))} }
				.returning(deadCodeReportsTable.reportId)
				.query().first().first
		WebResult(reportId, securityProof)
	})
}

data class DeadCodeReportDisplayRequest(val reportId : Long)
@RestController
class GetDeadCodeReportDisplay : WebEndpoint<DeadCodeReportDisplayRequest, DeadCodeReport?>() {
	companion object : KLogging()

	@RequestMapping("rest/project/deadcode/report")
	override fun run(httpRequest : HttpServletRequest) : DeadCodeReport? = standard(httpRequest, { req ->
		val reportRow = from(deadCodeReportsTable).selectAll().where { it.reportId equalTo req.reportId }.query().firstOrNull()
		if(reportRow == null){
			WebResult(null, checkApiAccess(httpRequest))
		}
		else {
			val securityProof = checkApiAccess(httpRequest, reportRow.apiKey)
			val report = reportRow.reportJson.let { gson.fromJson(it, DeadCodeReport::class.java)}
			WebResult(report, securityProof)
		}

	})
}