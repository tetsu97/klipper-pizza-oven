// static/js/components/tooltips.js

document.addEventListener('DOMContentLoaded', () => {
    // On page load, find all tooltips, move them to the body, 
    // and set up the listeners for their parent elements.
    const tooltippedElements = document.querySelectorAll('.has-tooltip');
  
    tooltippedElements.forEach(element => {
        const tooltip = element.querySelector('.tooltip-text');
        if (!tooltip) return;

        // Move to body once to prevent clipping and layout shifts on hide/show
        document.body.appendChild(tooltip);
        
        // Store a reference on the parent element for quick access
        element.tooltipElement = tooltip;

        const showTooltip = () => {
            const tip = element.tooltipElement;
            if (tip) {
                positionTooltip(element, tip);
                tip.classList.add('visible');
            }
        };

        const hideTooltip = () => {
            const tip = element.tooltipElement;
            if (tip) {
                tip.classList.remove('visible');
            }
        };

        element.addEventListener('mouseenter', showTooltip);
        element.addEventListener('mouseleave', hideTooltip);
        element.addEventListener('focus', showTooltip);
        element.addEventListener('blur', hideTooltip);
    });
});

function positionTooltip(parent, tooltip) {
    const parentRect = parent.getBoundingClientRect();
    
    // To get the tooltip's dimensions, we briefly make it visible but transparent.
    // The browser can then measure it without the user seeing a flash.
    tooltip.style.visibility = 'hidden';
    tooltip.classList.add('visible');
    const tooltipRect = tooltip.getBoundingClientRect();
    tooltip.classList.remove('visible');
    tooltip.style.visibility = ''; // Let the class control visibility again

    const arrowSize = 5;
    const margin = 8; // Space from window edge

    tooltip.classList.remove('on-bottom');
    
    // Default vertical position: above the parent element
    let top = parentRect.top - tooltipRect.height - arrowSize;
    
    // If it overflows the top of the viewport, flip it to be below
    if (top < margin) {
        top = parentRect.bottom + arrowSize;
        tooltip.classList.add('on-bottom');
    }

    // Horizontal positioning: try to center it, but prevent overflow
    let left = parentRect.left + (parentRect.width / 2) - (tooltipRect.width / 2);

    if (left < margin) {
        left = margin; // Align to the left edge of the viewport
    } else if (left + tooltipRect.width > window.innerWidth - margin) {
        left = window.innerWidth - tooltipRect.width - margin; // Align to the right edge
    }

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;

    // Adjust the arrow's horizontal position relative to the tooltip itself
    // This keeps the arrow pointing at the center of the parent element
    const arrowOffset = parentRect.left + (parentRect.width / 2) - left;
    tooltip.style.setProperty('--arrow-left', `${arrowOffset}px`);
}