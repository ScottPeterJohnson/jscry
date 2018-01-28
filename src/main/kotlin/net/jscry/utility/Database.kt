package net.jscry.utility

import com.github.andrewoma.kwery.core.DefaultSession
import com.github.andrewoma.kwery.core.Row
import com.github.andrewoma.kwery.core.Session
import com.github.andrewoma.kwery.core.ThreadLocalSession
import com.github.andrewoma.kwery.core.dialect.PostgresDialect
import com.google.gson.FieldNamingPolicy
import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.mchange.v2.c3p0.ComboPooledDataSource
import net.jscry.ServerConfig
import net.justmachinery.kdbgen.*
import java.util.*
import javax.sql.DataSource
import kotlin.reflect.KClass

private var _sql: Session? = null
val sql: Session
	get() = _sql ?: throw IllegalStateException("Database session not initialized")

fun getDataSource(config: ServerConfig): DataSource {
	val dataSource = ComboPooledDataSource()
	dataSource.driverClass = "org.postgresql.Driver"
	dataSource.jdbcUrl = config.databaseUrl
	dataSource.maxPoolSize = 30
	return dataSource
}

fun setupDatabase(config: ServerConfig) {
	if (_sql == null) {
		val dataSource = getDataSource(config)
		_sql = ThreadLocalSession(dataSource, PostgresDialect())
	}
}

fun singleManualSession(config: ServerConfig): Session {
	val dataSource = getDataSource(config)
	_sql = DefaultSession(dataSource.connection, PostgresDialect())
	return sql
}


fun <Data : SqlResult> dataClassMapper(dataClass: KClass<Data>): (Row) -> Data {
	val mapper = resultMapper(dataClass)
	return {
		mapper.invoke(it.resultSet)
	}
}

val rowJsonGson : Gson = ({
	val gsonBuilder = GsonBuilder()
	gsonBuilder.setFieldNamingPolicy(FieldNamingPolicy.LOWER_CASE_WITH_UNDERSCORES)
	gsonBuilder.create()
})()

inline fun <reified Data : SqlResult> jsonRow(json : String): Data {
	return rowJsonGson.fromJson(json, Data::class.java)
}

fun <Op : SqlOp, On : OnTarget> Statement<Op, On, NotProvided>.execute(): Unit {
	sql.transaction { this.execute(sql.connection) }
}

inline fun <Op : SqlOp, On : OnTarget, reified Result : SqlResult> Statement<Op, On, Result>.query(): List<Result> {
	return sql.transaction { this.execute(sql.connection) }
}

/**
 * BE CAREFUL when using this method: More than 32k parameters will cause Postgres great unhappiness
 */
fun multiValue(rows : List<List<Any>>) : Pair<String, Map<String, Any?>> {
	assert(rows.isNotEmpty())
	assert(rows.map { it.size }.sum() < 32 * 1000, { "Too many parameters for multiValue!" })
	var paramCount = 0
	val paramMap = mutableMapOf<String,Any?>()
	val sql = rows.map {
		"(" + it.map {
			val paramName = multiValueParamName(paramCount++)
			paramMap.put(paramName, it)
			":" + paramName
		}.joinToString(",") + ")"
	}.joinToString(",")
	return Pair(sql, paramMap)
}

private val characters = "abcdefghijklmnopqrstuvwxyz"
private fun multiValueParamName(num : Int) : String {
	return "m_" + num.toString(26).map { characters[Integer.valueOf(it.toString(), 26)] }.joinToString("")
}

fun Row.uuid(name: String): UUID = this.obj(name) as UUID

fun underscore(name: String): String {
	return name.mapIndexed { index, char -> if (index != 0 && char.isUpperCase()) "_" + char else char.toString() }.joinToString(
			"")
}

fun underscoreToTypeName(name: String): String {
	return name.split("_").map(String::capitalize).joinToString("")
}

