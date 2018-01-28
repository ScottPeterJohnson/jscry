package net.jscry.scripts

import net.jscry.utility.NormalizedUrl
import net.jscry.utility.normalizedUrlPathUp
import java.util.*
import java.util.concurrent.ConcurrentHashMap

//TODO: This page script prediction scheme is suboptimal for cases where resources are loaded via AJAX after the "setup done" message

fun predictedPageScripts(apiKey : UUID, page : NormalizedUrl) : List<ScriptId> {
	var url : NormalizedUrl? = page
	do {
		val last = pageLastScript[Pair(apiKey, url)]
		if(last != null) return last.lastScripts
		url = normalizedUrlPathUp(url!!)
	} while(url != null)
	return emptyList()
}

fun registerActualPageScripts(apiKey: UUID, page : NormalizedUrl, scripts : List<ScriptId>){
	var distance = 0
	var url : String? = page
	do {
		val lastDistance = pageLastScript[Pair(apiKey, url!!)]?.urlDistance ?: Int.MAX_VALUE
		if(distance <= lastDistance){
			pageLastScript[Pair(apiKey, url)] = PageLastScriptsEntry(urlDistance = distance,
					lastScripts = scripts)
		} else {
			return
		}
		distance += 1
		url = normalizedUrlPathUp(url)
	} while(url != null)
}

private data class PageLastScriptsEntry(val urlDistance : Int, val lastScripts : List<ScriptId>)
private val pageLastScript = ConcurrentHashMap<Pair<UUID, String>, PageLastScriptsEntry>()