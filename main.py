import numpy as np
from gensim.models import KeyedVectors 
wv = KeyedVectors.load_word2vec_format('GoogleNews-vectors-negative300.bin', binary=True)

def build_relatedness_tree(wv, root, depth=3, branch_factor=3, context=None, seen=None):
    """
    Build a tree where each branch is based on cumulative semantic context,
    not just direct similarity to the root.
    """
    if seen is None:
        seen = set()

    seen.add(root)
    node = {"word": root, "children": []}

    if depth <= 0:
        return node

    # Build a composite context vector (average of path so far)
    current_vec = wv[root]
    if context is not None:
        vec = (context + current_vec) / 2.0
    else:
        vec = current_vec

    # Find nearest neighbors to this *contextual* vector
    similar = wv.similar_by_vector(vec, topn=branch_factor * 2)  # get a few more to filter

    children_added = 0
    for word, score in similar:
        if word not in seen and children_added < branch_factor:
            child = build_relatedness_tree(wv, word, depth - 1, branch_factor, vec, seen)
            node["children"].append(child)
            children_added += 1

    return node

tree = build_relatedness_tree(wv, 'king', depth=4, branch_factor=3)

def print_tree(node, level=0):
    print("  " * level + node["word"])
    for child in node["children"]:
        print_tree(child, level + 1)

print_tree(tree)