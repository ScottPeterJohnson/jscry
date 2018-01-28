package net.jscry.scripts.mapping.diff

import com.github.gumtreediff.matchers.Mapping
import com.github.gumtreediff.matchers.MappingStore
import com.github.gumtreediff.matchers.MultiMappingStore
import com.github.gumtreediff.matchers.heuristic.gt.SubtreeMatcher
import com.github.gumtreediff.tree.ITree
import java.util.*

/**
 * Most of this osurce is derived from Gumtree's GreedySubtreeMatcher- forced to copy the thing in order to change some behavior (changes highlighted by comments)
 */
class OptimizedGreedySubtreeMatcher(src: ITree, dst: ITree, store: MappingStore) : SubtreeMatcher(src, dst, store) {
	override fun filterMappings(multiMappings: MultiMappingStore) {
		// Select unique mappings first and extract ambiguous mappings.
		val ambiguousList = LinkedList<Mapping>()
		val ignored = HashSet<ITree>()
		for (src in multiMappings.srcs) {
			if (multiMappings.isSrcUnique(src))
				addFullMapping(src, multiMappings.getDst(src).iterator().next())
			else if (!ignored.contains(src)) {
				val adsts = multiMappings.getDst(src)
				val asrcs = multiMappings.getSrc(multiMappings.getDst(src).iterator().next())
				for (asrc in asrcs)
					for (adst in adsts)
						ambiguousList.add(Mapping(asrc, adst))
				ignored.addAll(asrcs)
			}
		}

		// Rank the mappings by score.
		val srcIgnored = HashSet<ITree>()
		val dstIgnored = HashSet<ITree>()
		Collections.sort(ambiguousList, MappingComparator(ambiguousList))

		// Select the best ambiguous mappings
		while (ambiguousList.size > 0) {
			val ambiguous = ambiguousList.removeAt(0)
			if (!(srcIgnored.contains(ambiguous.getFirst()) || dstIgnored.contains(ambiguous.getSecond()))) {
				addFullMapping(ambiguous.getFirst(), ambiguous.getSecond())
				srcIgnored.add(ambiguous.getFirst())
				dstIgnored.add(ambiguous.getSecond())
			}
		}
	}

	private inner class MappingComparator(mappings: List<Mapping>) : Comparator<Mapping> {

		private val simMap = HashMap<Mapping, Double>()

		override fun compare(m1: Mapping, m2: Mapping): Int {
			return java.lang.Double.compare(simMap[m2]!!, simMap[m1]!!)
		}

		private val srcDescendants = HashMap<ITree, List<ITree>>()

		private val dstDescendants = HashMap<ITree, Set<ITree>>()

		//Added
		private val commonDescendents = HashMap<Pair<ITree, ITree>, Int>()

		init {
			for (mapping in mappings)
				simMap.put(mapping, sim(mapping.getFirst(), mapping.getSecond()))
		}

		protected fun numberOfCommonDescendants(src: ITree, dst: ITree): Int {
			//Added memoization
			return commonDescendents.getOrPut(Pair(src, dst), {
				if (!srcDescendants.containsKey(src))
					srcDescendants.put(src, src.descendants)
				if (!dstDescendants.containsKey(dst))
					dstDescendants.put(dst, HashSet(dst.descendants))
				var common = 0

				for (t in srcDescendants[src]!!) {
					val m = mappings.getDst(t)
					if (m != null && dstDescendants[dst]!!.contains(m))
						common++
				}
				common
			})
		}

		protected fun sim(src: ITree, dst: ITree): Double {
			val jaccard = jaccardSimilarity(src.parent, dst.parent)
			val posSrc = if (src.isRoot) 0 else src.parent.getChildPosition(src)
			val posDst = if (dst.isRoot) 0 else dst.parent.getChildPosition(dst)
			val maxSrcPos = if (src.isRoot) 1 else src.parent.children.size
			val maxDstPos = if (dst.isRoot) 1 else dst.parent.children.size
			val maxPosDiff = Math.max(maxSrcPos, maxDstPos)
			val pos = 1.0 - Math.abs(posSrc - posDst).toDouble() / maxPosDiff.toDouble()
			val po = 1.0 - Math.abs(src.id - dst.id).toDouble() / this@OptimizedGreedySubtreeMatcher.maxTreeSize.toDouble()
			return 100 * jaccard + 10 * pos + po
		}

		protected fun jaccardSimilarity(src: ITree, dst: ITree): Double {
			val num = numberOfCommonDescendants(src, dst).toDouble()
			val den = srcDescendants[src]!!.size.toDouble() + dstDescendants[dst]!!.size.toDouble() - num
			return num / den
		}

	}
}