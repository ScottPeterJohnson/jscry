package net.jscry.workers

import net.jscry.database.enums.JobTypes
import net.jscry.database.tables.dsl.JobsRow
import java.sql.Timestamp
import java.util.*

fun testJob(type : JobTypes, parameter : String, data : String) : JobsRow {
	return JobsRow(
			jobId = 0,
			submitted = Timestamp(Date().time),
			finished = null,
			type = type,
			parameter = parameter,
			data = data,
			result = null,
			worker = null,
			scheduledRunTime = Timestamp(Date().time)
	)
}