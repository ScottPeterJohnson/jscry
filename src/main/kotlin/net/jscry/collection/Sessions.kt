package net.jscry.collection

import net.jscry.database.tables.dsl.*
import net.jscry.utility.execute
import net.jscry.utility.query
import net.justmachinery.kdbgen.*
import java.net.InetAddress
import java.sql.Timestamp
import java.util.*

fun recordSession(apiKey: UUID, ipAddress: InetAddress): Long {
	return into(transformedSessionsTable)
			.insert { values { it
					.apiKey(apiKey)
					.ipAddress(ipAddress.hostAddress)
			} }
			.returning(transformedSessionsTable.transformedSessionId)
			.query().first().first
}

fun endSession(sessionId : Long){
	from(transformedSessionsTable).update { it.endTime setTo Timestamp(Date().time)}.where { it.transformedSessionId equalTo sessionId }.execute()
}

fun linkSessionToScriptConfiguration(sessionId : Long, scriptId: Long, scriptConfigurationId: Long, seed : Int){
	into(transformedSessionScriptConfigurationsTable)
			.insert { values { it
					.transformedSessionId(sessionId)
					.scriptId(scriptId)
					.scriptConfigurationId(scriptConfigurationId)
					.seed(seed)
			} }
			.execute()
}