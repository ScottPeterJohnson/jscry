package net.jscry.console

import com.google.api.client.googleapis.auth.oauth2.GooglePublicKeysManager
import com.google.api.client.http.javanet.NetHttpTransport
import com.google.api.client.json.jackson2.JacksonFactory
import net.jscry.Server
import net.jscry.database.tables.dsl.UsersRow
import net.jscry.database.tables.dsl.usersTable
import net.jscry.utility.query
import io.jsonwebtoken.Claims
import io.jsonwebtoken.Jws
import io.jsonwebtoken.JwtException
import io.jsonwebtoken.Jwts
import mu.KLogging
import net.justmachinery.kdbgen.from
import net.justmachinery.kdbgen.selectAll
import net.justmachinery.kdbgen.where
import org.springframework.web.util.UriUtils
import javax.servlet.*
import javax.servlet.annotation.WebFilter
import javax.servlet.http.HttpServletRequest
import javax.servlet.http.HttpServletResponse

fun HttpServletRequest.authentication(): AuthenticationToken {
	val session = this.session ?: error("No session")
	return session.getAttribute("authentication") as AuthenticationToken? ?: error("No authentication")
}

//fun HttpServletRequest.uid(): String = this.authentication().uid
fun HttpServletRequest.user() : UsersRow {
	val cachedUser = getAttribute("user") as UsersRow?
	if(cachedUser != null){ return cachedUser }
	val user = from(usersTable).selectAll().where { it.uid equalTo authentication().uid }.query().first()
	session.setAttribute("user", user)
	return user
}
fun HttpServletRequest.userId() : Long {
	return user().userId
}

class AuthenticationToken(private val jws : Jws<Claims>){
	val uid = jws.body.subject
	val email = jws.body["email"]
	val name = jws.body["name"]
	val picture = jws.body["picture"]
}

private val keyManager = GooglePublicKeysManager.Builder(NetHttpTransport(), JacksonFactory())
		.setPublicCertsEncodedUrl("https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com")
		.build()

@WebFilter("/*")
class AuthenticationFilter : Filter {
	override fun destroy() {}
	override fun init(filterConfig: FilterConfig?) {
	}

	override fun doFilter(request: ServletRequest, response: ServletResponse, chain: FilterChain) {
		if (request !is HttpServletRequest) {
			error("Request is not HttpServletRequest")
		}
		if (response !is HttpServletResponse) {
			error("Response is not HttpServletResponse")
		}
		val path = request.requestURI ?: ""

		if(Server.config.requireAuthForSourceMap && path.endsWith(".map")){
			val cookie : String? = request.cookies.firstOrNull { it.name == "jscry_sourcemaps" }?.value
			if("clawsdriverclimbingtightly" != cookie){
				response.sendError(403)
				return
			}
		}

		if (path.startsWith("/console") || path.startsWith("/rest")) {
			if (request.session.getAttribute("authentication") == null) {
				if (!path.startsWith("/web", ignoreCase = true)) {
					if (path != authenticationPath) {
						val cookie = request.cookies?.find { it.name == "auth" }
						if (cookie != null) {
							val claims = verifyJwtToken(cookie.value)
							if(claims != null){
								val token = AuthenticationToken(claims)
								request.session.setAttribute("authentication", token)
								usersCache.ensureExists(token)
								return chain.doFilter(request, response)
							} else {
								logger.info("Could not authenticate: ${cookie.value}")
							}
						}
						val redirectUrl = "$authenticationPath?redirect="
						if (path.startsWith("/rest")) {
							response.setHeader("jScryLogin", redirectUrl)
							response.sendError(403, "Authentication required")
						} else {
							response.sendRedirect(redirectUrl + UriUtils.encodeQueryParam(request.requestURL.toString(), Charsets.UTF_8.name()))
						}
						return
					}
				}
			}
		}
		return chain.doFilter(request, response)
	}

	fun verifyJwtToken(token : String) : Jws<Claims>? {
		for(key in keyManager.publicKeys){
			try {
				return Jwts.parser()
						.setSigningKey(key)
						.requireAudience("jscry-a3f6f")
						.requireIssuer("https://securetoken.google.com/jscry-a3f6f")
						.parseClaimsJws(token)
			} catch(e : JwtException){}
		}
		return null
	}

	companion object : KLogging() {
		val authenticationPath = "/console/authentication.html"
	}
}

