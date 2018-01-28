interface BranchingListNode<T> {
	root? : BranchingListNode<T>
	previous? : BranchingListNode<T>
	value : T
}

function newBranchingListRoot<T>(value : T) : BranchingListNode<T>{
	const result: BranchingListNode<T> = {
		root: undefined,
		previous: undefined,
		value: value
	};
	result.root = result;
	return result;
}

function addToBranchingList<T>(node : BranchingListNode<T>, value : T) : BranchingListNode<T>{
	return {
		root : node.root,
		previous: node,
		value: value
	};
}

const emptyBranchingListRoot: BranchingListNode<any> = newBranchingListRoot(null);
