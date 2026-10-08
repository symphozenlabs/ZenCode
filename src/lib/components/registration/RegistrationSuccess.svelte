<script>
  let { 
    eventTitle = 'Hackathon', 
    teamSize = 3, 
    leaderName = '', 
    onReset = () => {} 
  } = $props();
</script>

<div class="success-box" role="status" aria-live="polite">
  <div class="success-icon-wrap">
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  </div>

  <div class="gold-accent-line"></div>

  <h3 class="success-title">REGISTRATION SUCCESSFUL</h3>

  <p class="success-desc">
    Your {eventTitle} registration has been recorded for <strong>ZEN CODE 2026</strong>.
  </p>

  <div class="summary-card">
    <div class="summary-row">
      <span class="summary-label">Event:</span>
      <span class="summary-value">{eventTitle}</span>
    </div>
    {#if leaderName}
      <div class="summary-row">
        <span class="summary-label">Team Leader:</span>
        <span class="summary-value">{leaderName}</span>
      </div>
    {/if}
    <div class="summary-row">
      <span class="summary-label">Team Size:</span>
      <span class="summary-value green-badge">{teamSize} Members</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">Status:</span>
      <span class="summary-value status-badge">Recorded</span>
    </div>
  </div>

  <button type="button" class="reset-btn" onclick={onReset}>
    REGISTER ANOTHER TEAM
  </button>
</div>

<style>
  .success-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 32px 20px;
    background: #ffffff;
    border-radius: var(--radius-card);
  }

  .success-icon-wrap {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--light-green);
    color: var(--forest-800);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
  }

  .gold-accent-line {
    width: 36px;
    height: 3px;
    background: var(--accent-gold);
    border-radius: 2px;
    margin-bottom: 12px;
  }

  .success-title {
    font-size: 18px;
    font-weight: 700;
    color: var(--forest-800);
    letter-spacing: 0.04em;
    margin-bottom: 8px;
  }

  .success-desc {
    font-size: 14px;
    color: var(--text-muted);
    max-width: 360px;
    line-height: 1.5;
    margin-bottom: 20px;
  }

  .summary-card {
    width: 100%;
    background: var(--light-green-subtle);
    border: 1px solid var(--border-card);
    border-radius: var(--radius-input);
    padding: 12px 16px;
    margin-bottom: 24px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .summary-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 13px;
  }

  .summary-label {
    color: var(--text-muted);
    font-weight: 500;
  }

  .summary-value {
    color: var(--text-primary);
    font-weight: 600;
  }

  .green-badge {
    color: var(--forest-800);
    font-weight: 700;
  }

  .status-badge {
    background: var(--light-green);
    color: var(--forest-800);
    padding: 2px 8px;
    border-radius: var(--radius-badge);
    font-size: 12px;
  }

  .reset-btn {
    width: 100%;
    height: 44px;
    padding: 0 16px;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--text-white);
    background: var(--action-green);
    border: none;
    border-radius: var(--radius-btn);
    cursor: pointer;
    transition: background 150ms ease;
  }

  .reset-btn:hover {
    background: var(--action-green-hover);
  }
</style>
