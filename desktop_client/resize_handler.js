/**
 * Resize handler for app-container
 * Allows dragging the splitter between map and info panels
 * Persists size preference in localStorage
 */

class ResizeHandler {
  constructor() {
    this.handle = document.getElementById('resizeHandle');
    this.container = document.querySelector('.app-container');
    this.mapPanel = document.querySelector('.map-panel');
    this.infoPanel = document.querySelector('.info-panel');
    this.isResizing = false;
    
    this.init();
  }

  init() {
    // Load saved proportions or use defaults
    const saved = localStorage.getItem('panelRatio');
    if (saved) {
      const ratio = parseFloat(saved);
      this.setRatio(ratio);
    } else {
      // Default: 60% map, 40% info
      this.setRatio(1.5);
    }

    // Attach event listeners
    this.handle.addEventListener('mousedown', (e) => this.startResize(e));
    document.addEventListener('mousemove', (e) => this.resize(e));
    document.addEventListener('mouseup', () => this.stopResize());
    
    // Trigger map resize after layout change
    window.addEventListener('resize', () => {
      setTimeout(() => {
        if (window.map) {
          window.map.invalidateSize();
        }
      }, 100);
    });
  }

  startResize(e) {
    this.isResizing = true;
    this.container.style.cursor = 'col-resize';
  }

  resize(e) {
    if (!this.isResizing) return;

    // Calculate new widths based on mouse position
    const containerRect = this.container.getBoundingClientRect();
    const containerWidth = containerRect.width;
    
    // Account for gap (var(--spacing-md) = 16px)
    const gap = 16;
    const handleWidth = 4;
    const x = e.clientX - containerRect.left;
    
    // Clamp between minimum sizes
    const minSize = 250;
    const maxSize = containerWidth - minSize - gap - handleWidth;
    
    const mapWidth = Math.max(minSize, Math.min(x, maxSize));
    const infoWidth = containerWidth - mapWidth - gap - handleWidth;
    
    // Set flex ratio (map : info)
    const ratio = mapWidth / infoWidth;
    this.setRatio(ratio);
    
    // Save preference
    localStorage.setItem('panelRatio', ratio.toString());
  }

  stopResize() {
    this.isResizing = false;
    this.container.style.cursor = 'default';
    
    // Trigger map resize after resize completes
    if (window.map) {
      setTimeout(() => {
        window.map.invalidateSize();
      }, 50);
    }
  }

  setRatio(ratio) {
    this.container.style.setProperty('--map-flex', ratio);
    this.container.style.setProperty('--info-flex', 1);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new ResizeHandler();
  });
} else {
  new ResizeHandler();
}
