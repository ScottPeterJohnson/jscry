package net.jscry.console

import com.google.gson.Gson
import net.jscry.database.tables.dsl.usersTable
import net.jscry.utility.ClientVisible
import net.jscry.utility.query
import net.justmachinery.kdbgen.from
import net.justmachinery.kdbgen.selectAll
import net.justmachinery.kdbgen.where
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import javax.servlet.http.HttpServletRequest
import javax.servlet.http.HttpServletResponse

@RestController
class ConsoleConfiguration {
	@RequestMapping("console/console-config.js", produces = arrayOf("application/javascript"))
	fun config(request : HttpServletRequest, response : HttpServletResponse) : String {
			val user = from(usersTable).selectAll().where { it.uid equalTo request.authentication().uid }.query().first()
			return "window.consoleConfig=" + Gson().toJson(ConsoleConfig(
					email = user.email,
					name = user.name,
					uid = user.uid,
					picture = request.authentication().picture as String?,
					firstLogin = user.firstLogin
			))
	}
}

data class ConsoleConfig(val email : String?, val name : String?, val uid : String, val picture : String?, val firstLogin : Boolean) : ClientVisible