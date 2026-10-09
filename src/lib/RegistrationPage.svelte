<script>
  import HackathonRegistration from './HackathonRegistration.svelte';
  import PitchFestRegistration from './PitchFestRegistration.svelte';

  // Event selection state: 'hackathon' | 'pitchfest'
  let activeEvent = $state('hackathon');

  // Track pane heights for smooth height transition
  let hackathonHeight = $state(0);
  let pitchfestHeight = $state(0);

  // Smooth height transition to prevent visual jumps
  let currentHeight = $derived(
    activeEvent === 'hackathon' ? hackathonHeight : pitchfestHeight
  );

  // Animate the viewport height only while switching tabs; inside a pane the
  // member cards animate themselves, and a lagging height would clip them.
  let switching = $state(false);
  let switchTimer;

  function selectEvent(event) {
    if (activeEvent === event) return;
    activeEvent = event;
    switching = true;
    clearTimeout(switchTimer);
    switchTimer = setTimeout(() => (switching = false), 500);
  }
</script>

<div class="page-container">
  <!-- Minimal branded header -->
  <header class="header-hero">
    <div class="header-inner">
      <img src="/logo.png" alt="ZEN CODE Logo" class="brand-logo" />

      <div class="header-copy">
        <span class="eyebrow-text">ZEN CODE 2026</span>
        <h1 class="header-title">Hackathon &amp; Pitch Fest</h1>
        <p class="header-desc">Register your team and be part of ZEN CODE 2026.</p>
      </div>
    </div>
  </header>

  <!-- MAIN CONTENT: ONE SINGLE REGISTRATION CONTAINER -->
  <main class="main-content">
    <div class="single-registration-card">
      <!-- TOP EVENT SWITCHER -->
      <div class="switcher-bar">
        <div class="segmented-switcher" role="tablist" aria-label="Select Event">
          <!-- Smooth Sliding Active Indicator -->
          <div 
            class="switcher-indicator"
            class:is-pitchfest={activeEvent === 'pitchfest'}
            aria-hidden="true"
          ></div>

          <button
            type="button"
            role="tab"
            id="tab-hackathon"
            aria-selected={activeEvent === 'hackathon'}
            aria-controls="panel-hackathon"
            class="switcher-tab"
            class:active={activeEvent === 'hackathon'}
            onclick={() => selectEvent('hackathon')}
          >
            <span class="tab-label">HACKATHON</span>
          </button>

          <button
            type="button"
            role="tab"
            id="tab-pitchfest"
            aria-selected={activeEvent === 'pitchfest'}
            aria-controls="panel-pitchfest"
            class="switcher-tab"
            class:active={activeEvent === 'pitchfest'}
            onclick={() => selectEvent('pitchfest')}
          >
            <span class="tab-label">PITCH FEST</span>
          </button>
        </div>
      </div>

      <!-- SECTION DIVIDER -->
      <div class="switcher-divider"></div>

      <!-- HORIZONTALLY SLIDING VIEWPORT -->
      <div 
        class="slider-viewport"
        class:switching
        style="height: {currentHeight > 0 ? `${currentHeight}px` : 'auto'};"
      >
        <div 
          class="slider-track"
          style="transform: translateX({activeEvent === 'hackathon' ? '0%' : '-50%'});"
        >
          <!-- HACKATHON SLIDE PANE -->
          <div 
            id="panel-hackathon"
            role="tabpanel"
            aria-labelledby="tab-hackathon"
            class="slider-pane"
            bind:clientHeight={hackathonHeight}
            class:dimmed={activeEvent !== 'hackathon'}
            inert={activeEvent !== 'hackathon' ? true : undefined}
          >
            <HackathonRegistration />
          </div>

          <!-- PITCH FEST SLIDE PANE -->
          <div 
            id="panel-pitchfest"
            role="tabpanel"
            aria-labelledby="tab-pitchfest"
            class="slider-pane"
            bind:clientHeight={pitchfestHeight}
            class:dimmed={activeEvent !== 'pitchfest'}
            inert={activeEvent !== 'pitchfest' ? true : undefined}
          >
            <PitchFestRegistration />
          </div>
        </div>
      </div>
    </div>
  </main>

  <!-- COMPACT FOOTER -->
  <footer class="page-footer">
    <div class="footer-inner">
      <p class="footer-title">
        ZEN CODE 2026 &bull; Official Registration Portal
      </p>
      <p class="footer-note">
        All submissions are recorded in the Firestore database. Duplicate registrations for the same event are restricted.
      </p>
    </div>
  </footer>
</div>

<style>
  .page-container {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background-color: var(--bg-page);
    overflow-x: hidden;
  }

  /* Minimal Branded Header (Forest 800) */
  .header-hero {
    background-color: var(--forest-800);
    color: var(--text-white);
    padding: 14px 20px;
    border-bottom: 1px solid rgba(240, 196, 92, 0.38);
  }

  .header-inner {
    max-width: 1160px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
  }

  .brand-logo {
    width: 46px;
    height: auto;
    object-fit: contain;
    flex: 0 0 auto;
    display: block;
  }

  .header-copy {
    min-width: 0;
    text-align: left;
  }

  .eyebrow-text {
    display: block;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.14em;
    color: var(--accent-gold);
    text-transform: uppercase;
    line-height: 1.2;
    margin-bottom: 2px;
  }

  .header-title {
    font-size: clamp(22px, 3vw, 30px);
    font-weight: 700;
    color: var(--text-white);
    letter-spacing: 0;
    line-height: 1.1;
  }

  .header-desc {
    font-size: 13px;
    color: #e1ede0;
    line-height: 1.35;
    margin-top: 4px;
  }

  /* Main Registration Area: ONE Single Registration Container */
  .main-content {
    max-width: 760px;
    width: 100%;
    margin: 0 auto;
    padding: 32px 20px 60px 20px;
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .single-registration-card {
    background: #ffffff;
    border: 1px solid var(--border-card);
    border-radius: var(--radius-card);
    box-shadow: 0 1px 4px rgba(24, 35, 26, 0.05);
    overflow: hidden;
    position: relative;
    width: 100%;
  }

  /* Segmented Event Switcher */
  .switcher-bar {
    padding: 16px 20px;
    display: flex;
    justify-content: center;
    background: #ffffff;
  }

  .segmented-switcher {
    position: relative;
    display: flex;
    width: 100%;
    max-width: 420px;
    background: #f0f3ee;
    border: 1px solid var(--border-card);
    border-radius: 8px;
    padding: 4px;
  }

  .switcher-indicator {
    position: absolute;
    top: 4px;
    bottom: 4px;
    left: 4px;
    width: calc(50% - 4px);
    background: var(--action-green);
    border-radius: 6px;
    transition: transform 450ms cubic-bezier(0.22, 1, 0.36, 1);
    box-shadow: 0 1px 3px rgba(24, 35, 26, 0.16);
  }

  .switcher-indicator.is-pitchfest {
    transform: translateX(100%);
  }

  .switcher-tab {
    position: relative;
    z-index: 2;
    flex: 1;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--text-primary);
    transition: color 250ms ease;
    user-select: none;
  }

  .switcher-tab.active {
    color: #ffffff;
  }

  .switcher-tab:focus-visible {
    outline: 2px solid var(--support-green);
    outline-offset: -2px;
    border-radius: 6px;
  }

  .tab-label {
    position: relative;
    z-index: 3;
  }

  .switcher-divider {
    height: 1px;
    background: var(--border-card);
    width: 100%;
  }

  /* Horizontally Sliding Viewport & Track */
  .slider-viewport {
    width: 100%;
    overflow: hidden;
    position: relative;
  }

  .slider-viewport.switching {
    transition: height 450ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .slider-track {
    display: flex;
    width: 200%;
    transition: transform 450ms cubic-bezier(0.22, 1, 0.36, 1);
    will-change: transform;
    align-items: flex-start;
  }

  .slider-pane {
    transition: opacity 350ms ease;
    width: 50%;
    min-width: 50%;
    box-sizing: border-box;
    padding: 24px 28px;
  }

  .slider-pane.dimmed {
    opacity: 0;
  }

  /* Footer */
  .page-footer {
    background-color: #ffffff;
    border-top: 1px solid var(--border-card);
    padding: 24px 20px;
    margin-top: auto;
  }

  .footer-inner {
    max-width: 1160px;
    margin: 0 auto;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .footer-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .footer-note {
    font-size: 12px;
    color: var(--text-muted);
  }

  /* Mobile Responsive */
  @media (max-width: 640px) {
    .header-hero {
      padding: 12px 14px;
    }
    .header-inner {
      justify-content: flex-start;
      gap: 10px;
    }
    .brand-logo {
      width: 38px;
    }
    .header-title {
      font-size: 22px;
    }
    .header-desc {
      font-size: 12px;
    }
    .main-content {
      padding: 16px 12px 40px 12px;
    }
    .switcher-bar {
      padding: 12px 14px;
    }
    .slider-pane {
      padding: 18px 14px;
    }
  }

  /* Reduced Motion Support */
  @media (prefers-reduced-motion: reduce) {
    .slider-track,
    .slider-viewport,
    .slider-pane,
    .switcher-indicator {
      transition: none !important;
    }
  }
</style>
