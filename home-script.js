const wordForm = document.getElementById('word-form');
const wordInput = document.getElementById('word-input');

wordForm.addEventListener('submit', (event) => {
    // Prevent the default form submission (which would reload the page)
    event.preventDefault(); 
    
    const word = wordInput.value.trim();

    if (word) {
        // Log the word for debugging
        console.log(`Word submitted: ${word}`);

        // --- REDIRECT LOGIC ---
        // Redirect the user to the tree page, passing the word as a URL parameter.
        // encodeURIComponent handles spaces or special characters in the word.
        window.location.href = `tree.html?word=${encodeURIComponent(word)}`;
    }
});
