/**
 * Upload Page JavaScript
 * Handles file upload and form submission
 */

const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const uploadForm = document.getElementById('uploadForm');

let uploadedFiles = [];

// Click to open file picker
uploadZone.addEventListener('click', () => fileInput.click());

// File input change
fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
});

// Drag and drop
uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
});

function handleFiles(files) {
    for (const file of files) {
        if (!uploadedFiles.find(f => f.name === file.name)) {
            uploadedFiles.push(file);
        }
    }
    renderFileList();
}

function renderFileList() {
    if (uploadedFiles.length === 0) {
        fileList.innerHTML = '';
        return;
    }

    fileList.innerHTML = uploadedFiles.map((file, index) => `
    <div class="file-item">
      <span class="file-item-icon">📄</span>
      <span class="file-item-name">${file.name}</span>
      <span class="file-item-remove" onclick="removeFile(${index})">✕</span>
    </div>
  `).join('');
}

function removeFile(index) {
    uploadedFiles.splice(index, 1);
    renderFileList();
}

// Form submission
uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const companyName = document.getElementById('companyName').value.trim();

    if (!companyName) {
        alert('Please enter your company name');
        return;
    }

    const submitBtn = uploadForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Starting analysis...';

    try {
        // 1. Create session
        const sessionRes = await fetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ companyId: companyName.toLowerCase().replace(/\s+/g, '-') })
        });

        const sessionData = await sessionRes.json();
        const sessionId = sessionData.sessionId;

        // Store session info
        localStorage.setItem('bankable_session', JSON.stringify({
            sessionId,
            companyName,
            startedAt: new Date().toISOString()
        }));

        // 2. Upload documents (if any)
        for (const file of uploadedFiles) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('sessionId', sessionId);

            await fetch('/api/documents', {
                method: 'POST',
                body: formData
            });
        }

        // 3. Redirect to analysis page
        window.location.href = '/analyzing.html';

    } catch (error) {
        console.error('Error:', error);
        alert('Something went wrong. Please try again.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Analyze My Bankability →';
    }
});
