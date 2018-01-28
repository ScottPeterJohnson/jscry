package net.jscry

import com.github.andrewoma.kwery.core.ManualTransaction
import io.kotlintest.Spec
import io.kotlintest.TestCase
import io.kotlintest.TestSuite
import net.jscry.database.tables.dsl.*
import net.jscry.utility.query
import net.jscry.utility.singleManualSession
import net.jscry.utility.stringHash
import net.justmachinery.kdbgen.insert
import net.justmachinery.kdbgen.into
import net.justmachinery.kdbgen.returningAll
import java.io.InputStreamReader
import java.util.*

private var currentTestTransaction: ManualTransaction? = null
abstract class DatabaseTest : Spec() {
	val sql = singleManualSession(unitTestConfig)


	fun <T> require(requirement: TestData<T>): T = requirement.require()

	private var current = rootTestSuite

	private fun withTransaction(init: ()->Unit) : ()->Unit = {
			currentTestTransaction = sql.manualTransaction().also { it.rollbackOnly = true }
			try {
				init()
			} finally {
				currentTestTransaction!!.rollback()
				currentTestTransaction = null
			}
	}

	private var testCaseInitializer: (()->Unit)? = null
	fun suite(suiteName : String, init : ()->Unit, cases : ()->Unit){
		val suite = TestSuite(suiteName)
		current.addNestedSuite(suite)
		val temp = current
		current = suite
		testCaseInitializer = init
		cases()
		testCaseInitializer = null
		current = temp
	}

	infix operator fun String.invoke(run: () -> Unit): TestCase {
		val initializer = testCaseInitializer?:{}
		val tc = TestCase(
				suite = current,
				name = this,
				test = withTransaction({ initializer(); run() }),
				config = defaultTestCaseConfig)
		current.addTestCase(tc)
		return tc
	}
}

interface TestData<out T> {
	fun require(): T
	val get: T
}

fun <T> testData(initializer: () -> T): TestData<T> = object : TestData<T> {
	private var transaction: ManualTransaction? = null
	private var _val : T? = null
	override val get: T
		get(){
			if(_val == null || transaction != currentTestTransaction){
				transaction = currentTestTransaction
				_val = initializer()
			}
			return _val!!
		}
	override fun require() = get
}

class DatabaseTestData {
	companion object {
		val developerKey = testData {
			into(projectsTable).insert { values { it
					.apiKey(UUID.fromString("e5b72ba4-9c06-47aa-86b3-193b78732aa9"))
					.name("Developer key")
			} }.returningAll().query().first()
		}
		val developerUser = testData {
			into(usersTable).insert { values { it
					.uid("7yAwpgpG9oZuuJPmjxwhVESBko12")
					.email("test@developer.com")
					.name("Test Developer")
			} }.returningAll().query().first()
		}
		val developerUserApiKey = testData {
			into(userProjectsTable).insert { values { it
					.userId(developerUser.get.userId)
					.apiKey(developerKey.get.apiKey)

			} }.returningAll().query().first()
		}

		data class ScriptWithContent(val script: ScriptsRow, val content: ScriptContentRow)

		private fun scriptJs(location: String) = InputStreamReader(ClassLoader.getSystemClassLoader().getResourceAsStream("$location")).readText()
		fun script(name: String,
		           urlName: String = name,
		           version: Int = 1,
		           apiKey: TestData<ProjectsRow> = developerKey,
		           hash: Int? = null,
		           fileName : String = "scripts/$name$version.js" ): TestData<ScriptWithContent> {
			return testData {
				val js = scriptJs(fileName)
				val script = into(scriptsTable).insert { values { it
						.apiKey(apiKey.get.apiKey)
						.url("localhost:80/$urlName.js")
						.hash(hash ?: stringHash(js))
				} }.returningAll().query().first()
				val content = into(scriptContentTable).insert { values { it
						.scriptId(script.scriptId)
						.content(js)
						.sourceMap(null)
				} }.returningAll().query().first()
				ScriptWithContent(script, content)
			}
		}

		val testScript = script(name = "Test")

		val firstScriptVersion2 = script(name = "Test", version = 2)

		val fooScript = script(name = "Foo")

		val firstSession = testData {
			into(transformedSessionsTable).insert { values { it
					.apiKey(developerKey.get.apiKey)
					.ipAddress("127.0.0.1")
			} }.returningAll().query().first()
		}
		val secondSession = testData {
			into(transformedSessionsTable).insert { values { it
					.apiKey(developerKey.get.apiKey)
					.ipAddress("127.0.0.1")
			} }.returningAll().query().first()
		}

		fun execution(script: TestData<ScriptWithContent>,
		              symbolPosition: Int,
		              weightedExecutions: Long = 1): TestData<UnsummedExecutedLinesRow> = testData {
			into(unsummedExecutedLinesTable).insert { values { it
					.scriptId(script.get.script.scriptId)
					.symbolPosition(symbolPosition)
					.weightedExecutions(weightedExecutions)
			} }.returningAll().query().first()


		}

		val testScriptLineExecution = execution(testScript, symbolPosition = 0, weightedExecutions = 3)

		val testScriptSecondSessionLineExecution = execution(testScript,
				symbolPosition = 0,
				weightedExecutions = 2)

		val testScriptVersion2LineExecution = execution(script = firstScriptVersion2,
				symbolPosition = 0,
				weightedExecutions = 1)
	}
}