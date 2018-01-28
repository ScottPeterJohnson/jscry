package net.jscry.utility

import com.eclipsesource.v8.V8
import com.eclipsesource.v8.V8Array
import com.eclipsesource.v8.V8Object
import com.google.gson.JsonDeserializationContext
import com.google.gson.JsonDeserializer
import com.google.gson.JsonElement
import com.google.gson.reflect.TypeToken
import net.jscry.collection.ScriptConfigurationMessage
import java.io.InputStreamReader
import java.lang.reflect.Type

data class AcornJsAstWrapper(
		val type : String,
        val start : Int,
		val end : Int,
        val children : List<AcornJsAstWrapper>,
        val raw : String?,
        val name : String?
){
	val length = end - start
}

fun acornParseJavaScript(content : String) : AcornJsAstWrapper {
	val result = runV8Function("parseJavaScript", content)
	return gson.fromJson(result, AcornJsAstWrapper::class.java)
}

data class GetExecutableSitesResult(val ast : AcornJsAstWrapper, val sites : List<Int>)
fun acornGetExecutableSites(content : String) : GetExecutableSitesResult {
	val result = runV8Function("getExecutableSites", content)
	return gson.fromJson(result, GetExecutableSitesResult::class.java)
}


sealed class Operation(val start : Int) {
	class Insert(start : Int, val text : String) : Operation(start)
	class Delete(start : Int, val endBefore : Int) : Operation(start)
}

class OperationDeserializer : JsonDeserializer<Operation> {
	override fun deserialize(json: JsonElement, typeOfT: Type, context: JsonDeserializationContext): Operation {
		val jsonObject = json.asJsonObject
		val textAttribute = jsonObject.get("text")
		return when(textAttribute){
			null -> context.deserialize(json, Operation.Delete::class.java)
			else -> context.deserialize(json, Operation.Insert::class.java)
		}
	}
}

fun getTransformations(javascriptSource : String, scriptConfiguration : ScriptConfigurationMessage) : List<Operation>{
	val result = runV8Function("getTransformations", javascriptSource, gson.toJson(scriptConfiguration))
	return gson.fromJson(result, (object : TypeToken<List<Operation>>(){}).type)
}

fun applyTransformations(javascriptSource : String, scriptConfiguration : ScriptConfigurationMessage) : String {
	return runV8Function("applyTransformations", javascriptSource, gson.toJson(scriptConfiguration))
}


fun jsResource(name : String) : String {
	return InputStreamReader(ClassLoader.getSystemClassLoader().getResourceAsStream(name)).readText()
}
private val vendorServerEmbed = jsResource("serverjs/vendor-server-embed.js")
private val serverEmbed = jsResource("serverjs/server-embed.js")

data class V8Releaser(val runtime : V8, val globalObject : V8Object) {
	fun finalize(){
		globalObject.release()
		runtime.release()
	}
}
private val _v8Runtime = ThreadLocal.withInitial {
	val runtime = V8.createV8Runtime()
	runtime.executeVoidScript("window = this; global = this;")
	runtime.executeVoidScript("window.console={};")
	runtime.executeVoidScript(vendorServerEmbed)
	runtime.executeVoidScript(serverEmbed)
	val global = runtime.executeObjectScript("global")
	V8Releaser(runtime, global)
}
private val v8Runtime
	get() = _v8Runtime.get()

fun runV8Function(name : String, vararg args : Any) : String {
	val arguments = V8Array(v8Runtime.runtime).apply { args.forEach { this.push(it) } }
	try {
		return v8Runtime.globalObject.executeStringFunction(name, arguments)
	} finally {
		arguments.release()
	}
}
