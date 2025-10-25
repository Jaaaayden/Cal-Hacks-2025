const wordForm = document.getElementById('word-form');
const wordInput = document.getElementById('word-input');

wordForm.addEventListener('submit', (event) => {
    // Prevents the page from actually reloading
    event.preventDefault();

    const word = wordInput.value.trim();

    if (word) {
        // Log the word to the console for now
        console.log(`Word submitted: ${word}`);

        // --- NEXT STEP ---
        // Redirect to the tree visualization page, passing the word as a parameter.
        // For example:
        // window.location.href = `/tree.html?word=${encodeURIComponent(word)}`;
    }
});