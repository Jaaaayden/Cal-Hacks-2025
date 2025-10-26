# Cal-Hacks-2025

# The Word Tree
With online research and topic exploration becoming increasingly overwhelming, The Word Tree helps users visualize how ideas and concepts connect — instantly generating a branching semantic tree from any given word, topic, or idea.

# Usage
```
git clone https://github.com/Jaaaayden/Cal-Hacks-2025
cd The Word Tree
pip install -r requirements.txt
```

Download the dataset below too:

https://wormhole.app/6Yjld3#_RVFb2UzWscjAIYbR0h6UQ 

# How it Works

- Word Embeddings: Uses gensim’s pretrained Word2Vec model to find contextually similar words.

- Linguistic Filtering: Lemmatization + morphological normalization reduces duplicates (e.g., college, colleges, collegiate).

- Tree Construction: Balances similarity between the user input and previous node to create a meaningful hierarchy.

- Async Handling: Built using Flask[async] — ensures smooth asynchronous generation and JSON file I/O.

# Challenges

- Balancing semantic weighting between nodes (to avoid random or overly repetitive branches).

- Cleaning unfiltered datasets for stable, human-readable output.

# What's next

- Integrating topic definitions and external resources for each node.

- Applying the system to domain-specific datasets (e.g., medicine, law, and physics -- although solid already).

- Displaying numerical similarity scores when hovering over branches.

- Full deployment as a public-facing web app.

# Thank you to:

### [Ethan Zhang](https://github.com/asdf263)
- Project Manager/Lead

### [Justin Sato](https://github.com/LittleHalf)
- Back-end Developer

### [Yuchan Chung](https://github.com/yuchan-chung1964)
- Front-end Developer
