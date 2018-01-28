package net.jscry.console

import net.jscry.database.tables.dsl.*
import net.jscry.utility.EmptyRequest
import net.jscry.utility.WebEndpoint
import net.jscry.utility.execute
import net.jscry.utility.standardNoProjectAccess
import net.justmachinery.kdbgen.*
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.*
import javax.servlet.http.HttpServletRequest

@RestController
class FirstLogin : WebEndpoint<EmptyRequest, Boolean>() {
	@RequestMapping("rest/firstLogin")
	override fun run(httpRequest: HttpServletRequest): Boolean = standardNoProjectAccess(httpRequest) {
		if(httpRequest.user().firstLogin){
			from(usersTable).update { it.firstLogin setTo false }.where { it.userId equalTo httpRequest.userId() }.execute()
			val projectId = UUID.randomUUID()
			into(projectsTable).insert { values { it.apiKey(projectId).name("Example Project") } }.execute()
			into(userProjectsTable).insert { values {it.userId(httpRequest.user().userId).apiKey(projectId) }}.execute()
			true
		} else {
			false
		}
	}
}
