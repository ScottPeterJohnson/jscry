package net.jscry.scripts.mapping.diff

import com.github.gumtreediff.tree.AbstractTree
import com.github.gumtreediff.tree.AssociationMap
import com.github.gumtreediff.tree.ITree
import com.github.gumtreediff.tree.TreeUtils
import com.github.gumtreediff.tree.hash.RollingHashGenerator
import java.util.*

/**
 * Slightly optimized version of gumtree's Tree
 */
class OptimizedTree : AbstractTree, ITree {

	// Type of the token
	internal var type: Int = 0

	// Label of the token
	internal var label: String

	// Begin position of the tree in terms of absolute character index
	internal var pos: Int = 0
	internal var length: Int = 0
	// End position

	private var metadata: AssociationMap? = null

	internal constructor(type: Int, label: String?) {
		this.type = type
		this.label = label ?: ITree.NO_LABEL
		this.id = ITree.NO_ID
		this.depth = ITree.NO_VALUE
		this.hash = ITree.NO_VALUE
		this.height = ITree.NO_VALUE
		this.depth = ITree.NO_VALUE
		this.size = ITree.NO_VALUE
		this.pos = ITree.NO_VALUE
		this.length = ITree.NO_VALUE
		this.matched = false
		this.children = ArrayList<ITree>()
	}

	// Only used for cloning ...
	private constructor(other: OptimizedTree) {
		this.type = other.type
		this.label = other.getLabel()

		this.id = other.getId()
		this.matched = other.isMatched
		this.pos = other.getPos()
		this.length = other.getLength()
		this.height = other.getHeight()
		this.size = other.getSize()
		this.depth = other.getDepth()
		this.hash = other.getHash()
		this.depth = other.getDepth()
		this.children = ArrayList<ITree>()
		this.metadata = other.metadata
	}

	override fun addChild(t: ITree) {
		children.add(t)
		t.parent = this
	}

	override fun deepCopy(): OptimizedTree {
		val copy = OptimizedTree(this)
		for (child in getChildren())
			copy.addChild(child.deepCopy())
		return copy
	}

	override fun getChildren(): List<ITree> {
		return children
	}

	override fun getLabel(): String {
		return label
	}

	override fun getLength(): Int {
		return length
	}

	override fun getParent(): ITree? {
		return parent
	}

	override fun getPos(): Int {
		return pos
	}

	override fun getType(): Int {
		return type
	}

	override fun setChildren(children: List<ITree>) {
		this.children = children
		for (c in children)
			c.parent = this
	}

	override fun setLabel(label: String) {
		this.label = label
	}

	override fun setLength(length: Int) {
		this.length = length
	}

	override fun setParent(parent: ITree?) {
		this.parent = parent
	}

	override fun setParentAndUpdateChildren(parent: ITree?) {
		if (this.parent != null) this.parent.children.remove(this)
		this.parent = parent
		if (this.parent != null) parent!!.children.add(this)
	}

	override fun setPos(pos: Int) {
		this.pos = pos
	}

	override fun setType(type: Int) {
		this.type = type
	}

	override fun getMetadata(key: String): Any? {
		if (metadata == null)
			return null
		return metadata!!.get(key)
	}

	override fun setMetadata(key: String, value: Any?): Any? {
		if (value == null) {
			if (metadata == null)
				return null
			else
				return metadata!!.remove(key)
		}
		if (metadata == null)
			metadata = AssociationMap()
		return metadata!!.set(key, value)
	}

	override fun getMetadata(): Iterator<MutableMap.MutableEntry<String, Any>> {
		if (metadata == null)
			return EmptyEntryIterator()
		return metadata!!.iterator()
	}

	protected class EmptyEntryIterator : Iterator<MutableMap.MutableEntry<String, Any>> {
		override fun hasNext(): Boolean {
			return false
		}

		override fun next(): MutableMap.MutableEntry<String, Any> {
			throw NoSuchElementException()
		}
	}

	//Changed: uses java hash instead of MD5
	override fun refresh() {
		TreeUtils.computeSize(this)
		TreeUtils.computeDepth(this)
		TreeUtils.computeHeight(this)
		javaHashGenerator.hash(this)
	}

	//Changed: doesn't use string.format
	override fun toShortString() : String {
		return "$type${ITree.SEPARATE_SYMBOL}$label"
	}
}

private val javaHashGenerator = RollingHashGenerator.JavaRollingHashGenerator()