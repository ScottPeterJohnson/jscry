package net.jscry.console

import net.jscry.utility.WebEndpoint
import net.jscry.utility.sendEmail
import net.jscry.utility.standardNoProjectAccess
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import javax.servlet.http.HttpServletRequest

data class SubmitFeedbackRequest(val text : String)

@RestController
class SubmitFeedback : WebEndpoint<SubmitFeedbackRequest, Boolean>(){
	@RequestMapping("rest/feedback/submit")
	override fun run(httpRequest : HttpServletRequest): Boolean = standardNoProjectAccess(httpRequest, { req ->
		val user = httpRequest.user()
		sendEmail(
				to="jscry@justmachinery.net",
				subject="Feedback from ${user.name} (${user.email}) ${user.uid} ${user.userId}",
				body=req.text
		)
		true
	})
}