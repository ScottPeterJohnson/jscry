package net.jscry.scripts.mapping.diff

import com.github.gumtreediff.gen.TreeGenerator
import com.github.gumtreediff.matchers.CompositeMatcher
import com.github.gumtreediff.matchers.MappingStore
import com.github.gumtreediff.matchers.heuristic.gt.GreedyBottomUpMatcher
import com.github.gumtreediff.tree.ITree
import com.github.gumtreediff.tree.TreeContext
import net.jscry.database.tables.dsl.ScriptContentRow
import net.jscry.scripts.mapping.sourcemap.SourceMappings
import net.jscry.scripts.mapping.sourcemap.StandardizedSourceMap
import net.jscry.scripts.mapping.sourcemap.sourceMapAndMappings
import net.jscry.utility.*
import org.apache.commons.collections4.multimap.ArrayListValuedHashMap
import java.io.Reader
import java.util.*


data class ScriptAndSourceMap(val script: String, val sourceMap : StandardizedSourceMap?, val sourceMappings : SourceMappings?)

class VersionMapper(
		private val mappingStore : MappingStore,
        oldTree : ITree,
        newTree : ITree
) {
	private val symbolToOldTreeMap = ArrayListValuedHashMap<Int, ITree>()
	private val newTreeToSymbolMap = mutableMapOf<ITree, Int>()
	init {
		for(item in oldTree.postOrder()){
			symbolToOldTreeMap.put(item.pos, item)
		}
		for(item in newTree.postOrder()){
			newTreeToSymbolMap.put(item, item.pos)
		}
	}
	fun mapOldTreeSymbolPositionToNew(position : Int) : Int? {
		val treeNodes = symbolToOldTreeMap.get(position)
		treeNodes
				.mapNotNull { mappingStore.getDst(it) }
				.forEach { return newTreeToSymbolMap[it] }
		return null
	}
}

/**
 * Diffing batch to save on the expensive operations of tree parsing
 */
class DiffingBatcher {
	/**
	 * @return A version mapper for translating statements identified by symbol position from the old source to the new source
	 */
	fun diffSourcesFromContent(oldSource : ScriptContentRow, newSource : ScriptContentRow) : VersionMapper {
		//A source map will only be useful for us if both have it, so only decode in that case.
		val useSourceMap = oldSource.sourceMap != null && newSource.sourceMap != null
		val old = getDiffingObjects(oldSource, useSourceMap)
		val new = getDiffingObjects(newSource, useSourceMap)
		return diffSources(old, new)
	}

	private fun getDiffingObjects(source : ScriptContentRow, useSourceMap : Boolean) : DiffingObjects {
		if(useSourceMap){
			return diffingObjectsSourceMapCache.getOrPut(source, { createDiffingObjects(source, useSourceMap)})
		} else {
			return diffingObjectsNoSourceMapCache.getOrPut(source, { createDiffingObjects(source, useSourceMap )})
		}
	}

	private fun createDiffingObjects(source : ScriptContentRow, useSourceMap : Boolean) : DiffingObjects {
		val scriptAndSourceMap : ScriptAndSourceMap
		if(useSourceMap){
			val (sourceMap, sourceMappings) = sourceMapAndMappings(source.sourceMap!!)
			scriptAndSourceMap = ScriptAndSourceMap(source.content,
					sourceMap,
					sourceMappings)
		} else {
			scriptAndSourceMap = ScriptAndSourceMap(source.content, null, null)
		}
		val tree = generateTree(scriptAndSourceMap, useSourceMap)
		return DiffingObjects(scriptAndSourceMap.sourceMap,
				scriptAndSourceMap.sourceMappings,
				tree.root)
	}
	private val diffingObjectsSourceMapCache = IdentityHashMap<ScriptContentRow, DiffingObjects>()
	private val diffingObjectsNoSourceMapCache = IdentityHashMap<ScriptContentRow, DiffingObjects>()
	private data class DiffingObjects(val sourceMap : StandardizedSourceMap?, val sourceMappings : SourceMappings?, val tree : ITree)

	private fun diffSources(oldSource: DiffingObjects, newSource : DiffingObjects) : VersionMapper {
		val store = MappingStore()
		//val matcher = CompositeMatchers.ClassicGumtree(oldTree.root, newTree.root, store)
		val matcher = CustomGumtree(oldSource.tree, newSource.tree, store)
		matcher.match()
		return VersionMapper(
				mappingStore = store,
				oldTree = oldSource.tree,
				newTree = newSource.tree
		)
	}
}


private class CustomGumtree(src: ITree, dst: ITree, store: MappingStore) : CompositeMatcher(
		src, dst, store,
		arrayOf(
				OptimizedGreedySubtreeMatcher(src, dst, store),
				GreedyBottomUpMatcher(src, dst, store)
		))

private fun generateTree(source : ScriptAndSourceMap, useSourceMap: Boolean) : TreeContext {
	return AcornGenerator(source, useSourceMap).generateFromString(source.script)
}

private class AcornGenerator(val scriptAndSourceMap: ScriptAndSourceMap, val useSourceMap : Boolean) : TreeGenerator() {
	override fun generate(r: Reader): TreeContext {
		val root = acornParseJavaScript(scriptAndSourceMap.script)
		val visitor = AcornTreeVisitor(scriptAndSourceMap, useSourceMap, root)
		visitor.visit(root, null)
		visitor.context.validate()
		return visitor.context
	}

}
/**
 * This was adapted from Gumtree's RhinoTreeVisitor, with added support for considering the "label" of a statement
 * to be the associated snippet that generated it in the original source.
 * This is more useful than the often uglified label names found in minified JS code
 */
private class AcornTreeVisitor(val scriptAndSourceMap: ScriptAndSourceMap, val useSourceMap: Boolean, root : AcornJsAstWrapper) {
	private val trees: IdentityHashMap<AcornJsAstWrapper, ITree> = IdentityHashMap()
	internal val context = OptimizedTreeContext()
	val scriptLines by lazy { StringWithLines(scriptAndSourceMap.script) }
	val sourceLines by lazy { (scriptAndSourceMap.sourceMap?.sources ?: emptyList()).map { StringWithLines(it) } }

	init {
		context.root = visit(root, null)
	}

	fun visit(node: AcornJsAstWrapper, parentNode: AcornJsAstWrapper?) : ITree {
		val tree = buildTree(node)
		val parent = trees[parentNode]
		parent?.addChild(tree)

		when (node.type) {
			"Identifier" -> {
				if(useSourceMap){
					val nodePos = node.start
					val nodeLinePos : LineAndColumn = scriptLines.atPos(nodePos)!!
					val pos : LineColumnSource = scriptAndSourceMap.sourceMappings!!.mapGeneratedToSource(nodeLinePos.line, nodeLinePos.column)
					if(pos.source != null) {
						val originalSource = this.scriptAndSourceMap.sourceMap!!.sources[pos.source]
						val absolutePos = sourceLines[pos.source].atLine(pos)
						tree.label = originalSource.substring(absolutePos, absolutePos + node.length)
					}
				} else {
					tree.label = node.name as String
				}
			}
			"SimpleLiteral", "RegExpLiteral" -> {
				tree.label = node.raw as String
			}
		}

		for(child in node.children){
			visit(child, node)
		}
		return tree
	}

	private fun buildTree(node: AcornJsAstWrapper): ITree {
		val tree = context.createTree(stringHash(node.type), ITree.NO_LABEL, node.type)
		tree.pos = node.start
		tree.length = node.length
		trees.put(node, tree)
		return tree
	}
}

private class OptimizedTreeContext : TreeContext(){
	override fun createTree(type: Int, label: String?, typeLabel: String?): ITree {
		registerTypeLabel(type, typeLabel)
		return OptimizedTree(type, label)
	}
}