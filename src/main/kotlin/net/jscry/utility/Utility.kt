package net.jscry.utility

import com.google.api.client.http.javanet.NetHttpTransport
import com.google.common.cache.Cache
import com.google.common.cache.CacheBuilder
import com.google.common.collect.Lists
import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.google.javascript.jscomp.parsing.parser.Parser
import com.google.javascript.jscomp.parsing.parser.SourceFile
import com.google.javascript.jscomp.parsing.parser.trees.ProgramTree
import com.google.javascript.jscomp.parsing.parser.util.ErrorReporter
import com.google.javascript.jscomp.parsing.parser.util.SourcePosition
import com.mailjet.client.MailjetClient
import com.mailjet.client.MailjetRequest
import com.mailjet.client.resource.Contact
import com.mailjet.client.resource.Email
import net.jscry.collection.FromClientMessage
import net.jscry.collection.FromClientMessageDeserializer
import mu.KotlinLogging
import org.json.JSONArray
import org.json.JSONObject
import java.io.InputStreamReader
import java.net.MalformedURLException
import java.net.URL
import java.util.*
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.ThreadFactory
import java.util.concurrent.TimeUnit

val log = KotlinLogging.logger("net.jscry.generic")

val gson: Gson = ({
	val gsonBuilder = GsonBuilder()
	gsonBuilder.registerTypeAdapter(FromClientMessage::class.java,
			FromClientMessageDeserializer())
	gsonBuilder.registerTypeAdapter(Operation::class.java, OperationDeserializer())
	gsonBuilder.create()
})()

private val executorLogger = KotlinLogging.logger("net.jscry.ExecutorService")
private val executorService = Executors.newCachedThreadPool(object : ThreadFactory {
	val delegate = Executors.defaultThreadFactory()
	override fun newThread(r: Runnable): Thread {
		return delegate.newThread(r).apply {
			uncaughtExceptionHandler = Thread.UncaughtExceptionHandler {
				_, exception ->
					executorLogger.error(exception) { "Error in executor task: $exception" }
			}
		}
	}

})

fun background(command : ()->Unit){
	executorService.execute(command)
}

fun <T> future(command : ()->T) : Future<T> {
	val cmd : ()->T = {
		try {
			command()
		} catch(exception : Throwable) {
			executorLogger.error(exception) { "Error in future task: $exception" }
			throw exception
		}
	}
	return executorService.submit(cmd)!!
}


/**
 * A reimplementation of the fast string hash used in TypeScript for checking content
 */
fun stringHash(str : String) : Int {
	var hash = 0
	for (chr in str) {
		hash  = hash.shl(5) - hash + chr.toInt()
	}
	return hash
}

interface HasLineAndColumn { val line : Int; val column : Int }
data class LineAndColumn(override val line : Int, override val column : Int) : HasLineAndColumn
data class LineColumnSource(override val line : Int, override val column : Int, val source : Int?) : HasLineAndColumn
class StringWithLines(val string : String){
	val lines = string.split('\n')
	private val lineOffsetMap = ArrayList<Int>(lines.size)
	init {
		var positionIndex = 0
		for(line in lines){
			lineOffsetMap.add(positionIndex)
			positionIndex += line.length + 1
		}
	}
	fun lineStartOffset(line : Int) : Int {
		return lineOffsetMap[line]
	}

	fun atLine(pos : HasLineAndColumn) : Int {
		return lineOffsetMap[pos.line] + pos.column
	}

	fun atPos(pos : Int) : LineAndColumn? {
		val line = lineOffsetMap.closestUnderOrEqualIndex(pos, Comparator(Int::compareTo))
		if(line == null){ return null }
		else {
			val column = pos - lineOffsetMap[line]
			return LineAndColumn(line = line, column = column)
		}
	}
}

fun closureParseJavaScript(content : String) : ProgramTree {
	val jsParser = Parser(Parser.Config(Parser.Config.Mode.ES6_OR_GREATER, false), whoCaresErrorReporter, SourceFile("unknown", content))
	return jsParser.parseProgram()
}

private val whoCaresErrorReporter = object : ErrorReporter() {
	override fun reportWarning(location: SourcePosition?, message: String?) {}
	override fun reportError(location: SourcePosition?, message: String?) {}
}

private val mailjet by lazy {
	MailjetClient("b85dbf8eaae468b2140afab22e5838ff", "2cad24b38dbd5edaeb14dfc0b3c0f475")
}

fun sendEmail(to : String, subject : String, body : String, from : String = "donotreply@jscry.io", fromName : String = "jScry"){
	log.info { "Sending email '$subject' to $to" }
	val response = mailjet.post(MailjetRequest(Email.resource)
			.property(Email.FROMNAME, fromName)
			.property(Email.FROMEMAIL, from)
			.property(Email.SUBJECT, subject)
			.property(Email.TEXTPART, body)
			.property(Email.RECIPIENTS, JSONArray().put(JSONObject().put(Contact.EMAIL, to))))
	if(!response.status.toString().startsWith("2")){
		log.error { "Received ${response.status} when sending email '$subject' to $to" }
	}


}

fun reflectionCreateEnum(clazz: Class<*>, value : String) : Any {
	return java.lang.Enum.valueOf(asEnumClass<TimeUnit>(clazz), value)
}
@Suppress("UNCHECKED_CAST")
fun <T: Enum<T>> asEnumClass(clazz: Class<*>): Class<T> = clazz as Class<T>

fun <T> List<T>.intoChunks(ofSize : Int) : List<List<T>>{
	return Lists.partition(this, ofSize)
}

fun <T> T.matchOrNull(predicate : (T)->Boolean) : T? {
	if(predicate(this)){ return this }
	else { return null }
}

fun classpathResource(location: String) : String { return InputStreamReader(ClassLoader.getSystemClassLoader().getResourceAsStream(location)).readText() }

val httpTransport = NetHttpTransport()

typealias NormalizedUrl = String
fun normalizedUrl(pageUrl : String) : net.jscry.utility.NormalizedUrl {
	val url = URL(pageUrl)
	return url.authority + url.path
}

fun tryNormalizedUrl(pageUrl : String) : NormalizedUrl {
	try {
		return net.jscry.utility.normalizedUrl(pageUrl)
	} catch(e : MalformedURLException){ return pageUrl }
}

fun normalizedUrlPathUp(path : NormalizedUrl) : NormalizedUrl? {
	val pathParts = path.split("/")
	if(pathParts.size > 1){
		return pathParts.take(pathParts.size - 1).joinToString("/")
	} else {
		return null
	}
}

private fun toProperty(line : String) : Pair<String, String> {
	return line.split("=", limit = 2).let { Pair(it[0], it[1].trim())}
}

fun propertiesFromString(str: String) : Properties {
	val properties = Properties()
	val props : List<Pair<String,String>> = str.split("\n")
			.map(String::trim)
			.filter { !it.startsWith("#") }
			.filter { it.isNotBlank() }
			.map(::toProperty)
	for(prop in props){
		properties[prop.first] = prop.second
	}
	return properties
}

/**
 * A computation from K -> V that will only be executed at most once concurrently on this JVM.
 */
class SingleConcurrentComputation<K,V> {
	private val guava : Cache<K,Optional<V>> = CacheBuilder.newBuilder().maximumSize(0).expireAfterWrite(0, TimeUnit.SECONDS).build()
	fun compute(key : K, compute : (K)->V) : V {
		return guava.get(key, { Optional.ofNullable(compute(key)) }).orElse(null)
	}
}