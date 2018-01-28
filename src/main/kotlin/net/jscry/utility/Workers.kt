package net.jscry.utility

import net.jscry.Server.Companion.config
import net.jscry.database.enums.JobTypes
import net.jscry.database.tables.dsl.JobsRow
import net.jscry.database.tables.dsl.jobsTable
import net.jscry.executions.updateExecutionSums
import net.jscry.scripts.configuration.generateScriptConfiguration
import mu.KLogging
import net.justmachinery.kdbgen.from
import net.justmachinery.kdbgen.update
import net.justmachinery.kdbgen.where
import java.sql.Timestamp
import java.time.Instant
import java.util.*
import java.util.concurrent.ThreadLocalRandom


sealed class JobData {
	class ScriptConfigurationJobData : JobData()
}

fun startWorkers() {
	val workerCount = Math.max(config.workerMultiplier * Runtime.getRuntime().availableProcessors(), 1)
	val workers = mutableListOf<Thread>()
	for (i in 1..workerCount) {
		val worker = WorkerThread()
		workers.add(worker)
		worker.start()
	}
	val executionsThread = SumExecutionsThread()
	executionsThread.start()
	for (worker in workers) {
		worker.join()
	}
	executionsThread.join()
}

private class SumExecutionsThread : Thread() {
	override fun run(){
		while(true){
			updateExecutionSums()
			Thread.sleep(1000)
		}
	}
}

private class WorkerThread : Thread() {
	companion object : KLogging()

	override fun run() {
		while (true) {
			var hadJob: Boolean = false
			//Run the job in an overall transaction in case the JVM is killed midway through
				var result: String? = null
				try {
					//language=PostgreSQL
					val statement = """
					DELETE FROM pending_jobs
					WHERE job_id = (SELECT job_id FROM pending_jobs WHERE scheduled_run_time <= localtimestamp ORDER BY job_id LIMIT 1 FOR UPDATE SKIP LOCKED)
					RETURNING job_id
				"""
					val jobs = sql.select(statement, mapOf(), mapper = { it.long("job_id") })
					if (jobs.isNotEmpty()) {
						hadJob = true
						val jobId = jobs[0]
						val job = getJob(jobId)
						try {
							sql.transaction {
								result = handleJob(job)
							}
						} finally {
							logJobCompletion(job, result)
						}
					}
				} catch(t: Throwable) {
					logger.error(t, { "Exception in worker thread $workerId" })
				}
			if (!hadJob) {
				sleep(ThreadLocalRandom.current().nextLong(50, 1000))
			}
		}
	}

	fun handleJob(job: JobsRow): String? {
		when (job.type) {
			JobTypes.GENERATE_SCRIPT_CONFIGURATION -> {
				return generateScriptConfiguration(job).toString()
			}
			else -> throw IllegalArgumentException("Job type ${job.type} unrecognized")
		}
	}

	fun getJob(jobId: Long): JobsRow {
		//language=PostgreSQL
		val statement = "SELECT * FROM jobs WHERE job_id = :jobId"
		return sql.select(statement, mapOf("jobId" to jobId), mapper = dataClassMapper(
				JobsRow::class)).first()
	}

	private val workerId = UUID.randomUUID()
	fun logJobCompletion(job: JobsRow, result: String?) {
		from(jobsTable).update {
			it.worker setTo workerId
			it.result setTo result
			it.finished setTo Timestamp(Instant.now().toEpochMilli())
		}.where {
			it.jobId equalTo job.jobId
		}.execute()
	}
}

internal fun submitJob(jobType: JobTypes, parameter: String, data: JobData): () -> String? {
	val jsonData = gson.toJson(data)
	//language=PostgreSQL
	val statement = """
		INSERT INTO jobs(type, parameter, data) VALUES (CAST(:type AS JOB_TYPES), :parameter, CAST(:data AS JSONB))
		ON CONFLICT(type, parameter) WHERE finished IS NULL DO UPDATE SET job_id = jobs.job_id
		RETURNING job_id
	"""
	val jobId = sql.insert(
			statement,
			mapOf("type" to jobType.toString(), "parameter" to parameter, "data" to jsonData),
			f = { it.long("job_id") }
	).second
	return {
		val result: String?
		while (true) {
			//language=PostgreSQL
			val pollStatement = "SELECT result FROM jobs WHERE job_id = :jobId AND finished IS NOT NULL"
			val ready: List<String?> = sql.select(pollStatement,
					mapOf("jobId" to jobId),
					mapper = { it.stringOrNull("result") })
			if (ready.isNotEmpty()) {
				result = ready.first()
				break
			}
			Thread.sleep(50)
		}
		result
	}
}