package net.jscry.scripts.mapping.sourcemap

import net.jscry.Server
import net.jscry.scripts.*
import net.jscry.scripts.configuration.newScriptConfigurationFor
import net.jscry.scripts.configuration.scriptConfigurationById
import net.jscry.scripts.configuration.toClientMessage
import net.jscry.utility.applyTransformations
import net.jscry.utility.getTransformations
import net.jscry.utility.gson
import net.jscry.utility.stringHash
import mu.KLogging
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.util.*
import javax.servlet.http.HttpServletResponse

/**
 * Renders a source map for debugging that accounts for the jScry transformations on the JS and any original source map
 */
@RestController
class SourceMapController {
	companion object : KLogging()

	@RequestMapping("sourceMap", produces = arrayOf("application/json"))
	fun getSourceMap(resp : HttpServletResponse, @RequestParam scriptConfigurationId: Long, @RequestParam seed : Int, @RequestParam url : String): String? {
		logger.info { "Generating sourcemap for $url, configuration $scriptConfigurationId"}
		//Fetch all the data pieces we'll need to render a source map
		val scriptConfiguration = scriptConfigurationById(scriptConfigurationId)
		if(scriptConfiguration == null){
			logger.warn { "$scriptConfigurationId: Script configuration not found" }
			resp.sendError(404, "Script configuration not found")
			return null
		}
		val script = getScriptRow(scriptConfiguration.scriptId)
		val content = getScriptContent(scriptConfiguration.scriptId)
		if(content == null){
			logger.warn { "$scriptConfigurationId: No script content" }
			resp.sendError(404, "Content unavailable")
			return null
		}

		val clientConfigurationMessage = scriptConfiguration.toClientMessage(
				url = script.url,
				hash = script.hash,
				seed = seed
		)
		//Use the embedded JS engine to get the same transformations that the client would've applied
		val transformations = getTransformations(content.content, clientConfigurationMessage)

		//Transform!
		return gson.toJson(jScryToOriginalSourceMap(
				scriptUrl = url,
				content = content.content,
				originalSourceMapJson = content.sourceMap,
				transformations = transformations
		))
	}

	@RequestMapping("sourceContent", produces = arrayOf("application/javascript"))
	fun getSourceContent(resp : HttpServletResponse, @RequestParam scriptConfigurationId: Long) : String? {
		if(!Server.config.enableTestEndpoints){ resp.sendError(404); return null }
		val scriptConfiguration = scriptConfigurationById(scriptConfigurationId)!!
		val content = getScriptContent(scriptConfiguration.scriptId)
		return content!!.content
	}
	@RequestMapping("transformedContent", produces = arrayOf("application/javascript"))
	fun getTransformedContent(resp : HttpServletResponse, @RequestParam scriptConfigurationId: Long, @RequestParam seed : Int) : String? {
		if(!Server.config.enableTestEndpoints){ resp.sendError(404); return null }
		val scriptConfiguration = scriptConfigurationById(scriptConfigurationId)!!
		val script = getScriptRow(scriptConfiguration.scriptId)
		val content = getScriptContent(scriptConfiguration.scriptId)!!
		val clientConfigurationMessage = scriptConfiguration.toClientMessage(
				url = script.url,
				hash = script.hash,
				seed = seed
		)
		return applyTransformations(content.content, clientConfigurationMessage)
	}
	@RequestMapping("generateSimpleJsTestConfig")
	fun generateTestConfig(resp : HttpServletResponse) : String? {
		if(!Server.config.enableTestEndpoints){ resp.sendError(404); return null }
		val testUUID = UUID.fromString("e5b72ba4-9c06-47aa-86b3-193b78732aa9")
		val scriptContent = ClassLoader.getSystemClassLoader().getResourceAsStream("static/web/test.js").reader().readText()
		val script = getOrCreateScriptId(testUUID, "localhost:8080/web/test.js", stringHash(scriptContent))
		val needsContent = !scriptHasContentCache.present(script)
		if(needsContent){
			saveScriptContent(testUUID, script, scriptContent)
		}
		return newScriptConfigurationFor(script)!!.scriptConfigurationId.toString()
	}
}