package net.jscry.projects

import net.jscry.console.userId
import net.jscry.database.tables.dsl.ProjectsRow
import net.jscry.database.tables.dsl.projectsTable
import net.jscry.utility.*
import net.justmachinery.kdbgen.from
import net.justmachinery.kdbgen.update
import net.justmachinery.kdbgen.where
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.*
import javax.servlet.http.HttpServletRequest


data class GetProjectRequest(val apiKey: UUID)

@RestController
class GetProject : WebEndpoint<GetProjectRequest, ProjectsRow>() {
	@RequestMapping("rest/project")
	override fun run(httpRequest: HttpServletRequest) : ProjectsRow = standard(httpRequest) {
		val securityProof = checkApiAccess(httpRequest, it.apiKey)
		val key = loadProject(it.apiKey) ?: throw IllegalArgumentException("API key ${it.apiKey} does not exist")
		WebResult(key, securityProof)
	}
}

@RestController
class GetProjects : WebEndpoint<EmptyRequest, List<ProjectsRow>>() {
	@RequestMapping("rest/projects")
	override fun run(httpRequest: HttpServletRequest): List<ProjectsRow> = standard(httpRequest) {
		val securityProof = checkApiAccess(httpRequest)
		//language=PostgreSQL
		val statement = "select projects.* from projects, user_projects where user_projects.user_id = :userId and projects.api_key = user_projects.api_key"
		val result = sql.select(statement, mapOf("userId" to httpRequest.userId()), mapper = dataClassMapper(
				ProjectsRow::class))
		WebResult(result, securityProof)
	}
}


data class ToggleProjectEnabledRequest(val apiKey : UUID, val enabled : Boolean)

@RestController
class ToggleProjectEnabled : WebEndpoint<ToggleProjectEnabledRequest, Boolean>(){
	@RequestMapping("rest/project/toggleEnabled")
	override fun run(httpRequest : HttpServletRequest): Boolean = standard(httpRequest, { req ->
		val securityProof = checkApiAccess(httpRequest, req.apiKey)
		from(projectsTable).update { it.enabled setTo req.enabled }.where { it.apiKey equalTo req.apiKey }.execute()
		WebResult(true, securityProof)
	})
}

data class UpdateProjectSettingsRequest(val project : ProjectsRow)

@RestController
class UpdateProjectSettings : WebEndpoint<UpdateProjectSettingsRequest, Boolean>(){
	@RequestMapping("rest/project/updateSettings")
	override fun run(httpRequest : HttpServletRequest): Boolean = standard(httpRequest, { req ->
		val securityProof = checkApiAccess(httpRequest, req.project.apiKey)
		from(projectsTable).update {
			it.name setTo req.project.name
			it.runOnMobileBrowsers setTo req.project.runOnMobileBrowsers
			it.shouldTransformPageExpression setTo req.project.shouldTransformPageExpression
			it.shouldTransformScriptExpression setTo req.project.shouldTransformScriptExpression
			it.corsAllowedPatterns setTo req.project.corsAllowedPatterns
			it.followScriptSourceMapComments to req.project.followScriptSourceMapComments
			it.scriptSourceMapExtraCookies setTo req.project.scriptSourceMapExtraCookies
			it.scriptSourceMapExtraHeaders setTo req.project.scriptSourceMapExtraHeaders
		}.where { it.apiKey equalTo req.project.apiKey }.execute()
		WebResult(true, securityProof)
	})
}