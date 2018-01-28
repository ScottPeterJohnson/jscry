package net.jscry.workers.jobs

import net.jscry.DatabaseTest
import net.jscry.DatabaseTestData.Companion.firstScriptVersion2
import net.jscry.DatabaseTestData.Companion.testScript
import net.jscry.DatabaseTestData.Companion.testScriptLineExecution
import net.jscry.DatabaseTestData.Companion.testScriptSecondSessionLineExecution
import net.jscry.DatabaseTestData.Companion.testScriptVersion2LineExecution
import net.jscry.utility.query
import net.jscry.database.tables.dsl.scriptExecutionSumsTable
import net.jscry.database.tables.dsl.statementSetMembersTable
import net.jscry.database.tables.dsl.statementSetsTable
import net.jscry.satisfy
import net.jscry.executions.updateExecutionSums
import io.kotlintest.matchers.should
import io.kotlintest.matchers.shouldNotBe
import net.justmachinery.kdbgen.from
import net.justmachinery.kdbgen.selectAll
import net.justmachinery.kdbgen.where

class ExecutionSumsTest : DatabaseTest() {
	init {
		suite("execution sums", init = {
			require(testScriptLineExecution)
			require(testScriptSecondSessionLineExecution)
			require(testScriptVersion2LineExecution)
			updateExecutionSums()
		}) {
			"per-script per-position execution sums should be calculated" {
				from(scriptExecutionSumsTable).selectAll().where { it.scriptId equalTo testScript.get.script.scriptId  }.query() should satisfy { it.size == 1 }
				from(scriptExecutionSumsTable).selectAll().where { it.scriptId equalTo firstScriptVersion2.get.script.scriptId  }.query() should satisfy { it.size == 1 }
			}
			"statement sets should be updated" {
				val memberRow = from(statementSetMembersTable).selectAll()
						.where {
							it.scriptId equalTo testScript.get.script.scriptId
							it.symbolPosition equalTo testScriptLineExecution.get.symbolPosition
						}.query().firstOrNull()
				memberRow shouldNotBe null
				from(statementSetsTable).selectAll().where { it.statementSetId equalTo memberRow!!.statementSetId }.query().first() should satisfy { it.weightedExecutionSum == 5L }
			}
		}
	}
}