package net.jscry.workers.jobs

import net.jscry.DatabaseTest
import net.jscry.DatabaseTestData
import net.jscry.utility.query
import net.jscry.database.tables.dsl.StatementSetMembersRow
import net.jscry.database.tables.dsl.statementSetMembersTable
import net.jscry.scripts.mapping.diff.mapNewScript
import net.jscry.scripts.mapping.diff.newScriptMappingLookback
import net.jscry.executions.updateExecutionSums
import io.kotlintest.matchers.shouldBe
import io.kotlintest.matchers.shouldNotBe
import net.justmachinery.kdbgen.from
import net.justmachinery.kdbgen.selectAll
import net.justmachinery.kdbgen.where
import kotlin.system.measureTimeMillis

class MapNewScriptsPerformanceTest : DatabaseTest() {
	init {
		"mapping a script should be reasonably performant" {
			for (i in 1..4) {
				val script = DatabaseTestData.script(
						name = "Test",
						fileName = "static/console/vendor-console-app.js",
						version = i,
						hash = i
				)
				require(script)
			}
			val secondScript = DatabaseTestData.script(
					name = "Test",
					fileName = "static/console/vendor-console-app.js",
					version = 5,
					hash = 5
			)
			require(secondScript)
			val timeTaken = measureTimeMillis {
				mapNewScript(secondScript.get.script.scriptId, performant = false)
			}
			println("Took $timeTaken")
			//timeTaken should satisfy { it <= 3000 }
		}
	}
}

class MapNewScriptsTest : DatabaseTest() {
	init {
		"new script mapping should successfully map against a statement set within the last N scripts" {
			val (oldMembership, newMembership) = mapANewScript(scriptsInBetween = newScriptMappingLookback)
			newMembership shouldNotBe null
			newMembership!!.statementSetId shouldBe oldMembership.statementSetId

		}
		"new script mapping shouldn't find anything on a statement set not within the last N scripts" {
			val (_, newMembership) = mapANewScript(scriptsInBetween = newScriptMappingLookback + 1)
			newMembership shouldBe null
		}
	}

	fun mapANewScript(scriptsInBetween: Int): Pair<StatementSetMembersRow, StatementSetMembersRow?> {
		val firstScript = DatabaseTestData.script("Test")
		require(firstScript)
		require(DatabaseTestData.execution(firstScript, symbolPosition = 27, weightedExecutions = 2))
		updateExecutionSums()
		val statementSet = from(statementSetMembersTable).selectAll().where { it.scriptId equalTo firstScript.get.script.scriptId }.query().first()
		(2..scriptsInBetween).forEach { require(DatabaseTestData.script(name = "Blank", urlName = "Test", hash = it)) }
		val newScript = DatabaseTestData.script(name = "Test", version = 2)
		require(newScript)
		mapNewScript(newScript.get.script.scriptId)
		return Pair(statementSet,
				from(statementSetMembersTable).selectAll().where { it.scriptId equalTo newScript.get.script.scriptId }.query().firstOrNull())
	}
}