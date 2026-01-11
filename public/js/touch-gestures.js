/**
 * PianoPlanner Mobile Touch Gestures
 * Adds swipe navigation and pull-to-refresh for native feel
 */

(function() {
    'use strict';

    // Only apply on mobile
    if (window.innerWidth > 768) return;

    // Configuration
    const SWIPE_THRESHOLD = 50;     // Minimum distance for swipe
    const SWIPE_VELOCITY = 0.3;     // Minimum velocity
    const PULL_THRESHOLD = 80;      // Pull distance for refresh

    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let isPulling = false;
    let pullDistance = 0;

    // Create pull-to-refresh indicator
    function createPullIndicator() {
        if (document.getElementById('pull-indicator')) return;

        const indicator = document.createElement('div');
        indicator.id = 'pull-indicator';
        indicator.innerHTML = `
            <div class="pull-spinner">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 12a9 9 0 11-6.219-8.56"/>
                </svg>
            </div>
            <span class="pull-text">Pull to refresh</span>
        `;
        document.body.appendChild(indicator);

        const style = document.createElement('style');
        style.textContent = `
            #pull-indicator {
                position: fixed;
                top: 0;
                left: 50%;
                transform: translateX(-50%) translateY(-80px);
                background: rgba(255, 255, 255, 0.95);
                backdrop-filter: blur(10px);
                padding: 12px 24px;
                border-radius: 24px;
                display: flex;
                align-items: center;
                gap: 10px;
                z-index: 9999;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                transition: transform 0.3s ease, opacity 0.3s ease;
                opacity: 0;
            }
            #pull-indicator.visible {
                opacity: 1;
            }
            #pull-indicator.refreshing {
                transform: translateX(-50%) translateY(calc(env(safe-area-inset-top, 20px) + 16px));
            }
            .pull-spinner {
                width: 20px;
                height: 20px;
                color: #007AFF;
            }
            .pull-spinner svg {
                width: 100%;
                height: 100%;
                animation: none;
            }
            #pull-indicator.refreshing .pull-spinner svg {
                animation: spin 1s linear infinite;
            }
            .pull-text {
                font-size: 14px;
                font-weight: 500;
                color: #1C1C1E;
            }
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
            @media (prefers-color-scheme: dark) {
                #pull-indicator {
                    background: rgba(44, 44, 46, 0.95);
                }
                .pull-text {
                    color: white;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // Initialize swipe detection on calendar
    function initSwipeNavigation() {
        const calendarContent = document.getElementById('calendarContent');
        if (!calendarContent) return;

        // Prevent default touch behavior on calendar for horizontal swipes
        calendarContent.addEventListener('touchstart', handleTouchStart, { passive: true });
        calendarContent.addEventListener('touchmove', handleTouchMove, { passive: false });
        calendarContent.addEventListener('touchend', handleTouchEnd, { passive: true });
    }

    function handleTouchStart(e) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
        isPulling = false;
        pullDistance = 0;
    }

    function handleTouchMove(e) {
        if (!touchStartX || !touchStartY) return;

        const touchX = e.touches[0].clientX;
        const touchY = e.touches[0].clientY;
        const deltaX = touchX - touchStartX;
        const deltaY = touchY - touchStartY;

        // Check if scrolled to top for pull-to-refresh
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        
        if (scrollTop <= 0 && deltaY > 0 && Math.abs(deltaY) > Math.abs(deltaX)) {
            // Pull to refresh
            e.preventDefault();
            isPulling = true;
            pullDistance = Math.min(deltaY, PULL_THRESHOLD * 1.5);
            
            const indicator = document.getElementById('pull-indicator');
            if (indicator) {
                const progress = Math.min(pullDistance / PULL_THRESHOLD, 1);
                indicator.style.transform = `translateX(-50%) translateY(${pullDistance - 80}px)`;
                indicator.classList.add('visible');
                
                if (pullDistance >= PULL_THRESHOLD) {
                    indicator.querySelector('.pull-text').textContent = 'Release to refresh';
                } else {
                    indicator.querySelector('.pull-text').textContent = 'Pull to refresh';
                }
            }
        } else if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
            // Horizontal swipe - let default behavior happen but track it
            // Don't prevent default to allow natural scrolling
        }
    }

    function handleTouchEnd(e) {
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const touchEndTime = Date.now();
        
        const deltaX = touchEndX - touchStartX;
        const deltaY = touchEndY - touchStartY;
        const deltaTime = touchEndTime - touchStartTime;
        const velocityX = Math.abs(deltaX) / deltaTime;

        // Handle pull-to-refresh
        if (isPulling && pullDistance >= PULL_THRESHOLD) {
            triggerRefresh();
        } else if (isPulling) {
            // Reset pull indicator
            const indicator = document.getElementById('pull-indicator');
            if (indicator) {
                indicator.style.transform = 'translateX(-50%) translateY(-80px)';
                indicator.classList.remove('visible');
            }
        }

        // Handle horizontal swipe for day navigation
        if (!isPulling && Math.abs(deltaX) > SWIPE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY) * 2) {
            if (velocityX > SWIPE_VELOCITY || Math.abs(deltaX) > SWIPE_THRESHOLD * 2) {
                if (deltaX > 0) {
                    // Swipe right - go to previous day/week
                    navigatePrevious();
                } else {
                    // Swipe left - go to next day/week
                    navigateNext();
                }
            }
        }

        // Reset
        touchStartX = 0;
        touchStartY = 0;
        isPulling = false;
        pullDistance = 0;
    }

    function navigatePrevious() {
        // Try to find navigation buttons
        const prevBtn = document.querySelector('.calendar-nav button:first-child') ||
                       document.querySelector('.ios-mobile-header-btn.left') ||
                       document.querySelector('[onclick*="navigateDay(-1)"]') ||
                       document.querySelector('[onclick*="prev"]');
        
        if (prevBtn) {
            triggerHaptic('light');
            prevBtn.click();
            showSwipeIndicator('left');
        } else if (typeof navigateDay === 'function') {
            triggerHaptic('light');
            navigateDay(-1);
            showSwipeIndicator('left');
        }
    }

    function navigateNext() {
        const nextBtn = document.querySelector('.calendar-nav button:last-child') ||
                       document.querySelector('.ios-mobile-header-btn.right') ||
                       document.querySelector('[onclick*="navigateDay(1)"]') ||
                       document.querySelector('[onclick*="next"]');
        
        if (nextBtn) {
            triggerHaptic('light');
            nextBtn.click();
            showSwipeIndicator('right');
        } else if (typeof navigateDay === 'function') {
            triggerHaptic('light');
            navigateDay(1);
            showSwipeIndicator('right');
        }
    }

    function showSwipeIndicator(direction) {
        // Brief visual feedback
        const indicator = document.createElement('div');
        indicator.className = `swipe-indicator ${direction}`;
        indicator.innerHTML = direction === 'left' ? '‹' : '›';
        document.body.appendChild(indicator);

        setTimeout(() => indicator.remove(), 300);
    }

    function triggerRefresh() {
        const indicator = document.getElementById('pull-indicator');
        if (indicator) {
            indicator.classList.add('refreshing');
            indicator.querySelector('.pull-text').textContent = 'Refreshing...';
        }

        triggerHaptic('medium');

        // Try to refresh calendar data
        if (typeof loadAllAppointments === 'function') {
            loadAllAppointments().finally(() => {
                setTimeout(() => {
                    if (indicator) {
                        indicator.classList.remove('refreshing', 'visible');
                        indicator.style.transform = 'translateX(-50%) translateY(-80px)';
                    }
                    triggerHaptic('success');
                }, 500);
            });
        } else if (typeof fetchAppointments === 'function') {
            fetchAppointments().finally(() => {
                setTimeout(() => {
                    if (indicator) {
                        indicator.classList.remove('refreshing', 'visible');
                        indicator.style.transform = 'translateX(-50%) translateY(-80px)';
                    }
                    triggerHaptic('success');
                }, 500);
            });
        } else {
            // Fallback: reload page
            location.reload();
        }
    }

    /**
     * Trigger haptic feedback (iOS/Android)
     * @param {string} type - 'light', 'medium', 'heavy', 'success', 'warning', 'error'
     */
    function triggerHaptic(type = 'light') {
        // iOS Taptic Engine
        if (window.webkit?.messageHandlers?.haptic) {
            window.webkit.messageHandlers.haptic.postMessage(type);
        }
        
        // Vibration API (Android)
        if ('vibrate' in navigator) {
            switch (type) {
                case 'light':
                    navigator.vibrate(10);
                    break;
                case 'medium':
                    navigator.vibrate(20);
                    break;
                case 'heavy':
                    navigator.vibrate(40);
                    break;
                case 'success':
                    navigator.vibrate([10, 50, 10]);
                    break;
                case 'warning':
                    navigator.vibrate([20, 50, 20]);
                    break;
                case 'error':
                    navigator.vibrate([50, 30, 50, 30, 50]);
                    break;
            }
        }
    }

    // Expose haptic for other scripts
    window.triggerHaptic = triggerHaptic;

    // Add swipe indicator styles
    function addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .swipe-indicator {
                position: fixed;
                top: 50%;
                transform: translateY(-50%);
                font-size: 48px;
                font-weight: 300;
                color: rgba(0, 122, 255, 0.6);
                pointer-events: none;
                animation: swipeFade 0.3s ease forwards;
                z-index: 9999;
            }
            .swipe-indicator.left {
                left: 20px;
            }
            .swipe-indicator.right {
                right: 20px;
            }
            @keyframes swipeFade {
                from {
                    opacity: 1;
                    transform: translateY(-50%) scale(1);
                }
                to {
                    opacity: 0;
                    transform: translateY(-50%) scale(1.5);
                }
            }
            
            /* Touch feedback for list items */
            .ios-touch-active {
                background: rgba(0, 0, 0, 0.05) !important;
                transition: background 0.1s ease;
            }
            @media (prefers-color-scheme: dark) {
                .ios-touch-active {
                    background: rgba(255, 255, 255, 0.1) !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // Add touch feedback to interactive elements
    function addTouchFeedback() {
        const interactiveSelectors = [
            '.list-item',
            '.customer-item',
            '.appointment-item',
            '.piano-card',
            '.ios-tab-item',
            '.quick-btn',
            '.sw-smart-slot',
            '.sw-piano-item',
            '.action-sheet-btn'
        ];

        document.addEventListener('touchstart', (e) => {
            const target = e.target.closest(interactiveSelectors.join(','));
            if (target) {
                target.classList.add('ios-touch-active');
            }
        }, { passive: true });

        document.addEventListener('touchend', () => {
            document.querySelectorAll('.ios-touch-active').forEach(el => {
                el.classList.remove('ios-touch-active');
            });
        }, { passive: true });

        document.addEventListener('touchcancel', () => {
            document.querySelectorAll('.ios-touch-active').forEach(el => {
                el.classList.remove('ios-touch-active');
            });
        }, { passive: true });
    }

    // Long press for context menu (optional)
    function initLongPress() {
        let longPressTimer = null;
        let longPressTarget = null;

        document.addEventListener('touchstart', (e) => {
            const target = e.target.closest('.appointment-block, .event, .calendar-event');
            if (target) {
                longPressTarget = target;
                longPressTimer = setTimeout(() => {
                    triggerHaptic('medium');
                    // Trigger context menu or action sheet
                    const event = new CustomEvent('longpress', { 
                        detail: { target: longPressTarget },
                        bubbles: true 
                    });
                    longPressTarget.dispatchEvent(event);
                }, 500);
            }
        }, { passive: true });

        document.addEventListener('touchend', () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        }, { passive: true });

        document.addEventListener('touchmove', () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        }, { passive: true });
    }

    // Initialize when DOM is ready
    function init() {
        addStyles();
        createPullIndicator();
        initSwipeNavigation();
        addTouchFeedback();
        initLongPress();
        
        console.log('[Touch Gestures] Mobile gestures initialized');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
