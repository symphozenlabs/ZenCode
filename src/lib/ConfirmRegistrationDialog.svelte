<script>
  let {
    eventName = '',
    confirmLabel = 'CONFIRM & REGISTER',
    /** { teamName, teamLeader, members } to review, or null when closed */
    details = null,
    submitting = false,
    onConfirm = () => {},
    onCancel = () => {}
  } = $props();

  const uid = $props.id();
  let dialogEl = $state();
  let closing = $state(false);
  // Last details shown, kept while the dialog animates closed.
  let shown = $state(null);

  $effect(() => {
    if (details) shown = details;
  });

  // Native <dialog> gives us the top layer, focus trapping, Esc and an inert page.
  $effect(() => {
    if (!dialogEl) return;
    if (details && !dialogEl.open) {
      closing = false;
      dialogEl.showModal();
    } else if (!details && dialogEl.open) {
      closeAnimated();
    }
  });

  function closeAnimated() {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return dialogEl.close();
    closing = true;
    setTimeout(() => {
      dialogEl?.close();
      closing = false;
    }, 180);
  }

  function cancel() {
    if (!submitting) onCancel();
  }

  function handleCancelEvent(e) {
    // Esc: route through our own close so state and animation stay in sync.
    e.preventDefault();
    cancel();
  }

  function handleBackdrop(e) {
    if (e.target === dialogEl) cancel();
  }

  function formatMobile(n) {
    return n && n.length === 10 ? `+91 ${n.slice(0, 5)} ${n.slice(5)}` : n;
  }
</script>

<dialog
  bind:this={dialogEl}
  class="confirm-dialog"
  class:closing
  aria-labelledby="{uid}-title"
  aria-describedby="{uid}-desc"
  oncancel={handleCancelEvent}
  onclick={handleBackdrop}
>
  {#if shown}
    <div class="dialog-inner">
      <header class="dialog-header">
        <span class="dialog-eyebrow">{eventName} · Final check</span>
        <h3 id="{uid}-title" class="dialog-title">Confirm your team details</h3>
        <p id="{uid}-desc" class="dialog-desc">
          Passes and QR codes are emailed to everyone below. Make sure every detail is correct.
        </p>
      </header>

      <div class="dialog-body">
        <dl class="team-summary">
          <div class="summary-item wide">
            <dt>Team name</dt>
            <dd class="team-name">{shown.teamName}</dd>
          </div>
          <div class="summary-item">
            <dt>Event</dt>
            <dd>{eventName}</dd>
          </div>
          <div class="summary-item">
            <dt>Team size</dt>
            <dd>{shown.members.length} {shown.members.length === 1 ? 'member' : 'members'}</dd>
          </div>
          <div class="summary-item wide">
            <dt>Leader mobile</dt>
            <dd>{formatMobile(shown.teamLeader.mobileNumber)}</dd>
          </div>
        </dl>

        <ol class="member-list">
          {#each shown.members as m, i (i)}
            <li class="member-row" style="--i: {i}">
              <span class="member-num" class:leader={i === 0}>{i + 1}</span>
              <div class="member-info">
                <div class="member-name-line">
                  <span class="member-name">{m.name}</span>
                  {#if i === 0}<span class="leader-tag">Leader</span>{/if}
                </div>
                <div class="member-meta">
                  <span>{m.admissionNumber.toUpperCase()}</span>
                  <span aria-hidden="true">·</span>
                  <span>{m.yearOfStudy}</span>
                </div>
                <div class="member-email">{m.email}</div>
              </div>
            </li>
          {/each}
        </ol>
      </div>

      <footer class="dialog-actions">
        <button type="button" class="btn-secondary" onclick={cancel} disabled={submitting}>
          Go back &amp; edit
        </button>
        <button type="button" class="btn-primary" onclick={onConfirm} disabled={submitting}>
          {#if submitting}
            <span class="btn-spinner"></span>
            Registering...
          {:else}
            {confirmLabel}
          {/if}
        </button>
      </footer>
    </div>
  {/if}
</dialog>

<style>
  .confirm-dialog {
    width: min(560px, calc(100vw - 24px));
    max-height: calc(100dvh - 32px);
    padding: 0;
    border: 1px solid var(--border-card);
    border-radius: var(--radius-card);
    background: #ffffff;
    color: var(--text-primary);
    box-shadow: 0 24px 60px rgba(13, 45, 32, 0.28);
    overflow: hidden;
  }

  .confirm-dialog[open] {
    display: flex;
    animation: dialog-in 260ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .confirm-dialog::backdrop {
    background: rgba(13, 45, 32, 0.45);
    backdrop-filter: blur(3px);
    animation: backdrop-in 260ms ease;
  }

  .confirm-dialog.closing {
    animation: dialog-out 180ms ease forwards;
  }

  .confirm-dialog.closing::backdrop {
    animation: backdrop-out 180ms ease forwards;
  }

  @keyframes dialog-in {
    from { opacity: 0; transform: translateY(16px) scale(0.97); }
    to { opacity: 1; transform: none; }
  }
  @keyframes dialog-out {
    to { opacity: 0; transform: translateY(8px) scale(0.98); }
  }
  @keyframes backdrop-in {
    from { opacity: 0; }
  }
  @keyframes backdrop-out {
    to { opacity: 0; }
  }

  .dialog-inner {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-height: 0;
  }

  .dialog-header {
    padding: 20px 22px 14px;
    border-bottom: 1px solid var(--border-divider);
    background: var(--light-green-subtle);
  }

  .dialog-eyebrow {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--support-green);
  }

  .dialog-title {
    font-size: 18px;
    font-weight: 700;
    color: var(--forest-800);
    margin: 4px 0;
  }

  .dialog-desc {
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.45;
  }

  .dialog-body {
    padding: 16px 22px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .team-summary {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px 16px;
    padding: 12px 14px;
    border: 1px solid var(--border-card);
    border-radius: var(--radius-input);
    margin: 0 0 14px;
  }

  .summary-item.wide {
    grid-column: span 2;
  }

  .summary-item dt {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-subtle);
  }

  .summary-item dd {
    margin: 2px 0 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    word-break: break-word;
  }

  .summary-item dd.team-name {
    font-size: 17px;
    color: var(--forest-800);
  }

  .member-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .member-row {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 10px 12px;
    border: 1px solid var(--border-divider);
    border-radius: var(--radius-input);
    animation: row-in 320ms cubic-bezier(0.22, 1, 0.36, 1) both;
    animation-delay: calc(var(--i) * 50ms + 80ms);
  }

  @keyframes row-in {
    from { opacity: 0; transform: translateY(6px); }
  }

  .member-num {
    flex: 0 0 auto;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    background: var(--light-green);
    color: var(--forest-800);
  }

  .member-num.leader {
    background: var(--action-green);
    color: #ffffff;
  }

  .member-info {
    min-width: 0;
    flex: 1;
  }

  .member-name-line {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .member-name {
    font-size: 14px;
    font-weight: 600;
    word-break: break-word;
  }

  .leader-tag {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    padding: 1px 6px;
    border-radius: var(--radius-badge);
    background: var(--accent-gold-soft);
    color: #8a6411;
  }

  .member-meta {
    display: flex;
    gap: 6px;
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 2px;
  }

  .member-email {
    font-size: 12px;
    color: var(--text-muted);
    word-break: break-all;
  }

  .dialog-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    padding: 14px 22px 18px;
    border-top: 1px solid var(--border-divider);
    background: #ffffff;
  }

  .btn-secondary,
  .btn-primary {
    height: 42px;
    padding: 0 18px;
    border-radius: var(--radius-btn);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.02em;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease, transform 120ms ease;
  }

  .btn-secondary {
    background: #ffffff;
    border: 1px solid var(--border-input);
    color: var(--text-primary);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--bg-disabled);
  }

  .btn-primary {
    background: var(--action-green);
    border: 1px solid var(--action-green);
    color: #ffffff;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--action-green-hover);
    box-shadow: 0 4px 14px rgba(63, 115, 52, 0.25);
  }

  .btn-primary:active:not(:disabled),
  .btn-secondary:active:not(:disabled) {
    transform: translateY(1px);
  }

  .btn-primary:disabled,
  .btn-secondary:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .btn-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #ffffff;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 520px) {
    .dialog-header,
    .dialog-body,
    .dialog-actions {
      padding-left: 16px;
      padding-right: 16px;
    }
    .dialog-actions {
      flex-direction: column-reverse;
    }
    .btn-secondary,
    .btn-primary {
      width: 100%;
    }
  }
</style>
