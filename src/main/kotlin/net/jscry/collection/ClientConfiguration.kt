package net.jscry.collection

import com.google.gson.Gson
import net.jscry.Server
import net.jscry.database.tables.dsl.ProjectsRow
import net.jscry.httpsHost
import net.jscry.projects.lookupCachedProject
import net.jscry.scripts.configuration.cachedScriptConfigurationFor
import net.jscry.scripts.configuration.stale
import net.jscry.scripts.configuration.toClientMessage
import net.jscry.scripts.getScriptRow
import net.jscry.scripts.predictedPageScripts
import net.jscry.utility.ClientVisible
import net.jscry.utility.matchOrNull
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.util.*
import java.util.concurrent.ThreadLocalRandom
import javax.servlet.http.HttpServletRequest
import javax.servlet.http.HttpServletResponse

@RestController
class ClientConfiguration {
	@RequestMapping("web/config.js", produces = arrayOf("application/javascript"))
	fun config(@RequestParam apiKey: String, request : HttpServletRequest, response : HttpServletResponse) : String? {
		val apiKeyAsUuid = UUID.fromString(apiKey)
		val project = lookupCachedProject(apiKeyAsUuid)
		if (project == null) {
			response.sendError(400, "API key invalid")
			return null
		}
		val config : ClientConfig
		var cacheTime : Long = Server.config.webEmbedHeaderConfigurationCachePeriodSeconds.seconds
		if(!project.enabled){
			config = disabledConfig
		} else {
			val predictedScripts = predictedPageScripts(apiKeyAsUuid,
					net.jscry.utility.normalizedUrl(request.getHeader("Referer")))
			val predictedConfigurations = predictedScripts
					.map { cachedScriptConfigurationFor(it) }
			//If we're missing a configuration or any we're returning are stale, clients shouldn't cache the config
			if(predictedConfigurations.isEmpty() || predictedConfigurations.any { it == null || it.stale() }){
				cacheTime = 0L
			}
			val sendingConfigurations = predictedConfigurations
					.filterNotNull()
					.map {
						val script = getScriptRow(it.scriptId)
						val seed = ThreadLocalRandom.current().nextInt()
						it.toClientMessage(script.url, script.hash, seed)
					}
			config = ClientConfig(
					apiKey = apiKey,
					submissionUrl = "https://${Server.config.httpsHost()}/test",
					submissionWebSocketUrl = "wss://${Server.config.httpsHost()}${webSocketCollectionPath}",
					sourceMapUrl = "https://${Server.config.httpsHost()}/sourceMap",
					shouldTransformPageExpression = finalShouldTransformPageExpression(project),
					shouldTransformScriptExpression = finalShouldTransformScriptExpression(project),
					prefetchedScriptConfigurations = sendingConfigurations,
					corsAllowedPatterns = project.corsAllowedPatterns
			)
		}
		response.addHeader("Cache-Control", "private, max-age=$cacheTime")
		return "window.\$JC=" + Gson().toJson(config)
	}
}

val disabledConfig = ClientConfig(apiKey = "",
		submissionUrl = "",
		submissionWebSocketUrl = "",
		sourceMapUrl = "",
		shouldTransformPageExpression = "false",
		shouldTransformScriptExpression = "false",
		prefetchedScriptConfigurations = emptyList(),
		corsAllowedPatterns = emptyList())

fun finalShouldTransformScriptExpression(project : ProjectsRow) : String {
	return project.shouldTransformScriptExpression?.matchOrNull { it.isNotBlank() } ?: "true"
}

fun finalShouldTransformPageExpression(project : ProjectsRow) : String {
	var expression = project.shouldTransformPageExpression?.matchOrNull { it.isNotBlank() } ?: "true"
	if(project.runOnMobileBrowsers == false || project.runOnMobileBrowsers == null){
		//Honestly mobile detection is a bit ridiculous.
		//https://developer.mozilla.org/en-US/docs/Web/HTTP/Browser_detection_using_the_user_agent#Mobile_Tablet_or_Desktop
		val mobiDetect = "(navigator.userAgent.indexOf(\"Mobi\") == -1)"
		expression = mobiDetect + " && " + expression
	}
	return expression
}


data class ClientConfig(
		val apiKey: String,
		val submissionUrl: String,
		val submissionWebSocketUrl: String,
		val sourceMapUrl : String,
		val shouldTransformPageExpression: String,
		val shouldTransformScriptExpression : String,
		val prefetchedScriptConfigurations : List<ScriptConfigurationMessage>,
		val corsAllowedPatterns : List<String>
) : ClientVisible