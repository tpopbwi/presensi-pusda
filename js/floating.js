// ============================================================
// FLOATING WINDOW MANAGER
// ============================================================
class FloatingWindowManager {
    constructor() {
        this.windows = new Map();
        this.zIndexCounter = 9000;
        this.activeWindow = null;
        this.isDragging = false;
        this.isResizing = false;
        this.dragOffset = { x: 0, y: 0 };
        this.resizeStart = { x: 0, y: 0, width: 0, height: 0 };
    }

    // Create floating window
    createWindow(id, title, icon, url, options = {}) {
        const {
            width = 800,
            height = 600,
            x = null,
            y = null,
            resizable = true,
            minimizable = true,
            maximizable = true
        } = options;

        // Check if window already exists
        if (this.windows.has(id)) {
            this.focusWindow(id);
            return;
        }

        // Calculate position (center jika tidak specified)
        const posX = x ?? (window.innerWidth - width) / 2;
        const posY = y ?? (window.innerHeight - height) / 2;

        // Create window element
        const windowEl = document.createElement('div');
        windowEl.className = 'floating-window';
        windowEl.id = `floating-${id}`;
        windowEl.style.width = `${width}px`;
        windowEl.style.height = `${height}px`;
        windowEl.style.left = `${posX}px`;
        windowEl.style.top = `${posY}px`;
        windowEl.style.zIndex = ++this.zIndexCounter;

        windowEl.innerHTML = `
            <div class="floating-header">
                <div class="floating-title">
                    <i data-lucide="${icon}" size="18"></i>
                    <span>${title}</span>
                </div>
                <div class="floating-controls">
                    ${minimizable ? '<button class="floating-btn minimize" title="Minimize"><i data-lucide="minus" size="14"></i></button>' : ''}
                    ${maximizable ? '<button class="floating-btn maximize" title="Maximize"><i data-lucide="maximize" size="14"></i></button>' : ''}
                    <button class="floating-btn close" title="Close"><i data-lucide="x" size="14"></i></button>
                </div>
            </div>
            <div class="floating-body">
                <div class="floating-loading">
                    <div class="spinner"></div>
                    <span>Memuat ${title}...</span>
                </div>
                <iframe src="${url}" frameborder="0" allow="geolocation"></iframe>
            </div>
            ${resizable ? '<div class="floating-resize"></div>' : ''}
        `;

        document.body.appendChild(windowEl);
        lucide.createIcons();

        // Store window data
        this.windows.set(id, {
            element: windowEl,
            iframe: windowEl.querySelector('iframe'),
            title: title,
            url: url,
            options: options,
            isMinimized: false,
            isMaximized: false
        });

        // Setup event listeners
        this.setupWindowEvents(id);

        // Show window
        requestAnimationFrame(() => {
            windowEl.classList.add('active');
            this.focusWindow(id);
        });

        return id;
    }

    // Setup window events
    setupWindowEvents(id) {
        const windowEl = this.windows.get(id).element;
        const header = windowEl.querySelector('.floating-header');
        const closeBtn = windowEl.querySelector('.floating-btn.close');
        const minimizeBtn = windowEl.querySelector('.floating-btn.minimize');
        const maximizeBtn = windowEl.querySelector('.floating-btn.maximize');
        const resizeHandle = windowEl.querySelector('.floating-resize');
        const iframe = windowEl.querySelector('iframe');

        // Focus on click
        windowEl.addEventListener('mousedown', () => this.focusWindow(id));

        // Close button
        closeBtn?.addEventListener('click', () => this.closeWindow(id));

        // Minimize button
        minimizeBtn?.addEventListener('click', () => this.toggleMinimize(id));

        // Maximize button
        maximizeBtn?.addEventListener('click', () => this.toggleMaximize(id));

        // Drag functionality
        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('.floating-btn')) return;
            this.startDrag(e, id);
        });

        // Resize functionality
        resizeHandle?.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.startResize(e, id);
        });

        // Iframe load event
        iframe.addEventListener('load', () => {
            const loading = windowEl.querySelector('.floating-loading');
            if (loading) loading.style.display = 'none';
        });

        // Communication via postMessage
        iframe.addEventListener('load', () => {
            this.setupIframeCommunication(id);
        });
    }

    // Drag functionality
    startDrag(e, id) {
        const windowEl = this.windows.get(id).element;
        if (this.windows.get(id).isMaximized) return;

        this.isDragging = true;
        this.activeWindow = id;
        
        const rect = windowEl.getBoundingClientRect();
        this.dragOffset.x = e.clientX - rect.left;
        this.dragOffset.y = e.clientY - rect.top;

        const onMouseMove = (e) => {
            if (!this.isDragging) return;

            const newX = e.clientX - this.dragOffset.x;
            const newY = e.clientY - this.dragOffset.y;

            // Keep window in viewport
            const maxX = window.innerWidth - windowEl.offsetWidth;
            const maxY = window.innerHeight - windowEl.offsetHeight;

            windowEl.style.left = `${Math.max(0, Math.min(newX, maxX))}px`;
            windowEl.style.top = `${Math.max(0, Math.min(newY, maxY))}px`;
        };

        const onMouseUp = () => {
            this.isDragging = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    // Resize functionality
    startResize(e, id) {
        const windowEl = this.windows.get(id).element;
        if (this.windows.get(id).isMaximized) return;

        this.isResizing = true;
        this.activeWindow = id;
        this.resizeStart = {
            x: e.clientX,
            y: e.clientY,
            width: windowEl.offsetWidth,
            height: windowEl.offsetHeight
        };

        const onMouseMove = (e) => {
            if (!this.isResizing) return;

            const newWidth = Math.max(400, this.resizeStart.width + (e.clientX - this.resizeStart.x));
            const newHeight = Math.max(300, this.resizeStart.height + (e.clientY - this.resizeStart.y));

            windowEl.style.width = `${Math.min(newWidth, window.innerWidth)}px`;
            windowEl.style.height = `${Math.min(newHeight, window.innerHeight)}px`;
        };

        const onMouseUp = () => {
            this.isResizing = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    // Focus window (bring to front)
    focusWindow(id) {
        if (!this.windows.has(id)) return;

        this.windows.forEach((win, winId) => {
            if (winId !== id) {
                win.element.style.zIndex = parseInt(win.element.style.zIndex) - 1;
            }
        });

        this.windows.get(id).element.style.zIndex = ++this.zIndexCounter;
        this.activeWindow = id;
    }

    // Toggle minimize
    toggleMinimize(id) {
        const windowData = this.windows.get(id);
        if (!windowData) return;

        windowData.isMinimized = !windowData.isMinimized;
        windowData.element.classList.toggle('minimized', windowData.isMinimized);

        const icon = windowData.element.querySelector('.floating-btn.minimize i');
        if (icon) {
            icon.setAttribute('data-lucide', windowData.isMinimized ? 'maximize' : 'minus');
            lucide.createIcons();
        }
    }

    // Toggle maximize
    toggleMaximize(id) {
        const windowData = this.windows.get(id);
        if (!windowData) return;

        windowData.isMaximized = !windowData.isMaximized;
        windowData.element.classList.toggle('maximized', windowData.isMaximized);

        const icon = windowData.element.querySelector('.floating-btn.maximize i');
        if (icon) {
            icon.setAttribute('data-lucide', windowData.isMaximized ? 'minimize' : 'maximize');
            lucide.createIcons();
        }
    }

    // Close window
    closeWindow(id) {
        const windowData = this.windows.get(id);
        if (!windowData) return;

        windowData.element.classList.remove('active');
        setTimeout(() => {
            windowData.element.remove();
            this.windows.delete(id);
        }, 300);
    }

    // Send message to iframe
    sendMessage(id, data) {
        const windowData = this.windows.get(id);
        if (!windowData || !windowData.iframe.contentWindow) return;

        windowData.iframe.contentWindow.postMessage({
            type: 'FLOATING_WINDOW_MESSAGE',
            windowId: id,
            data: data
        }, '*');
    }

    // Setup communication with iframe
    setupIframeCommunication(id) {
        const messageHandler = (event) => {
            // Security: Validate origin if needed
            // if (event.origin !== window.location.origin) return;

            const { type, data } = event.data;

            if (type === 'FLOATING_WINDOW_REQUEST') {
                this.handleIframeRequest(id, data);
            }
        };

        window.addEventListener('message', messageHandler);
    }

    // Handle requests from iframe
    handleIframeRequest(id, data) {
        switch (data.action) {
            case 'close':
                this.closeWindow(id);
                break;
            case 'minimize':
                this.toggleMinimize(id);
                break;
            case 'maximize':
                this.toggleMaximize(id);
                break;
            case 'resize':
                const windowEl = this.windows.get(id)?.element;
                if (windowEl && data.width && data.height) {
                    windowEl.style.width = `${data.width}px`;
                    windowEl.style.height = `${data.height}px`;
                }
                break;
            case 'sendData':
                // Forward data to main page (wilayah.html)
                window.dispatchEvent(new CustomEvent('floatingData', {
                    detail: { windowId: id, data: data.payload }
                }));
                break;
        }
    }

    // Get all windows
    getWindows() {
        return Array.from(this.windows.entries()).map(([id, win]) => ({
            id,
            title: win.title,
            isMinimized: win.isMinimized,
            isMaximized: win.isMaximized
        }));
    }
}

// Global instance
const floatingManager = new FloatingWindowManager();

// Helper functions untuk dipanggil dari wilayah.html
function openMaps() {
    floatingManager.createWindow('maps', 'Peta Monitoring', 'map', 'maps.html', {
        width: 900,
        height: 650
    });
}

function openWeather() {
    floatingManager.createWindow('weather', 'Cuaca & Kondisi', 'cloud-sun', 'weather.html', {
        width: 500,
        height: 450
    });
}

function openSignal() {
    floatingManager.createWindow('signal', 'Signal Validator', 'signal', 'signal.html', {
        width: 600,
        height: 500
    });
}
