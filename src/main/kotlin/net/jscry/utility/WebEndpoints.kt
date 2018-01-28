package net.jscry.utility

import net.jscry.console.getUserAccessibleApiKeys
import net.jscry.console.user
import net.jscry.console.userId
import java.util.*
import javax.servlet.http.HttpServletRequest


class EmptyRequest
class EmptyResponse

interface ClientVisible

/**
 * Tags a class to have a typescript interface generated for it
 */
@Suppress("unused")
abstract class WebEndpoint<in RequestType, out ResponseType> {
	abstract fun run(httpRequest : HttpServletRequest) : ResponseType
}

class ApiSecurityProof internal constructor()
fun checkApiAccess(httpRequest : HttpServletRequest, vararg keys : UUID?) : ApiSecurityProof {
	val actualKeys = keys.filterNotNull()
	if(actualKeys.isNotEmpty()){
		if(!getUserAccessibleApiKeys(httpRequest.userId()).containsAll(actualKeys)){
			throw IllegalStateException("User ${httpRequest.user()} attempted to manipulate keys without access: ${actualKeys.joinToString(",")}")
		}
	}
	return ApiSecurityProof()
}

data class WebResult<out T>(val result : T, val securityProof : ApiSecurityProof)

inline fun <reified RequestType, ResponseType,T : WebEndpoint<RequestType, ResponseType>> T.standard(
		request: HttpServletRequest,
		//crossinline prevents "return" from shortcircuiting and getting out of returning a security proof
		crossinline body: WebEndpoint<RequestType, ResponseType>.(RequestType) -> WebResult<ResponseType>
) : ResponseType {
	val json = request.getParameter("req") ?: error("Request parameter not supplied")
	val requestObject = gson.fromJson(json, RequestType::class.java)
	val result = this.body(requestObject)
	return result.result
}

inline fun <reified RequestType, ResponseType, T: WebEndpoint<RequestType, ResponseType>> T.standardNoProjectAccess(
		request : HttpServletRequest,
		body : WebEndpoint<RequestType, ResponseType>.(RequestType) -> ResponseType
) : ResponseType {
	val json = request.getParameter("req") ?: error("Request parameter not supplied")
	val requestObject = gson.fromJson(json, RequestType::class.java)
	val result = this.body(requestObject)
	return result
}