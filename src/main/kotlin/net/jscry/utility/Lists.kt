package net.jscry.utility

import org.apache.commons.collections4.list.TreeList
import java.util.*

/**
 * Reverses the transformation applied to negative results in Collections.binarySearch
 */
fun toInsertionPoint(pos : Int) : Int {
	if(pos<0) { return (pos + 1)*-1 }
	else { return pos+1 }
}

fun <T> List<T>.closestUnderOrEqualIndex(value: T, comp : Comparator<T>) : Int? {
	val pos = Collections.binarySearch(this, value, comp)
	val insertionPoint = toInsertionPoint(pos)
	val index = insertionPoint - 1
	if(index < 0){ return null }
	else { return index }
}

fun <T> List<T>.closestUnderOrEqual(value: T, comp : Comparator<T>) : T? {
	val index = closestUnderOrEqualIndex(value, comp)
	if(index == null){ return null }
	else { return this[index] }
}

fun <T> TreeList<T>.sortedInsert(value : T, comp : Comparator<T>){
	val pos = Collections.binarySearch(this, value, comp)
	val insertionPoint = toInsertionPoint(pos)
	this.add(insertionPoint, value)
}

