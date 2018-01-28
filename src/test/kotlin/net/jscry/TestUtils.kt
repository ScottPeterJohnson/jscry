package net.jscry

import io.kotlintest.matchers.Matcher
import io.kotlintest.matchers.Result

fun <T> satisfy(condition : (T)->Boolean) = object : Matcher<T> {
	override fun test(value: T): Result {
		return Result(condition(value), "$value should match $condition")
	}

}