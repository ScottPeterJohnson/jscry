/*
package net.jscry.utility

import net.jscry.collection.ScriptConfigurationMessage
import jdk.nashorn.api.scripting.JSObject
import jdk.nashorn.api.scripting.ScriptObjectMirror
import java.io.InputStreamReader
import java.util.*
import javax.script.ScriptEngineManager

private val scriptEngineFactory by lazy { ScriptEngineManager() }
private val scriptEngine = ThreadLocal.withInitial {
	val engine = scriptEngineFactory.getEngineByName("nashorn")
	engine.eval("var global = this; var window = this;")
	engine.eval(InputStreamReader(ClassLoader.getSystemClassLoader().getResourceAsStream("serverjs/vendor-server-embed.js")))
	engine.eval(InputStreamReader(ClassLoader.getSystemClassLoader().getResourceAsStream("serverjs/server-embed.js")))
	engine
}

private val jsParseJs = ThreadLocal.withInitial {
	scriptEngine.get().eval("parseJavaScript") as ScriptObjectMirror
}
class AcornJsAstWrapper(val jsObject : JSObject) {
	val type by lazy { jsObject.getMember("type") as String }
	val length by lazy { end - start }
	val start by lazy { (jsObject.getMember("start") as Number).toInt() }
	val end by lazy { (jsObject.getMember("end") as Number).toInt() }
	val children by lazy {
		val children = jsObject.getMember("children") as JSObject
		val length = (children.getMember("length") as Number).toInt()
		(0..length-1).map { children.getSlot(it) as JSObject }.map(::AcornJsAstWrapper)
	}
	val raw by lazy { jsObject.getMember("raw") as String }
	val name by lazy { jsObject.getMember("name") as String }
}
fun acornParseJavaScript(content : String) : AcornJsAstWrapper {
	return AcornJsAstWrapper(jsParseJs.get().call(null, content) as JSObject)
}

private val jsGetTransformations = ThreadLocal.withInitial {
	scriptEngine.get().eval("getTransformations") as ScriptObjectMirror
}



sealed class Operation(val start : Int) {
	class Insert(start : Int, val text : String) : Operation(start)
	class Delete(start : Int, val endBefore : Int) : Operation(start)
}
fun getTransformations(javascriptSource : String, scriptConfiguration: ScriptConfigurationMessage) : List<Operation> {
	val functionArgs : Array<Any> = arrayOf(javascriptSource, gson.toJson(scriptConfiguration))
	val result = jsGetTransformations.get().call(null, *functionArgs) as JSObject
	val length = (result.getMember("length") as Number).toInt()
	val operations : MutableList<Operation> = ArrayList(length)
	for(i in 0..(length-1)){
		val operation = result.getSlot(i) as JSObject
		val start = operation.getMember("start") as Number
		val text = operation.getMember("text") as CharSequence?
		if(text != null){
			operations.add(Operation.Insert(start.toInt(), text.toString()))
		} else {
			val endBefore = operation.getMember("endBefore") as Number?
			operations.add(Operation.Delete(start.toInt(), endBefore!!.toInt()))
		}
	}
	return operations
}

private val jsApplyTransformations = ThreadLocal.withInitial {
	scriptEngine.get().eval("applyTransformations") as ScriptObjectMirror
}

fun applyTransformations(javascriptSource : String, scriptConfiguration: ScriptConfigurationMessage) : String {
	val functionArgs : Array<Any> = arrayOf(javascriptSource, gson.toJson(scriptConfiguration))
	val result = jsApplyTransformations.get().call(null, *functionArgs) as CharSequence
	return result.toString()
}*/
