import json
import numpy as np
from gensim.models import KeyedVectors

# Load pretrained model
wv = KeyedVectors.load_word2vec_format('GoogleNews-vectors-negative300.bin', binary=True)

vec_cache = {}
def get_vec(word):
    if word in vec_cache:
        return vec_cache[word]
    if word in wv:
        vec_cache[word] = wv[word]
        return vec_cache[word]
    return None

def cosine(a, b):
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

def normalize(word):
    word = word.lower().replace('_', ' ')
    if word.endswith('s'):
        word = word[:-1]
    return word.strip()

def is_clean_word(w):
    """Filter out names or entities."""
    return w.islower() and "_" not in w and not any(c.isdigit() for c in w)

def build_relatedness_tree(
    wv,
    root,
    depth=3,
    branch_factor=3,
    context=None,
    seen=None,
    node_counter=None,
    root_vec=None
):
    if node_counter is None:
        node_counter = {"count": 1}
    if seen is None:
        seen = set()

    norm_root = normalize(root)
    if norm_root in seen or root not in wv:
        return None
    seen.add(norm_root)

    if root_vec is None:
        root_vec = get_vec(root)

    current_id = node_counter["count"]
    node_counter["count"] += 1
    node = {"Id": current_id, "word": root, "children": []}

    if depth <= 0:
        return node

    current_vec = get_vec(root)
    if current_vec is None:
        return node

    vec = (context + current_vec) / 2.0 if context is not None else current_vec
    candidates = wv.similar_by_vector(vec, topn=branch_factor * 30)

    scored_candidates = []
    for cand, _ in candidates:
        if not is_clean_word(cand):
            continue
        v = get_vec(cand)
        if v is None:
            continue
        n_cand = normalize(cand)
        if n_cand in seen:
            continue

        sim_to_parent = cosine(v, current_vec)
        sim_to_root = cosine(v, root_vec)
        combined = 0.75 * sim_to_parent + 0.25 * sim_to_root
        scored_candidates.append((cand, combined, sim_to_root, v))

    # Sort by combined score
    scored_candidates.sort(key=lambda x: x[1], reverse=True)

    selected_words, selected_vecs = [], []

    root_floor = 0.25
    sibling_limit = 0.82

    for cand, score, root_sim, v in scored_candidates:
        # If too few selected, relax constraints slightly
        if len(selected_words) < branch_factor // 2:
            root_floor = 0.2
            sibling_limit = 0.85

        if root_sim < root_floor:
            continue

        if any(cosine(v, sv) > sibling_limit for sv in selected_vecs):
            continue

        selected_words.append(cand)
        selected_vecs.append(v)

        if len(selected_words) >= branch_factor:
            break

    for word in selected_words:
        child = build_relatedness_tree(
            wv, word, depth - 1, branch_factor, vec, seen, node_counter, root_vec
        )
        if child:
            node["children"].append(child)

    return node


# Example usage
if __name__ == "__main__":
    node_counter = {"count": 1}
    tree = build_relatedness_tree(wv, 'pokemon', depth=4, branch_factor=5, node_counter=node_counter)
    
    with open("word_tree.json", "w", encoding="utf-8") as f:
        json.dump(tree, f, indent=2, ensure_ascii=False)

    def print_tree(node, level=0):
        print("  " * level + f"{node['word']} (Id={node['Id']})")
        for child in node.get("children", []):
            print_tree(child, level + 1)

    print_tree(tree)