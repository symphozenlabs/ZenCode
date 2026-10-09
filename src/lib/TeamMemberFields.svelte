<script>
  import { slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { motionMs } from './motion.js';
  import { ADMISSION_HINT, admissionStatus } from './admission.js';

  let {
    idPrefix = 'member',
    memberNumber = 1,
    title = '',
    roleBadge = '',
    name = $bindable(''),
    admissionNumber = $bindable(''),
    /** Derived from the admission number by the parent form */
    yearOfStudy = '',
    email = $bindable(''),
    mobile = $bindable(''),
    showMobile = false,
    open = $bindable(true),
    admissionPlaceholder = 'e.g. 23BCSE012',
    errors = {},
    disabled = false,
    onRemove = undefined
  } = $props();

  const isLeader = $derived(memberNumber === 1);

  // Live admission check, like the browser does for type=email: a wrong
  // character is flagged at once, an unfinished number only after leaving the field.
  let admTouched = $state(false);
  const admStatus = $derived(admissionStatus(admissionNumber));
  const admLiveError = $derived(
    admStatus === 'invalid' || (admStatus === 'partial' && admTouched) ? ADMISSION_HINT : ''
  );
  // Submit-time errors (e.g. duplicates in the team) still show unless the live check now passes the format.
  const admError = $derived(
    admLiveError || (errors.admissionNumber && !(admStatus === 'valid' && errors.admissionNumber === ADMISSION_HINT) ? errors.admissionNumber : '')
  );
  const hasErrors = $derived(
    Object.entries(errors || {}).some(([k, v]) => v && k !== 'admissionNumber') || Boolean(admError)
  );
  const isComplete = $derived(
    Boolean(
      name.trim() && admissionNumber.trim() && yearOfStudy && email.trim() && (!showMobile || mobile.trim())
    )
  );
  const summary = $derived(
    [name.trim(), admissionNumber.trim().toUpperCase()].filter(Boolean).join(' · ') || 'Not filled in yet'
  );
  const bodyId = $derived(`${idPrefix}-m${memberNumber}-body`);
  const fieldId = (field) => `${idPrefix}-m${memberNumber}-${field}`;
</script>

<div
  class="member-block"
  class:is-leader={isLeader}
  class:is-open={open}
  class:has-errors={hasErrors}
>
  <div class="member-header">
    <button
      type="button"
      class="member-toggle"
      aria-expanded={open}
      aria-controls={bodyId}
      onclick={() => (open = !open)}
    >
      <span class="member-num-badge" class:done={isComplete && !hasErrors}>
        {#if isComplete && !hasErrors}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>
        {:else}
          {memberNumber}
        {/if}
      </span>
      <span class="member-title-wrap">
        <span class="member-title">{title || `MEMBER ${memberNumber}`}</span>
        <span class="member-summary" class:visible={!open}>
          {hasErrors ? 'Needs attention' : summary}
        </span>
      </span>
      {#if roleBadge}
        <span class="role-badge" class:leader-badge={isLeader}>{roleBadge}</span>
      {/if}
      <svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>
    </button>

    {#if onRemove}
      <button
        type="button"
        class="remove-btn"
        aria-label={`Remove member ${memberNumber}`}
        title="Remove member"
        onclick={onRemove}
        {disabled}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    {/if}
  </div>

  {#if open}
    <div id={bodyId} class="member-body" transition:slide={{ duration: motionMs(260), easing: cubicOut }}>
      <div class="member-fields-grid">
        <div class="form-group">
          <label class="form-label" for={fieldId('name')}>
            <span>Name <span class="required-mark">*</span></span>
          </label>
          <input
            id={fieldId('name')}
            type="text"
            class="form-input"
            class:input-error={errors.name}
            placeholder="Full Name"
            autocomplete="off"
            bind:value={name}
            {disabled}
          />
          {#if errors.name}
            <span class="field-error-msg">{errors.name}</span>
          {/if}
        </div>

        <div class="form-group">
          <label class="form-label" for={fieldId('adm')}>
            <span>Admission Number <span class="required-mark">*</span></span>
          </label>
          <div class="adm-wrap">
            <input
              id={fieldId('adm')}
              type="text"
              class="form-input adm-input"
              class:input-error={admError}
              class:input-valid={admStatus === 'valid' && !admError}
              placeholder={admissionPlaceholder}
              autocomplete="off"
              autocapitalize="characters"
              spellcheck="false"
              maxlength="11"
              pattern="2[56][Cc][Aa][Pp][Mm][Cc][Aa][0-9]{3}"
              aria-invalid={admError ? 'true' : undefined}
              aria-describedby={admError ? fieldId('adm-error') : undefined}
              bind:value={admissionNumber}
              onblur={() => (admTouched = true)}
              {disabled}
            />
            {#if admStatus === 'valid' && !admError}
              <svg class="adm-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>
            {/if}
          </div>
          {#if admError}
            <span id={fieldId('adm-error')} class="field-error-msg" aria-live="polite">{admError}</span>
          {/if}
        </div>

        <div class="form-group">
          <label class="form-label" for={fieldId('year')}>
            <span>Year of Study</span>
            <span class="auto-badge">Auto</span>
          </label>
          <input
            id={fieldId('year')}
            type="text"
            class="form-input year-auto"
            class:filled={yearOfStudy}
            value={yearOfStudy}
            placeholder="Filled from admission number"
            readonly
            tabindex="-1"
            aria-describedby={fieldId('year-hint')}
            {disabled}
          />
          <span id={fieldId('year-hint')} class="year-hint">25… → PG 2nd Year · 26… → PG 1st Year</span>
        </div>

        <div class="form-group">
          <label class="form-label" for={fieldId('email')}>
            <span>Email ID <span class="required-mark">*</span></span>
          </label>
          <input
            id={fieldId('email')}
            type="email"
            class="form-input"
            class:input-error={errors.email}
            placeholder="student@example.edu"
            autocomplete="off"
            bind:value={email}
            {disabled}
          />
          {#if errors.email}
            <span class="field-error-msg">{errors.email}</span>
          {/if}
        </div>

        {#if showMobile}
          <div class="form-group">
            <label class="form-label" for={fieldId('mobile')}>
              <span>Mobile Number <span class="required-mark">*</span></span>
            </label>
            <input
              id={fieldId('mobile')}
              type="tel"
              inputmode="tel"
              class="form-input"
              class:input-error={errors.mobile}
              placeholder="10-digit mobile number"
              autocomplete="tel"
              maxlength="16"
              bind:value={mobile}
              {disabled}
            />
            {#if errors.mobile}
              <span class="field-error-msg">{errors.mobile}</span>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .member-block {
    background: #ffffff;
    border: 1px solid var(--border-card);
    border-radius: var(--radius-input);
    margin-bottom: 12px;
    transition: border-color 200ms ease, box-shadow 200ms ease, background-color 200ms ease;
  }

  .member-block:hover {
    border-color: #cbd5c8;
  }

  .member-block.is-open {
    box-shadow: 0 2px 10px rgba(24, 35, 26, 0.06);
  }

  .member-block.is-leader {
    background: var(--light-green-subtle);
    border-left: 3px solid var(--forest-800);
  }

  .member-block.has-errors {
    border-color: var(--error-border);
  }

  .member-header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 6px 4px 4px;
  }

  .member-toggle {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    background: transparent;
    border: none;
    border-radius: var(--radius-input);
    cursor: pointer;
    text-align: left;
    color: inherit;
    font: inherit;
  }

  .member-toggle:focus-visible {
    outline-offset: -2px;
  }

  .member-num-badge {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--light-green);
    color: var(--forest-800);
    font-size: 11px;
    font-weight: 700;
    transition: background-color 200ms ease, color 200ms ease, transform 200ms ease;
  }

  .member-num-badge.done {
    background: var(--action-green);
    color: #ffffff;
    transform: scale(1.05);
  }

  .member-title-wrap {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .member-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: 0.02em;
  }

  .member-summary {
    font-size: 12px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-height: 0;
    opacity: 0;
    transition: max-height 220ms ease, opacity 220ms ease;
  }

  .member-summary.visible {
    max-height: 18px;
    opacity: 1;
  }

  .has-errors .member-summary {
    color: var(--error-text);
  }

  .role-badge {
    flex: 0 0 auto;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: var(--radius-badge);
    background: #f0f3ee;
    color: var(--text-muted);
  }

  .role-badge.leader-badge {
    background: var(--light-green);
    color: var(--forest-800);
  }

  .chevron {
    flex: 0 0 auto;
    color: var(--text-muted);
    transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .is-open .chevron {
    transform: rotate(180deg);
  }

  .remove-btn {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: none;
    border-radius: var(--radius-input);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: background-color 150ms ease, color 150ms ease;
  }

  .remove-btn:hover:not(:disabled) {
    background: var(--error-bg);
    color: var(--error-text);
  }

  .remove-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .adm-wrap {
    position: relative;
  }

  .adm-input {
    text-transform: uppercase;
    padding-right: 34px;
  }

  .adm-input::placeholder {
    text-transform: none;
  }

  .adm-input.input-valid {
    border-color: var(--support-green);
  }

  .adm-check {
    position: absolute;
    right: 11px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--action-green);
    pointer-events: none;
    animation: check-in 220ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  @keyframes check-in {
    from { opacity: 0; transform: translateY(-50%) scale(0.6); }
  }

  .year-auto {
    background-color: var(--bg-disabled);
    color: var(--text-muted);
    cursor: default;
    transition: background-color 220ms ease, color 220ms ease, border-color 220ms ease;
  }

  .year-auto.filled {
    background-color: var(--light-green-subtle);
    color: var(--forest-800);
    font-weight: 600;
    border-color: var(--border-card);
  }

  .year-auto:focus {
    box-shadow: none;
    border-color: var(--border-card);
  }

  .year-hint {
    font-size: 11px;
    color: var(--text-subtle);
    margin-top: 2px;
  }

  .member-body {
    overflow: hidden;
  }

  .member-fields-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px 14px;
    padding: 4px 16px 16px;
    border-top: 1px solid var(--border-divider);
    padding-top: 14px;
  }

  @media (max-width: 640px) {
    .member-fields-grid {
      grid-template-columns: 1fr;
      padding: 12px 12px 14px;
    }
    .role-badge {
      display: none;
    }
  }
</style>
