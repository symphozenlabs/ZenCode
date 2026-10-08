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

  function selectEvent(event) {
    if (activeEvent === event) return;
    activeEvent = event;
  }
</script>

<div class="page-container">
  <!-- COMPACT BRANDED HEADER / HERO -->
  <header class="header-hero">
    <div class="header-inner">
      <div class="eyebrow-row">
        <span class="gold-dot"></span>
        <span class="eyebrow-text">ZEN CODE 2026</span>
        <span class="gold-dot"></span>
      </div>

      <h1 class="header-title">Hackathon &amp; Pitch Fest</h1>

      <div class="gold-accent-rule"></div>

      <p class="header-desc">
        Register your team and be part of ZEN CODE 2026.
      </p>
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

  /* Compact Branded Header (Forest 800) */
  .header-hero {
    background-color: var(--forest-800);
    color: var(--text-white);
    padding: 34px 24px 28px 24px;
    border-bottom: 3px solid var(--forest-700);
  }

  .header-inner {
    max-width: 1160px;
    margin: 0 auto;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .eyebrow-row {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .gold-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: var(--accent-gold);
  }

  .eyebrow-text {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: #d1e2cb;
    text-transform: uppercase;
  }

  .header-title {
    font-size: clamp(28px, 4.2vw, 40px);
    font-weight: 700;
    color: var(--text-white);
    letter-spacing: -0.02em;
    line-height: 1.15;
    margin-bottom: 10px;
  }

  .gold-accent-rule {
    width: 44px;
    height: 3px;
    background-color: var(--accent-gold);
    border-radius: 2px;
    margin-bottom: 12px;
  }

  .header-desc {
    font-size: 15px;
    color: #e1ede0;
    max-width: 540px;
    line-height: 1.5;
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
    transition: transform 380ms cubic-bezier(0.4, 0, 0.2, 1);
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
    transition: height 420ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  .slider-track {
    display: flex;
    width: 200%;
    transition: transform 450ms cubic-bezier(0.4, 0, 0.2, 1);
    will-change: transform;
    align-items: flex-start;
  }

  .slider-pane {
    width: 50%;
    min-width: 50%;
    box-sizing: border-box;
    padding: 24px 28px;
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
      padding: 26px 16px 22px 16px;
    }
    .header-title {
      font-size: 28px;
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
</style>
