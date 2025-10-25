// --- 1. Select all the necessary HTML elements ---
const wordForm = document.getElementById('word-form');
const wordInput = document.getElementById('word-input');
const mainContainer = document.querySelector('.container');
const loadingOverlay = document.getElementById('loading-overlay');
const sceneContainer = document.getElementById('scene-container'); // ✅ Select the new container

// --- 2. Listen for the form submission ---
wordForm.addEventListener('submit', async (event) => {
    event.preventDefault(); 
    const word = wordInput.value.trim();

    if (!word) return;

    try {
        // Show the loading screen and hide the main form
        mainContainer.classList.add('hidden');
        loadingOverlay.classList.remove('hidden');

        // Pause the code here until the data is "fetched"
        const treeData = await fetchWordTreeData(word);

        console.log("Data received:", treeData);

        // ✅ --- THIS IS THE FIX ---
        // Show the placeholder for the "next screen".
        sceneContainer.classList.remove('hidden');
        
        // TODO: This is where you will initialize your Three.js scene inside the 'sceneContainer'.

    } catch (error) {
        console.error("Failed to fetch tree data:", error);
        // If there's an error, you might want to show the main page again
        mainContainer.classList.remove('hidden');
    } finally {
        // This ALWAYS runs last, hiding the spinner to reveal what's underneath.
        loadingOverlay.classList.add('hidden');
    }
});

/**
 * --- 3. SIMULATED BACKEND CALL (No changes here) ---
 */
function fetchWordTreeData(word) {
    console.log(`Fetching data for: ${word}...`);
    
    return new Promise((resolve) => {
        const loadingTime = 1000 + Math.random() * 2000;
        
        setTimeout(() => {
            resolve({ 
                word: word, 
                message: "Data successfully fetched!",
                children: ["related_word_1", "related_word_2"] 
            });
        }, loadingTime);
    });
}