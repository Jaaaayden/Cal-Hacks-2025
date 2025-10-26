// Get references to the form and input elements
const wordForm = document.getElementById('word-form');
const wordInput = document.getElementById('word-input');

// Add an event listener for when the form is submitted
wordForm.addEventListener('submit', (event) => {
    // Prevent the default form submission behavior (which would reload the page)
    event.preventDefault(); // <<< FIXED TYPO

    // Get the word entered by the user, trim whitespace, and convert to lowercase
    const word = wordInput.value.trim().toLowerCase();

    // Check if the user actually entered a word
    if (word) {
        console.log(`Word submitted: "${word}". Attempting to send to backend...`);

        // --- Use the Fetch API to send the word to the Flask backend ---
        fetch('/api/word', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ word: word })
        })
        .then(response => {
            console.log("Received initial response from /api/word");
            if (!response.ok) {
                console.error(`Backend responded with status: ${response.status}`);
            } else {
                console.log("Backend acknowledged the request successfully (Status:", response.status + ").");
            }
            // Proceed to redirect AFTER getting the initial response from fetch.
            redirectToTreePage(word);
        })
        .catch(error => {
            console.error('Error sending word to backend:', error);
            // Still redirect.
            redirectToTreePage(word);
        });

    } else {
        wordInput.placeholder = "Please enter a word first!";
    }
});

// Helper function to handle the redirection
function redirectToTreePage(word) {
    console.log(`Redirecting to tree page for word: "${word}"`);
    window.location.href = `tree.html?word=${encodeURIComponent(word)}`;
}

