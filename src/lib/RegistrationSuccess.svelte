<script>
  let { 
    eventTitle = 'Hackathon', 
    teamSize = 3, 
    leaderName = '', 
    onReset = () => {} 
  } = $props();
</script>

<div class="success-card">
  <div class="success-icon-badge">
    <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  </div>

  <span class="success-status-pill">✓ Registration Successful!</span>

  <h3 class="success-brand">ZEN CODE 2026</h3>
  <h4 class="success-event">{eventTitle} Registration Completed</h4>

  <p class="success-message">
    Your team registration has been recorded successfully in the system.
  </p>

  <div class="success-summary">
    <div class="summary-item">
      <span class="summary-label">Event:</span>
      <span class="summary-val">{eventTitle}</span>
    </div>
    {#if leaderName}
      <div class="summary-item">
        <span class="summary-label">Team Leader:</span>
        <span class="summary-val">{leaderName}</span>
      </div>
    {/if}
    <div class="summary-item">
      <span class="summary-label">Team Members:</span>
      <span class="summary-val summary-highlight">{teamSize} Members</span>
    </div>
  </div>

  <button type="button" class="reset-button" onclick={onReset}>
    <svg class="reset-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
      <path d="M21 3v5h-5"></path>
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
      <path d="M3 21v-5h5"></path>
    </svg>
    REGISTER ANOTHER TEAM
  </button>
</div>

<style>
  .success-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 36px 24px;
    background: #ffffff;
    border-radius: var(--radius-lg);
    border: 1.5px solid var(--primary-cyan-border);
    box-shadow: 0 12px 28px -6px rgba(6, 182, 212, 0.12);
    animation: fadeInScale 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes fadeInScale {
    from {
      opacity: 0;
      transform: scale(0.96);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .success-icon-badge {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--primary-cyan), var(--secondary-mint-dark));
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ffffff;
    margin-bottom: 16px;
    box-shadow: 0 6px 16px rgba(6, 182, 212, 0.28);
  }

  .check-icon {
    width: 32px;
    height: 32px;
  }

  .success-status-pill {
    display: inline-block;
    font-size: 0.82rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--secondary-mint-dark);
    background: var(--secondary-mint);
    padding: 4px 12px;
    border-radius: var(--radius-full);
    margin-bottom: 12px;
  }

  .success-brand {
    font-size: 1.15rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    text-transform: uppercase;
    margin-bottom: 4px;
  }

  .success-event {
    font-size: 1.35rem;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 10px;
  }

  .success-message {
    font-size: 0.94rem;
    color: var(--text-secondary);
    max-width: 380px;
    line-height: 1.5;
    margin-bottom: 24px;
  }

  .success-summary {
    width: 100%;
    max-width: 360px;
    background: var(--base-bg-subtle);
    border: 1px solid var(--base-border);
    border-radius: var(--radius-md);
    padding: 14px 18px;
    margin-bottom: 28px;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .summary-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.9rem;
  }

  .summary-label {
    color: var(--text-muted);
    font-weight: 500;
  }

  .summary-val {
    color: var(--text-primary);
    font-weight: 600;
  }

  .summary-highlight {
    color: var(--primary-cyan-dark);
    font-weight: 700;
  }

  .reset-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 24px;
    font-size: 0.9rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    color: #ffffff;
    background: linear-gradient(135deg, var(--primary-cyan), var(--primary-cyan-hover));
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(6, 182, 212, 0.25);
    transition: all 0.2s ease;
  }

  .reset-button:hover {
    background: linear-gradient(135deg, var(--primary-cyan-hover), var(--primary-cyan-dark));
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(6, 182, 212, 0.35);
  }

  .reset-button:active {
    transform: translateY(0);
  }

  .reset-icon {
    width: 16px;
    height: 16px;
  }
</style>
