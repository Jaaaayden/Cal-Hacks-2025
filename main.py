import json
import numpy as np
from gensim.models import KeyedVectors

wv = KeyedVectors.load_word2vec_format('GoogleNews-vectors-negative300.bin', binary=True)

node_counter = {"count": 1}

def build_relatedness_tree(wv, root, depth=3, branch_factor=3, context=None, seen=None, node_counter=None):
    """
    Build a semantic relatedness tree and include unique Ids for JSON export.
    """
    if seen is None:
        seen = set()
    seen.add(root)

    current_id = node_counter["count"]
    node_counter["count"] += 1

    node = {"Id": current_id, "word": root, "children": []}

    if depth <= 0:
        return node

    current_vec = wv[root]
    if context is not None:
        vec = (context + current_vec) / 2.0
    else:
        vec = current_vec

    similar = wv.similar_by_vector(vec, topn=branch_factor * 2)
    children_added = 0

    for word, score in similar:
        if word not in seen and children_added < branch_factor:
            child = build_relatedness_tree(
                wv, word, depth - 1, branch_factor, vec, seen, node_counter
            )
            node["children"].append(child)
            children_added += 1

    return node

tree = build_relatedness_tree(wv, 'king', depth=4, branch_factor=3, node_counter=node_counter)

with open("word_tree.json", "w", encoding="utf-8") as f:
    json.dump(tree, f, indent=2, ensure_ascii=False)

def print_tree(node, level=0):
    print("  " * level + f"{node['word']} (Id={node['Id']})")
    for child in node.get("children", []):
        print_tree(child, level + 1)

print_tree(tree)