#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Similarity Tree Builder with:
- Hybrid typo filtering (heuristics + dictionary + allow/deny)
- Morphological family collapse (lemma/stem)
- Sibling diversity (edit-distance + embedding cosine)
- Pretty console output + optional JSON/Markdown export

Run directly "in code" by editing CONFIG at bottom (default), or enable CLI by setting USE_CLI=True.
"""

import json
import re
import os
import asyncio
import aiofiles
from typing import List, Dict, Any, Optional, Tuple, Set

from gensim.models import KeyedVectors

# -----------------------------
# Optional pretty console output
# -----------------------------
try:
    from colorama import Fore, Style, init as colorama_init
    colorama_init(autoreset=True)
    COLOR_ENABLED = True
except Exception:
    COLOR_ENABLED = False
    class _N: RESET_ALL = ""
    class _F: CYAN = ""
    Fore = _F(); Style = _N()

# -----------------------------
# Optional dictionary (spelling)
# -----------------------------
try:
    from spellchecker import SpellChecker
    SPELLCHECK_AVAILABLE = True
except Exception:
    SpellChecker = None
    SPELLCHECK_AVAILABLE = False

# -----------------------------
# Optional NLP lemmatization
# -----------------------------
try:
    import nltk
    from nltk.stem import WordNetLemmatizer
    _lemmatizer = WordNetLemmatizer()
    _NLTK_OK = True
except Exception:
    _lemmatizer = None
    _NLTK_OK = False

# -----------------------------
# Optional fast edit distance
# -----------------------------
try:
    from rapidfuzz.distance import Levenshtein
    def _norm_sim(a: str, b: str) -> float:
        return Levenshtein.normalized_similarity(a, b)  # 0..1
    _RF_OK = True
except Exception:
    _RF_OK = False
    def _norm_sim(a: str, b: str) -> float:
        # Minimal fallback: crude similarity: 1.0 if containment, else ~0.0
        a, b = a.lower(), b.lower()
        return 1.0 if (a in b or b in a) else 0.0

# =============================
# Basic text utilities
# =============================

def normalize(word: str) -> str:
    """Lowercase and remove simple plural forms."""
    w = word.lower()
    if w.endswith('es'):
        w = re.sub(r'es$', '', w)
    elif w.endswith('s'):
        w = re.sub(r's$', '', w)
    return w

def is_clean_word(word: str) -> bool:
    """Starts and ends with a letter (ASCII)."""
    return bool(re.match(r'^[a-zA-Z].*[a-zA-Z]$', word))

def is_probable_shape(word: str) -> bool:
    """
    Lightweight shape heuristics to filter obvious junk/typos.
    Allow short ALL-CAPS acronyms (<=5), else only letters, min len 3, no triple repeats.
    """
    w = word.strip()
    if 1 < len(w) <= 5 and w.isupper():
        return True
    if not re.fullmatch(r"[A-Za-z]+", w):
        return False
    if len(w) < 3:
        return False
    if re.search(r"(.)\1{2,}", w):
        return False
    return True

# =============================
# Hybrid misspelling filter
# =============================

class HybridFilter:
    def __init__(
        self,
        allow: Optional[Set[str]] = None,
        deny: Optional[Set[str]] = None,
        language: str = "en",
        spell_distance: int = 1,
        use_spell: Optional[bool] = None,
    ):
        """
        allow/deny: case-insensitive sets (lowercased inside).
        language: pyspellchecker language ('en', 'es', ...), if installed.
        use_spell: force-enable/disable spellcheck; default=True if available.
        """
        self.allow = {a.lower() for a in (allow or set())}
        self.deny  = {d.lower() for d in (deny  or set())}
        self.use_spell = SPELLCHECK_AVAILABLE if use_spell is None else use_spell

        if self.use_spell and SPELLCHECK_AVAILABLE:
            try:
                self.spell = SpellChecker(language=language, distance=spell_distance)
            except Exception:
                self.spell = SpellChecker(distance=spell_distance)
            if self.allow:
                self.spell.word_frequency.load_words(list(self.allow))
        else:
            self.spell = None

    def is_valid(self, word: str) -> bool:
        """
        Decision order: whitelist -> shape -> blacklist -> dictionary.
        """
        w = normalize(word)

        if w in self.allow:
            return True
        if not is_clean_word(w) or not is_probable_shape(w):
            return False
        if w in self.deny:
            return False
        if self.spell and len(w) > 3 and not w.isupper():
            if (w not in self.spell) and (self.spell.correction(w) != w):
                return False
        return True

# =============================
# Morphological canonicalization
# =============================

def _suffix_stem(w: str) -> str:
    # Very light suffix stripping fallback
    for suf in ("ations", "ation", "ators", "ator", "ating", "ated", "ates", "ative",
                "ments", "ment", "ings", "ing", "ers", "er", "ed", "es", "s"):
        if w.endswith(suf) and len(w) - len(suf) >= 3:
            return w[: -len(suf)]
    return w

def canonical_key(word: str) -> str:
    """
    Map inflectional variants to a common key.
    Prefer WordNet lemma if available; otherwise suffix stem.
    """
    w = normalize(word)
    if _NLTK_OK and _lemmatizer:
        try:
            ln = _lemmatizer.lemmatize(w, pos='n')
            lv = _lemmatizer.lemmatize(ln, pos='v')
            return lv
        except Exception:
            pass
    return _suffix_stem(w)

def keep_best_per_family(cands, score_getter):
    """
    Keep only the top-scoring representative per canonical family.
    cands: iterable of (token, score) or tokens; score_getter(token)->float
    """
    best = {}
    for item in cands:
        tok, sc = item if isinstance(item, tuple) else (item, score_getter(item))
        fam = canonical_key(tok)
        if fam not in best or sc > best[fam][1]:
            best[fam] = (tok, sc)
    # preserve first occurrence order of winning reps
    seen = set()
    out = []
    for item in cands:
        tok, sc = item if isinstance(item, tuple) else (item, score_getter(item))
        fam = canonical_key(tok)
        if fam in best and fam not in seen and best[fam][0] == tok:
            out.append((tok, sc))
            seen.add(fam)
    return out

# =============================
# Sibling diversity checks
# =============================

def near_duplicate_str(a: str, b: str, max_norm_sim: float = 0.84) -> bool:
    """True if strings are nearly identical (edit-distance similarity high)."""
    try:
        sim = _norm_sim(a, b)  # 0..1
    except Exception:
        sim = 0.0
    return sim >= max_norm_sim

def too_similar_by_embedding(wv: KeyedVectors, a: str, b: str, max_cos: float = 0.78) -> bool:
    """True if embeddings are too close (semantic duplicates)."""
    try:
        return float(wv.similarity(a, b)) >= max_cos
    except KeyError:
        return False

# =============================
# Vector helpers
# =============================

def pick_token(wv: KeyedVectors, base: str) -> Optional[str]:
    """Try variants to find an in-vocab token."""
    for c in (base, base.lower(), base.title(), base.upper(),
              f"{base}|N", f"{base}.n", f"{base}_NOUN"):
        if c in wv.key_to_index:
            return c
    hits = [t for t in wv.key_to_index if base.lower() in t.lower()]
    return hits[0] if hits else None

def safe_sim(wv: KeyedVectors, a: str, b: str) -> Optional[float]:
    """Cosine similarity with graceful handling of OOV tokens."""
    try:
        return float(wv.similarity(a, b))
    except KeyError:
        return None

# =============================
# Retrieval with hybrid filter
# =============================

def get_clean_similar(
    wv: KeyedVectors,
    base: str,
    target_count: int = 10,
    expand_factor: int = 5,
    forbidden_norms: Optional[set] = None,
    word_filter: Optional[HybridFilter] = None,
) -> List[Tuple[str, float]]:
    """
    Get at least `target_count` filtered similar words.
    Expands search if too few remain after filtering.
    `forbidden_norms` prevents duplicates across the whole tree.
    """
    root = pick_token(wv, base)
    if not root:
        return []

    base_norm = normalize(root)
    seen_local = set()
    result: List[Tuple[str, float]] = []
    multiplier = 1
    forbidden_norms = forbidden_norms or set()
    word_filter = word_filter or HybridFilter()

    while len(result) < target_count:
        temp = wv.most_similar(root, topn=max(10, target_count * expand_factor * multiplier))
        for word, score in temp:
            norm = normalize(word)
            if (
                norm not in seen_local
                and norm not in forbidden_norms
                and base_norm not in norm
                and norm not in base_norm
                and word_filter.is_valid(word)
            ):
                seen_local.add(norm)
                result.append((word, score))
                if len(result) >= target_count:
                    break
        multiplier += 1
        if multiplier > 6:  # safety cap
            break

    return result[:target_count]

# =============================
# Tree builder (with dedupe/diversity)
# =============================

def build_similarity_tree(
    wv: KeyedVectors,
    root_word: str,
    depth: int = 4,
    breadth: int = 4,
    min_sim_to_parent: float = 0.32,
    min_sim_to_root: float = 0.28,
    extra_expand_factor: int = 6,
    word_filter: Optional[HybridFilter] = None,
) -> Dict[str, Any]:
    """
    Build a tree where:
      - depth: total levels including root (e.g., 4 => levels 0,1,2,3)
      - breadth: number of children per node
      - Each child ~ parent AND ~ root, and passes the hybrid spelling filter.
    Returns: {"token": str, "score_to_parent": float|None, "children": [...]}
    """
    word_filter = word_filter or HybridFilter()
    root_token = pick_token(wv, root_word)
    if not root_token:
        return {"word": root_word, "children": []}

    root_norm = normalize(root_token)
    used_norms = {root_norm}  # Global dedupe

    def choose_children(parent_token: str, level: int) -> List[Tuple[str, float]]:
        pool_target = max(60, breadth * 12)
        raw = get_clean_similar(
            wv,
            parent_token,
            target_count=pool_target,
            expand_factor=extra_expand_factor,
            forbidden_norms=used_norms,
            word_filter=word_filter,
        )

        # Collapse morphological families: keep top-scoring form per family
        raw = keep_best_per_family(raw, score_getter=lambda t: t[1])

        picked: List[Tuple[str, float]] = []
        sibling_tokens: List[str] = []

        for cand, _ in raw:
            c_norm = normalize(cand)
            if c_norm in used_norms:
                continue
            if not word_filter.is_valid(cand):
                continue

            sp = safe_sim(wv, parent_token, cand)
            if sp is None or sp < min_sim_to_parent:
                continue

            if level >= 1:
                sr = safe_sim(wv, root_token, cand)
                if sr is None or sr < min_sim_to_root:
                    continue

            # Sibling diversity: reject near-duplicates of already-picked siblings
            is_dup = False
            for sib in sibling_tokens:
                if near_duplicate_str(cand, sib, max_norm_sim=0.84) or \
                   too_similar_by_embedding(wv, cand, sib, max_cos=0.78):
                    is_dup = True
                    break
            if is_dup:
                continue

            picked.append((cand, float(sp)))   # store sim-to-parent
            sibling_tokens.append(cand)
            used_norms.add(c_norm)

            if len(picked) >= breadth:
                break

        return picked

    def build_node(token: str, score: Optional[float], level: int) -> Dict[str, Any]:
        node = {"word": token, "children": []}
        if level >= depth - 1:
            return node

        children = choose_children(token, level)
        for child_token, child_score in children:
            node["children"].append(build_node(child_token, child_score, level + 1))
        return node

    tree = build_node(root_token, None, 0)
    return tree

# =============================
# Pretty print & export
# =============================

def print_tree(node: Dict[str, Any], prefix: str = "", is_last: bool = True) -> None:
    """Pretty tree with branches; colorized if colorama is available."""
    token = node.get("word", "")
    score = node.get("")
    connector = "└── " if is_last else "├── "
    sim_str = f" ({score:.3f})" if isinstance(score, (int, float)) else ""
    label = f"{Fore.CYAN}{token}{Style.RESET_ALL}" if COLOR_ENABLED else token
    print(prefix + connector + label + sim_str)

    children = node.get("children", [])
    for i, child in enumerate(children):
        next_prefix = prefix + ("    " if is_last else "│   ")
        print_tree(child, next_prefix, i == len(children) - 1)

def to_markdown(node: Dict[str, Any], depth: int = 0) -> List[str]:
    lines = []
    indent = "  " * depth
    score = f" *(sim: {node['score_to_parent']:.3f})*" if isinstance(node.get("score_to_parent"), (int, float)) else ""
    lines.append(f"{indent}- **{node['token']}**{score}")
    for ch in node.get("children", []):
        lines.extend(to_markdown(ch, depth + 1))
    return lines

def simplify_tree_for_json(node: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "Id": 1,
        "word": node.get("token", ""),
        "children":[simplify_tree_for_json(ch) for ch in node.get("children", [])]
    }

async def save_tree_json(tree: Dict[str, Any], path: str) -> None:
    jsonString = json.dumps(tree, ensure_ascii=False, indent=2)
    async with aiofiles.open(path, "w", encoding="utf-8") as f:
        await f.write(jsonString)

# =============================
# ENTRY POINT (in-code config)
# =============================

USE_CLI = False  # set True to enable argparse CLI

async def run_in_code(word: str):
    print("main.py was run")
    """
    Edit these values to run directly from code (no CLI).
    """
    KV_PATH   = "lexvec_300d.kv"
    ROOTS     = word # <- any string
    DEPTH     = 4
    BREADTH   = 4
    MIN_SIM_PARENT = 0.32
    MIN_SIM_ROOT   = 0.28

    # Optional custom allow/deny (domain terms etc.)
    ALLOW = {}
    DENY  = set()

    print(f"Loading vectors: {KV_PATH}")
    wv = KeyedVectors.load(KV_PATH, mmap="r")

    word_filter = HybridFilter(
        allow=ALLOW,
        deny=DENY,
        language="en",
        spell_distance=1,
        use_spell=True  # set False to skip dictionary checks
    )

    all_trees: Dict[str, Any] = {}
    print(f"\n=== Root: {ROOTS} ===")
    tree = build_similarity_tree(
        wv=wv,
        root_word=ROOTS,
        depth=DEPTH,
        breadth=BREADTH,
        min_sim_to_parent=MIN_SIM_PARENT,
        min_sim_to_root=MIN_SIM_ROOT,
        word_filter=word_filter,
    )
    all_trees[ROOTS] = tree
    print_tree(tree)
    await save_tree_json(tree, "trees.json")
    simplified_trees = {
                        root: simplify_tree_for_json(tree)
                        for root, tree in all_trees.items()
                        }
    print(simplified_trees)
    # with open("trees.json", "w", encoding="utf-8") as f:
    #     json.dump(simplified_trees, f, indent=2, ensure_ascii=False)
        # os.fsync(f.fileno())
    # os.sync()
    print("\nSaved all trees to trees.json")

# =============================
# Optional CLI (flip USE_CLI=True)
# =============================

def run_cli():
    import argparse
    ap = argparse.ArgumentParser(description="Build similarity trees for any root word(s).")
    ap.add_argument("--kv", required=True, help="Path to KeyedVectors .kv (or .kv.gz) file")
    ap.add_argument("--roots", nargs="+", required=True, help="One or more root words to expand")
    ap.add_argument("--depth", type=int, default=4, help="Tree depth (levels, including root)")
    ap.add_argument("--breadth", type=int, default=4, help="Children per node")
    ap.add_argument("--min-sim-parent", type=float, default=0.32, help="Min similarity to parent")
    ap.add_argument("--min-sim-root", type=float, default=0.28, help="Min similarity to root (levels>=1)")
    ap.add_argument("--lang", default="en", help="Language for pyspellchecker (if installed)")
    ap.add_argument("--spell-distance", type=int, default=1, help="Edit distance for spellchecker")
    ap.add_argument("--no-spell", action="store_true", help="Disable dictionary check even if available")
    ap.add_argument("--allow", default="", help="Comma-separated whitelist words")
    ap.add_argument("--deny", default="", help="Comma-separated blacklist words")
    ap.add_argument("--allow-file", default=None, help="Path to newline-separated whitelist file")
    ap.add_argument("--deny-file", default=None, help="Path to newline-separated blacklist file")
    ap.add_argument("--json", default=None, help="Save combined trees to JSON file")
    ap.add_argument("--md", default=None, help="Save combined trees to Markdown file")
    args = ap.parse_args()

    print(f"Loading vectors: {args.kv}")
    wv = KeyedVectors.load(args.kv, mmap="r")

    def parse_csv_arg(val: Optional[str]) -> Set[str]:
        if not val: return set()
        return {x.strip().lower() for x in val.split(",") if x.strip()}

    def load_word_file(path: Optional[str]) -> Set[str]:
        if not path: return set()
        out = set()
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                w = line.strip()
                if w: out.add(w.lower())
        return out

    allow = parse_csv_arg(args.allow) | load_word_file(args.allow_file)
    deny  = parse_csv_arg(args.deny)  | load_word_file(args.deny_file)

    word_filter = HybridFilter(
        allow=allow,
        deny=deny,
        language=args.lang,
        spell_distance=args.spell_distance,
        use_spell=not args.no_spell
    )

    all_trees: Dict[str, Any] = {}
    print(f"\n=== Root: {root} ===")
    tree = build_similarity_tree(
        wv=wv,
        root_word=root,
        depth=args.depth,
        breadth=args.breadth,
        min_sim_to_parent=args.min_sim_parent,
        min_sim_to_root=args.min_sim_root,
        word_filter=word_filter,
    )
    all_trees[root] = tree
    print_tree(tree)

    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(all_trees, f, indent=2)
        print(f"\nSaved JSON to {args.json}")

    if args.md:
        lines = []
        for root, tree in all_trees.items():
            lines.append(f"# {root}")
            lines += to_markdown(tree)
            lines.append("")
        with open(args.md, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))
        print(f"Saved Markdown to {args.md}")

# =============================
# Main
# =============================

if __name__ == "__main__":
    if USE_CLI:
        run_cli()
    else:
        asyncio.run(run_in_code("brain"))
