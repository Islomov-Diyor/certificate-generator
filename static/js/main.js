// Main JavaScript for Certificate Generator

document.addEventListener('DOMContentLoaded', function() {
    // Initialize tooltips
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });

    // Initialize popovers
    var popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'));
    var popoverList = popoverTriggerList.map(function (popoverTriggerEl) {
        return new bootstrap.Popover(popoverTriggerEl);
    });

    // Auto-hide alerts after 5 seconds
    const alerts = document.querySelectorAll('.alert:not(.alert-permanent)');
    alerts.forEach(function(alert) {
        setTimeout(function() {
            const bsAlert = new bootstrap.Alert(alert);
            bsAlert.close();
        }, 5000);
    });

    // Form validation enhancement
    const forms = document.querySelectorAll('form');
    forms.forEach(function(form) {
        form.addEventListener('submit', function(event) {
            if (!form.checkValidity()) {
                event.preventDefault();
                event.stopPropagation();
                form.classList.add('was-validated');
                return false;
            }
            form.classList.add('was-validated');
        });
    });

    // File input enhancement
    const fileInputs = document.querySelectorAll('input[type="file"]');
    fileInputs.forEach(function(input) {
        input.addEventListener('change', function() {
            const fileName = this.files[0] ? this.files[0].name : 'Choose file...';
            const label = this.nextElementSibling;
            if (label && label.classList.contains('custom-file-label')) {
                label.textContent = fileName;
            }
        });
    });

    // Confirm delete actions
    const deleteButtons = document.querySelectorAll('a[onclick*="confirm"]');
    deleteButtons.forEach(function(button) {
        button.addEventListener('click', function(event) {
            const message = this.getAttribute('onclick').match(/'([^']+)'/)[1];
            if (!confirm(message)) {
                event.preventDefault();
            }
        });
    });

    // Loading state for buttons - only on form submit, not click
    const allForms = document.querySelectorAll('form');
    allForms.forEach(function(form) {
        form.addEventListener('submit', function(event) {
            // Only proceed if form is valid
            if (form.checkValidity()) {
                const submitButton = form.querySelector('button[type="submit"]');
                if (submitButton) {
                    // Store original state
                    const originalHTML = submitButton.innerHTML;
                    const originalDisabled = submitButton.disabled;
                    
                    // Show loading state
                    submitButton.disabled = true;
                    submitButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Processing...';
                    
                    // Re-enable button after 10 seconds as fallback (in case of error or timeout)
                    setTimeout(function() {
                        if (submitButton.disabled) {
                            submitButton.disabled = originalDisabled;
                            submitButton.innerHTML = originalHTML;
                        }
                    }, 10000);
                }
            }
        });
    });

    // Table search functionality
    const searchInputs = document.querySelectorAll('input[data-table-search]');
    searchInputs.forEach(function(input) {
        input.addEventListener('keyup', function() {
            const tableId = this.getAttribute('data-table-search');
            const table = document.getElementById(tableId);
            if (table) {
                filterTable(table, this.value);
            }
        });
    });

    // Auto-resize textareas
    const textareas = document.querySelectorAll('textarea');
    textareas.forEach(function(textarea) {
        textarea.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });
    });

    // Copy to clipboard functionality
    const copyButtons = document.querySelectorAll('[data-copy]');
    copyButtons.forEach(function(button) {
        button.addEventListener('click', function() {
            const text = this.getAttribute('data-copy');
            copyToClipboard(text);
            
            // Show feedback
            const originalText = this.innerHTML;
            this.innerHTML = '<i class="bi bi-check"></i> Copied!';
            this.classList.add('btn-success');
            
            setTimeout(() => {
                this.innerHTML = originalText;
                this.classList.remove('btn-success');
            }, 2000);
        });
    });

    // Print functionality
    const printButtons = document.querySelectorAll('[data-print]');
    printButtons.forEach(function(button) {
        button.addEventListener('click', function() {
            window.print();
        });
    });

    // Theme (dark mode) toggle
    const themeToggle = document.getElementById('themeToggle');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const savedTheme = localStorage.getItem('theme');

    if (themeToggle) {
        const applyTheme = (mode) => {
            if (mode === 'dark') {
                document.body.classList.add('dark-mode');
            } else {
                document.body.classList.remove('dark-mode');
            }
            const sun = document.getElementById('themeIconSun');
            const moon = document.getElementById('themeIconMoon');
            if (sun && moon) {
                const isDark = document.body.classList.contains('dark-mode');
                sun.classList.toggle('d-none', isDark);
                moon.classList.toggle('d-none', !isDark);
            }
        };

        const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
        themeToggle.checked = initialTheme === 'dark';
        applyTheme(initialTheme);

        themeToggle.addEventListener('change', function () {
            const mode = themeToggle.checked ? 'dark' : 'light';
            localStorage.setItem('theme', mode);
            applyTheme(mode);
        });
    }

    // Certificate preview zoom and fullscreen
    const previewImg = document.getElementById('certificatePreviewImage');
    if (previewImg) {
        const spinner = document.getElementById('previewSpinner');
        let scale = 1;
        const MIN_SCALE = 0.5;
        const MAX_SCALE = 2.5;

        const updateScale = () => {
            previewImg.style.transform = `scale(${scale})`;
        };

        previewImg.addEventListener('load', function () {
            if (spinner) {
                spinner.classList.add('d-none');
            }
            updateScale();
        });

        if (previewImg.complete) {
            // Image may already be cached
            if (spinner) {
                spinner.classList.add('d-none');
            }
            updateScale();
        }

        const zoomInBtn = document.getElementById('previewZoomInBtn');
        const zoomOutBtn = document.getElementById('previewZoomOutBtn');
        const fullscreenBtn = document.getElementById('previewFullscreenBtn');

        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', function () {
                scale = Math.min(MAX_SCALE, scale + 0.25);
                updateScale();
            });
        }
        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', function () {
                scale = Math.max(MIN_SCALE, scale - 0.25);
                updateScale();
            });
        }
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', function () {
                const modalEl = document.getElementById('previewFullscreenModal');
                const modalImg = document.getElementById('previewFullscreenImage');
                if (modalEl && modalImg && window.bootstrap) {
                    modalImg.src = previewImg.src;
                    const modal = new bootstrap.Modal(modalEl);
                    modal.show();
                }
            });
        }
    }

    // Simple sortable tables
    const sortableTables = document.querySelectorAll('table[data-sortable="true"]');
    sortableTables.forEach(function (table) {
        const headers = table.querySelectorAll('thead th[data-sortable-column]');
        headers.forEach(function (th, index) {
            th.style.cursor = 'pointer';
            th.addEventListener('click', function () {
                const tbody = table.querySelector('tbody');
                if (!tbody) return;
                const rowsArray = Array.from(tbody.querySelectorAll('tr'));
                const currentDir = th.getAttribute('data-sort-direction') || 'asc';
                const newDir = currentDir === 'asc' ? 'desc' : 'asc';
                headers.forEach(h => h.removeAttribute('data-sort-direction'));
                th.setAttribute('data-sort-direction', newDir);

                rowsArray.sort(function (a, b) {
                    const aText = (a.children[index].textContent || '').trim().toLowerCase();
                    const bText = (b.children[index].textContent || '').trim().toLowerCase();
                    const aNum = parseFloat(aText.replace(/[^\d.-]/g, ''));
                    const bNum = parseFloat(bText.replace(/[^\d.-]/g, ''));
                    let cmp;
                    if (!isNaN(aNum) && !isNaN(bNum)) {
                        cmp = aNum - bNum;
                    } else {
                        cmp = aText.localeCompare(bText);
                    }
                    return newDir === 'asc' ? cmp : -cmp;
                });

                rowsArray.forEach(function (row) {
                    tbody.appendChild(row);
                });
            });
        });
    });
});

// Utility functions

function filterTable(table, searchTerm) {
    const tbody = table.querySelector('tbody');
    const rows = tbody.querySelectorAll('tr');
    
    rows.forEach(function(row) {
        const text = row.textContent.toLowerCase();
        const matches = text.includes(searchTerm.toLowerCase());
        row.style.display = matches ? '' : 'none';
    });
}

function copyToClipboard(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text);
    } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
    }
}

// AJAX utilities
function ajaxRequest(url, method = 'GET', data = null) {
    return fetch(url, {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: data ? JSON.stringify(data) : null
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    });
}

// Show toast notifications
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'position-fixed bottom-0 end-0 p-3';
        container.style.zIndex = '11';
        document.body.appendChild(container);
    }
    
    const toastId = 'toast-' + Date.now();
    const toastHTML = `
        <div id="${toastId}" class="toast align-items-center text-white bg-${type} border-0" role="alert">
            <div class="d-flex">
                <div class="toast-body">
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        </div>
    `;
    
    document.getElementById('toast-container').insertAdjacentHTML('beforeend', toastHTML);
    
    const toastElement = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastElement);
    toast.show();
    
    toastElement.addEventListener('hidden.bs.toast', function() {
        toastElement.remove();
    });
}

// Format date utility
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Debounce utility for search inputs
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Export utilities for use in other scripts
window.CertificateUtils = {
    filterTable,
    copyToClipboard,
    ajaxRequest,
    showToast,
    formatDate,
    debounce
};