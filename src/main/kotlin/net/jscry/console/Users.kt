package net.jscry.console

import net.jscry.database.tables.dsl.UsersRow
import net.jscry.database.tables.dsl.userProjectsTable
import net.jscry.utility.CacheView
import net.jscry.utility.dataClassMapper
import net.jscry.utility.query
import net.jscry.utility.sql
import net.justmachinery.kdbgen.from
import net.justmachinery.kdbgen.select
import net.justmachinery.kdbgen.where
import java.util.*

typealias FirebaseUid = String
class UsersCache : CacheView<FirebaseUid, UsersRow>(34) {
	fun ensureExists(auth : AuthenticationToken){
		this.fetchOrCreate(auth)
	}
	fun fetchOrCreate(auth : AuthenticationToken) : UsersRow {
		return getOrPut(auth.uid, {
			//language=PostgreSQL
			val statement = """
				INSERT INTO users(uid, email, name)
				VALUES(:uid, :email, :name)
				ON CONFLICT(uid) DO UPDATE
				SET email = excluded.email,
					name = excluded.name RETURNING *
			""".trimIndent()
			sql.select(statement, mapOf("uid" to auth.uid, "email" to auth.email, "name" to auth.name), mapper = dataClassMapper(UsersRow::class)).first()
		})
	}
}
val usersCache = UsersCache()

data class User(val userId: Long, val email: String, val name: String)

fun getUserAccessibleApiKeys(userId: Long): Set<UUID> {
	return from(userProjectsTable).select(userProjectsTable.apiKey).where { it.userId equalTo userId }.query().map { it.first }.toSet()
}