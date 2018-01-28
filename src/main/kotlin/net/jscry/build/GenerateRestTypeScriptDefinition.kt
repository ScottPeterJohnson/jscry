package net.jscry.build

import cz.habarta.typescript.generator.*
import cz.habarta.typescript.generator.compiler.Symbol
import net.jscry.utility.ClientVisible
import net.jscry.utility.WebEndpoint
import org.reflections.Reflections
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestMethod
import java.io.File
import java.lang.reflect.ParameterizedType
import java.lang.reflect.Type
import java.lang.reflect.WildcardType
import java.math.BigDecimal
import java.math.BigInteger
import java.util.*
import kotlin.reflect.KClass
import kotlin.reflect.full.isSubclassOf
import kotlin.reflect.full.memberProperties

fun main(args : Array<String>){
	var output = "function toMap(obj:any){let map = new Map();for(let prop in obj){if(obj.hasOwnProperty(prop)){map.set(prop,obj[prop]);}}return map;}\n\n"
	val reflections = Reflections("net.jscry")
	val endpoints = reflections.getSubTypesOf(WebEndpoint::class.java)
	var inputClasses : Set<Class<*>> = endpoints.toSet()
	inputClasses += reflections.getSubTypesOf(ClientVisible::class.java)

	val settings = Settings()
	settings.outputKind = TypeScriptOutputKind.module
	settings.jsonLibrary = JsonLibrary.jackson2
	settings.customTypeProcessor = CustomTypeProcessor()
	val generator = TypeScriptGenerator(settings)
	output += generator.generateTypeScript(Input.from(*inputClasses.toList().toTypedArray())) + "\n\n"

	output += "\n\nexport interface WebEndpoint<RequestType, ResponseType> {\n    method: string, endpoint: string, convert: (val:string)=>ResponseType\n}\n\n"
	for(endpoint in endpoints){
		println("Web endpoint: ${endpoint.simpleName}")
		val responseType = (endpoint.genericSuperclass as ParameterizedType).actualTypeArguments[1]
		val convertFunction : String = getConvertFunction(responseType)

		//Might have multiple "runs" as in UploadSourceMap to be passed different params by spring, which is fine but only one can be the request
		val runCandidates = endpoint.methods.filter { it.name == "run" && it.getAnnotation(RequestMapping::class.java) != null }
		assert(runCandidates.size == 1)
		val runMethod = runCandidates.first()
		val requestMapping = runMethod.getAnnotation(RequestMapping::class.java)
		assert(requestMapping.value.size == 1)
		val endpointPath = requestMapping.value.first()
		assert(endpointPath.startsWith("rest/"))
		output += """export const ${endpoint.simpleName} : ${endpoint.simpleName} = {
				method: '${requestMapping.method.firstOrNull() ?: RequestMethod.GET}',
				endpoint: '/$endpointPath',
				convert: function(json: string){ let result = JSON.parse(json); return ($convertFunction)(result); }
			};
			"""
	}

	File("build/tsgen").mkdirs()
	File("build/tsgen/endpoints.ts").writeText(output)
}

fun getConvertFunction(type: Type) : String {
	var actualType = type
	if(actualType is WildcardType){
		actualType = actualType.upperBounds[0]
	}
	if(actualType is ParameterizedType){
		val raw = actualType.rawType
		if(raw is Class<*> && List::class.java.isAssignableFrom(raw)) {
			val listType = actualType.actualTypeArguments[0]
			val typeConvert = getConvertFunction(listType)
			return "function(arr:any[]){ return arr.map($typeConvert); }"
		}
	} else if(actualType is Class<*>){
		return objectConvertFunction(actualType)
	}
	throw RuntimeException("Cannot convert return type $actualType")
}

fun objectConvertFunction(responseType : Class<*>) : String {
	val responseTypePropertyConverters = mutableListOf<String>()
	responseTypePropertyConverters.addAll(buildJavascriptPropertyParsers(responseType.kotlin))
	return "function(obj:any){ ${responseTypePropertyConverters.joinToString("; ")}; return obj; }"
}

fun buildJavascriptPropertyParsers(clazz : KClass<*>, prefix:String="obj") : List<String> {
	val responseTypePropertyConverters = mutableListOf<String>()
	for(property in clazz.memberProperties){
		val returnType = property.returnType.classifier
		val accessor = "$prefix.${property.name}"
		if(returnType is KClass<*>){
			if(IntJsMap::class.java.isAssignableFrom(returnType.java) || StringJsMap::class.java.isAssignableFrom(returnType.java)){
				responseTypePropertyConverters.add("$accessor = toMap($accessor)")
			} else if(Date::class.java.isAssignableFrom(returnType.java)) {
				responseTypePropertyConverters.add("$accessor = new Date($accessor)")
			} else {
				if(emitsAsObject(returnType)) {
					responseTypePropertyConverters.addAll(buildJavascriptPropertyParsers(returnType, prefix = prefix + "." + property.name))
				}
			}
		}
	}
	return responseTypePropertyConverters
}
private val primitiveTypes = setOf<KClass<*>>(
		Object::class, Byte::class, Short::class, Int::class, Long::class, Float::class, Double::class, Boolean::class,
		Character::class, String::class, Void::class, BigDecimal::class, BigInteger::class, Date::class, UUID::class
)
fun emitsAsObject(clazz : KClass<*>) : Boolean {
	if(clazz.javaPrimitiveType != null){
		return false
	}
	if(primitiveTypes.contains(clazz)){
		return false
	}
	if(clazz.isSubclassOf(Enum::class)){
		return false
	}
	if(clazz.isSubclassOf(Collection::class)){
		return false
	}
	if(clazz.isSubclassOf(Map::class)){
		return false
	}
	return true
}

class CustomTypeProcessor : TypeProcessor {
	override fun processType(javaType: Type, context: TypeProcessor.Context): TypeProcessor.Result? {
		if(javaType is ParameterizedType){
			val clazz = javaType.rawType
			if(clazz is Class<*>){
				if(IntJsMap::class.java.isAssignableFrom(clazz) || StringJsMap::class.java.isAssignableFrom(clazz)){
					val result = context.processType(javaType.actualTypeArguments[0])
					return TypeProcessor.Result(TsType.GenericReferenceType(Symbol("Map"), TsType.String, result.tsType), result.discoveredClasses)
				}
			}
		}
		return null
	}

}

class IntJsMap<V> internal constructor(map : Map<Int,V>) : HashMap<Int,V>(map)
class StringJsMap<V> internal constructor(map : Map<String,V>) : HashMap<String,V>(map)