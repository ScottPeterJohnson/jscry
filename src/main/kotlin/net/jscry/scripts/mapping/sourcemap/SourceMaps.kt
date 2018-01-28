package net.jscry.scripts.mapping.sourcemap

import com.google.api.client.http.GenericUrl
import com.google.api.client.http.HttpHeaders
import com.google.common.io.BaseEncoding
import com.google.gson.JsonSyntaxException
import net.jscry.collection.ScriptContentMessage
import net.jscry.database.tables.dsl.*
import net.jscry.projects.loadProject
import net.jscry.scripts.ScriptId
import net.jscry.scripts.getScriptContent
import net.jscry.scripts.getScriptRow
import net.jscry.utility.*
import net.justmachinery.kdbgen.*
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import java.io.IOException
import java.net.URL
import java.nio.charset.StandardCharsets
import javax.servlet.http.HttpServletRequest

data class UploadSourcemapResponse(val error : String?)
@RestController
class UploadSourcemap : WebEndpoint<EmptyRequest, UploadSourcemapResponse>() {
	override fun run(httpRequest: HttpServletRequest): UploadSourcemapResponse { throw IllegalStateException("Impossible") }

	@RequestMapping("rest/project/script/sourcemap/upload")
	fun run(httpRequest : HttpServletRequest, @RequestParam scriptId : ScriptId, @RequestParam file : MultipartFile) : UploadSourcemapResponse {
		val script = getScriptRow(scriptId)
		checkApiAccess(httpRequest, script.apiKey)

		try {
			/*TODO: Minor problem: we didn't store the protocol for the script's URL to resolve sourcemaps against,
				so if they supply us a sourcemap that requires further resolution, well...*/
			val project = loadProject(script.apiKey)!!
			val standardized = parseSourceMap(project,
					"https://" + script.url,
					file.bytes.toString(Charsets.UTF_8))
			//Check this sourcemap makes sense for the script content we have
			val scriptGeneratedLines = getScriptContent(scriptId)!!.content.lines()
			val map = SourceMappings(standardized.mappings!!)
			for((line, mapping) in map.generatedLines){
				if(line>scriptGeneratedLines.size){
					return UploadSourcemapResponse("More mapped lines than actual lines. Is this the right source map for this version? (${map.generatedLines.keys.max()} in sourcemap vs $scriptGeneratedLines in source)")
				} else {
					for(entry in mapping.entries){
						val maxActualLength = scriptGeneratedLines[line].length
						if(entry.generatedColumn > maxActualLength){
							return UploadSourcemapResponse("On line $line, mapping for column ${entry.generatedColumn} when line ends at column $maxActualLength. Is this the right source map for this version?")
						}
					}
				}
			}
			//Save
			sql.transaction {
				from(scriptContentTable).update { it.sourceMap to gson.toJson(standardized) }.where { it.scriptId equalTo scriptId }.execute()
				from(scriptSourceMappedScriptsTable).delete().where { it.scriptId equalTo scriptId }.execute()
				val normalized = standardized.sources.map { tryNormalizedUrl(it) }
				if(normalized.isNotEmpty()) {
					into(scriptSourceMappedScriptsTable).insert {
						values(normalized.map { url ->
							{ i: ScriptSourceMappedScriptsTableInsertInit ->
								i.scriptId(scriptId).url(url)
							}
						})
					}
				}
			}
			return UploadSourcemapResponse(null)
		} catch(e : UnresolvableSourceMapException){
			return UploadSourcemapResponse("Could not resolve part \"${script.url}\"")
		} catch(e : JsonSyntaxException){
			return UploadSourcemapResponse("Invalid SourceMap JSON")
		}
	}
}

//See the SourceMap V3 specification: https://docs.google.com/document/d/1U1RGAehQwRypUTovF1KRlpiOFze0b-_2gc6fAH0KY0k/edit
private data class SourceMap(
		val version: Int,
		val file: String? = null,
		val sourceRoot: String? = null,
		val sources: List<String>,
		val sourcesContent: List<String?>? = null,
		val names: List<String>? = null,
		val mappings: String? = null,
		val sections: List<SourceMapSection>? = null
)

private data class SourceMapSection(
		val offset: SourceMapOffset,
		val url: String? = null,
		val map: SourceMap? = null
)

data class SourceMapOffset(
		val line: Int,
		val column: Int
)

data class StandardizedSourceMap(
		val version: Int,
		val file: String? = null,
		val sourceRoot: String? = null,
		val sources: List<String>,
		val sourcesContent: List<String>? = null,
		val names: List<String> = emptyList(),
		val mappings: String? = null
)

/**
 * We store all the content necessary for the client to parse a sourcemap, instead of the map itself.
 */
fun extractSourceMap(project : ProjectsRow, script: ScriptContentMessage): StandardizedSourceMap? {
	if(!project.followScriptSourceMapComments){
		return null
	}
	log.info { "Extracting source map from ${script.fullUrl}" }
	var sourceMapContent: String? = null
	if (script.sourceMapHeader != null) {
		log.info { "Using source map header ${script.sourceMapHeader}" }
		sourceMapContent = resolveSourceMapContent(project,
				script.fullUrl,
				script.sourceMapHeader).second
	} else {
		val sourceMapComment = sourceMapCommentRegex.find(script.content)
		if(sourceMapComment != null){
			log.info { "Found sourcemap comment for ${script.fullUrl}" }
			val sourceMapUrl = sourceMapComment.groupValues[1]
			val dataUri = dataUriRegex.find(sourceMapUrl)
			if(dataUri != null){
				log.info { "Found inline data source map for ${script.fullUrl}" }
				sourceMapContent = String(BaseEncoding.base64().decode(dataUri.groupValues[1]), StandardCharsets.UTF_8)
			} else {
				sourceMapContent = resolveSourceMapContent(project,
						script.fullUrl,
						sourceMapUrl).second
			}
		}
	}
	if (sourceMapContent == null) {
		log.info { "No source map found for ${script.fullUrl}" }
		return null
	}
	return parseSourceMap(project, script.fullUrl, sourceMapContent)
}

fun parseSourceMap(project : ProjectsRow, scriptUrl : String, sourceMapContent : String) : StandardizedSourceMap {
	val sourceMap = gson.fromJson(sourceMapContent, SourceMap::class.java)
	if (sourceMap.version != 3) {
		error("SourceMap with unknown version ${sourceMap.version} on script $scriptUrl")
	}
	return standardizeSourceMap(project, scriptUrl, sourceMap)
}

private val sourceMapCommentRegex = Regex("//#\\s*sourceMappingURL=[ \t]*(\\S*)\\s*$")
private val dataUriRegex = Regex("^data:application/json;base64,(\\S*)")

private fun standardizeSourceMap(project : ProjectsRow, scriptUrl: String, sourceMap: SourceMap): StandardizedSourceMap {
	val standardizedContent: List<String>?
	if (sourceMap.sourcesContent != null) {
		standardizedContent = sourceMap.sourcesContent.mapIndexed {
			index, content ->
			content ?: resolveSourceMapContent(project,
					scriptUrl,
					(sourceMap.sourceRoot ?: "") + sourceMap.sources[index]).second
		}
	} else {
		standardizedContent = null
	}
	if (sourceMap.sections?.size ?: 0 > 0) {
		//TODO: Sections not supported
		TODO("Sourcemap sections")
	}
	return StandardizedSourceMap(
			version = sourceMap.version,
			file = sourceMap.file,
			sourceRoot = sourceMap.sourceRoot,
			sources = sourceMap.sources,
			sourcesContent = standardizedContent,
			names = sourceMap.names ?: emptyList(),
			mappings = sourceMap.mappings
	)
}

/*
private fun standardizeSourceMapSection(script: ScriptContentMessage, section : SourceMapSection) : StandardizedSourceMapSection {
	if(section.map != null ){ return StandardizedSourceMapSection(section.offset, standardizeSourceMap(script, section.map))
	}
	else {
		val subsection = gson.fromJson(resolveSourceMapContent(script, section.url!!).second, SourceMap::class.java)
		return StandardizedSourceMapSection(section.offset, standardizeSourceMap(script, subsection))
	}
}
*/

internal class UnresolvableSourceMapException(cause : Throwable) : Exception(cause)
private fun resolveSourceMapContent(project : ProjectsRow, scriptUrl : String, location: String): Pair<String, String> {
	//Resolve absolute location in accordance with the specs.
	//Use the full URL of the script itself as a base in case of non-absolute paths.
	log.debug { "Resolving source map location '$location' against '${scriptUrl}" }
	val url = URL(URL(scriptUrl), location)
	val request = httpTransport.createRequestFactory({
		val headers = HttpHeaders()
		headers.cookie = project.scriptSourceMapExtraCookies.joinToString("; ")
		project.scriptSourceMapExtraHeaders.forEach {
			val (name, value) = it.split(":")
			headers.set(name, value)
		}
		it.headers = headers
	}).buildGetRequest(GenericUrl(url))
	//Other cases, such as srcless scripts, //# sourceURL, and eval(), are not currently supported
	assert(url.protocol.equals("http", ignoreCase = true) || url.protocol.equals("https", ignoreCase = true)) { "Unsupported protocol ${url.protocol}" }
	log.info { "Resolving $url" }
	val content : String
	try {
		content = request.execute().parseAsString()
	} catch(e : IOException){ throw UnresolvableSourceMapException(e)
	}
	return Pair(url.toString(), content)
}