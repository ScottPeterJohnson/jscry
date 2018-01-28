package net.jscry.scripts.commands

import com.google.common.cache.CacheBuilder
import com.google.common.cache.CacheLoader
import com.google.common.cache.LoadingCache
import net.jscry.database.enums.DefaultableBoolean
import net.jscry.database.enums.ScriptCommandTypes
import net.jscry.database.tables.dsl.*
import net.jscry.scripts.ScriptId
import net.jscry.scripts.getScriptRow
import net.jscry.scripts.mapping.statementsets.FullStatementSet
import net.jscry.utility.*
import mu.KLogging
import net.justmachinery.kdbgen.*
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.*
import java.util.concurrent.TimeUnit
import javax.servlet.http.HttpServletRequest

data class ToggleScriptStatementInclusionRequest(
		val scriptCommandId : Long?,
		val scriptId : Long,
		val symbolPosition : Int,
		val included : DefaultableBoolean
)

@RestController
class ToggleScriptStatementInclusion : WebEndpoint<ToggleScriptStatementInclusionRequest, ScriptCommandsRow>() {
	companion object : KLogging()

	@RequestMapping("rest/project/script/toggleStatementIncluded")
	override fun run(httpRequest : HttpServletRequest) : ScriptCommandsRow = standard(httpRequest, {
		val script = getScriptRow(it.scriptId)
		val securityProof = checkApiAccess(httpRequest, script.apiKey)
		val newRow = updateOrInsertScriptInclusionCommand(
				scriptCommandId = it.scriptCommandId,
				apiKey = script.apiKey,
				url = script.url,
				scriptId = it.scriptId,
				symbolPosition = it.symbolPosition,
				included = it.included
		)
		WebResult(newRow, securityProof)
	})
}



data class AddScriptCodeCommandRequest(val scriptId : Long, val symbolPosition : Int, val code : String)
@RestController
class AddScriptCodeCommand : WebEndpoint<AddScriptCodeCommandRequest, ScriptCommandsRow>() {
	companion object : KLogging()

	@RequestMapping("rest/project/script/addScriptCode")
	override fun run(httpRequest : HttpServletRequest) : ScriptCommandsRow = standard(httpRequest, { req ->
		val script = getScriptRow(req.scriptId)
		val securityProof = checkApiAccess(httpRequest, script.apiKey)
		val newCommand = into(scriptCommandsTable).insert {
			values { it
					.apiKey(script.apiKey)
					.url(script.url)
					.scriptId(req.scriptId)
					.symbolPosition(req.symbolPosition)
					.commandType(ScriptCommandTypes.ADD_CODE)
					.commandData(gson.toJson(ScriptCommandData.ScriptAddCodeCommandData(req.code)))
			} }.returningAll().query().first()
		WebResult(newCommand, securityProof)
	})
}

fun scriptCommandApiKey(commandId : Long) : UUID {
	val command = from(scriptCommandsTable).selectAll().where { it.scriptCommandId equalTo commandId}.query().first()
	val script = getScriptRow(command.scriptId)
	return script.apiKey
}

data class DeleteScriptCodeCommandRequest(val commandId : Long)
@RestController
class DeleteScriptCodeCommand : WebEndpoint<DeleteScriptCodeCommandRequest, EmptyResponse>() {
	companion object : KLogging()

	@RequestMapping("rest/project/script/deleteScriptCode")
	override fun run(httpRequest : HttpServletRequest) : EmptyResponse = standard(httpRequest, { req ->
		val securityProof = checkApiAccess(httpRequest, scriptCommandApiKey(req.commandId))
		from(scriptCommandsTable).delete().where { it.scriptCommandId equalTo req.commandId }.execute()
		WebResult(EmptyResponse(), securityProof)
	})
}

data class ChangeScriptCodeCommandRequest(val commandId : Long, val commandData : ScriptCommandData.ScriptAddCodeCommandData)
@RestController
class ChangeScriptCodeCommand : WebEndpoint<ChangeScriptCodeCommandRequest, EmptyResponse>() {
	companion object : KLogging()

	@RequestMapping("rest/project/script/changeScriptCode")
	override fun run(httpRequest : HttpServletRequest) : EmptyResponse = standard(httpRequest, { req ->
		val securityProof = checkApiAccess(httpRequest, scriptCommandApiKey(req.commandId))
		from(scriptCommandsTable).update {
			it.commandData setTo gson.toJson(req.commandData)
		}.where { it.scriptCommandId equalTo req.commandId }.execute()
		WebResult(EmptyResponse(), securityProof)
	})
}

data class GetAddedCodeResultsRequest(val scriptCommandId : Long)
@RestController
class GetAddedCodeResults : WebEndpoint<GetAddedCodeResultsRequest, List<ScriptCommandAddedCodeResultsRow>>() {
	companion object : KLogging()

	@RequestMapping("rest/project/script/getAddedCodeResults")
	override fun run(httpRequest : HttpServletRequest) : List<ScriptCommandAddedCodeResultsRow> = standard(httpRequest, { req ->
		val securityProof = checkApiAccess(httpRequest, scriptCommandApiKey(req.scriptCommandId))
		val results = from(scriptCommandAddedCodeResultsTable)
				.selectAll()
				.where { it.scriptCommandId equalTo req.scriptCommandId }
				.query()
		WebResult(results, securityProof)
	})
}


val scriptCommandsCache: LoadingCache<Pair<ScriptId,String>, List<ScriptCommandWithStatementSet>> = CacheBuilder.newBuilder()
		.maximumSize(100 * 1000)
		.expireAfterWrite(30, TimeUnit.MINUTES)
		.build(object : CacheLoader<Pair<ScriptId,String>, List<ScriptCommandWithStatementSet>>() {
			override fun load(key: Pair<ScriptId,String>): List<ScriptCommandWithStatementSet> {
				return loadScriptCommands(key.first, key.second)
			}
		})


data class ScriptCommandWithStatementSet(val command : ScriptCommandsRow, val statementSet : FullStatementSet)


fun loadScriptCommands(targetScriptId : ScriptId, url : String) : List<ScriptCommandWithStatementSet> {
	val commandMapper = dataClassMapper(ScriptCommandsRow::class)
	//language=PostgreSQL
	val statement = """
		SELECT
			cmd.*,
			sset.statement_set_id,
			members.members
		FROM script_commands cmd
			LEFT JOIN statement_set_members AS sset
				ON sset.script_id = cmd.script_id AND sset.symbol_position = cmd.symbol_position
			LEFT JOIN LATERAL (
					  SELECT array_agg(row_to_json(mem.*)) AS members
					  FROM (SELECT *
					  FROM statement_set_members
					  WHERE sset.statement_set_id = statement_set_members.statement_set_id
						  AND statement_set_members.script_id <= :targetScriptId
					  ORDER BY statement_set_members.script_id DESC
					  LIMIT 50
						   ) mem) members ON TRUE
		WHERE url = :url
			AND NOT exists(SELECT *
						   FROM statement_set_mapping_failures
						   WHERE statement_set_id = sset.statement_set_id AND script_id = :targetScriptId)
			AND NOT exists(SELECT 1
						   FROM statement_set_mapping_failures
						   WHERE statement_set_id = sset.statement_set_id AND script_id < :targetScriptId
						   GROUP BY sset.statement_set_id
						   HAVING count(*) >= 3)
	"""
	return sql.select(statement, mapOf("targetScriptId" to targetScriptId, "url" to url), mapper = {
		val members = mutableListOf<StatementSetMembersRow>()
		val membersArray = (it.obj("members") as java.sql.Array).resultSet
		while(membersArray.next()){
			val member = membersArray.getString(2)
			members.add(jsonRow(member))
		}
		val command = commandMapper.invoke(it)
		ScriptCommandWithStatementSet(
				command = command,
				statementSet = FullStatementSet(it.long("statement_set_id"),
						members)
		)
	})
}

/**
 * Updates, inserts, or delete a script inclusion command.
 * Updates if script command ID is provided and included = true/false
 * Inserts if no script command ID is provided and included = true/false
 * Deletes if script command ID is provided and included = default (a case where no command is necessary)
 * Returns (possibly deleted) changed row
 */
fun updateOrInsertScriptInclusionCommand(
		scriptCommandId : Long?,
		apiKey: UUID,
		url : String,
		scriptId: Long,
		symbolPosition : Int,
		included : DefaultableBoolean
) : ScriptCommandsRow {
	val commandData by lazy { gson.toJson(ScriptCommandData.InclusionCommandData(included == DefaultableBoolean.TRUE)) }
	if(scriptCommandId != null){
		return if(included == DefaultableBoolean.DEFAULT){
			from(scriptCommandsTable)
					.delete()
					.where {
						it.scriptCommandId equalTo scriptCommandId
						it.apiKey equalTo apiKey
					}.returningAll().query().first()
		} else {
			from(scriptCommandsTable)
					.update { it.commandData setTo commandData }
					.returningAll()
					.query().first()
		}
	}
	assert(included != DefaultableBoolean.DEFAULT)
	return into(scriptCommandsTable).insert { values { it
			.apiKey(apiKey)
			.url(url)
			.scriptId(scriptId)
			.symbolPosition(symbolPosition)
			.commandType(ScriptCommandTypes.INCLUSION)
			.commandData(commandData)
	} }.returningAll().query().first()
}

sealed class ScriptCommandData {
	data class InclusionCommandData(val included: Boolean) : ScriptCommandData(), ClientVisible
	data class ScriptAddCodeCommandData(val code : String) : ScriptCommandData(), ClientVisible
}