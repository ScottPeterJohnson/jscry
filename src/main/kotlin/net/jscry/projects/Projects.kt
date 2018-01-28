package net.jscry.projects

import net.jscry.database.tables.dsl.ProjectsRow
import net.jscry.database.tables.dsl.projectsTable
import net.jscry.utility.MaybeLoadingCacheView
import net.jscry.utility.query
import net.justmachinery.kdbgen.from
import net.justmachinery.kdbgen.selectAll
import net.justmachinery.kdbgen.where
import java.util.*
import java.util.concurrent.TimeUnit

private val projectsCache = MaybeLoadingCacheView<UUID, ProjectsRow>(163, { key ->
	from(projectsTable).selectAll().where { it.apiKey equalTo key}.query().firstOrNull()
}).apply { expireAfter(15, TimeUnit.MINUTES) }


fun lookupCachedProject(apiKey : UUID) : ProjectsRow? {
	return projectsCache.maybeLoad(apiKey)
}

fun validProject(apiKey : UUID) : Boolean {
	return lookupCachedProject(apiKey) != null
}

fun loadProject(key : UUID) : ProjectsRow? {
	return from(projectsTable).selectAll().where { it.apiKey equalTo key}.query().firstOrNull()
}