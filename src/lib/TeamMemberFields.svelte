<script>
  let {
    memberNumber = 1,
    title = '',
    roleBadge = '',
    name = $bindable(''),
    admissionNumber = $bindable(''),
    yearOfStudy = $bindable(''),
    email = $bindable(''),
    nameReadOnly = false,
    admissionReadOnly = false,
    canRemove = false,
    onRemove = () => {},
    errors = {},
    disabled = false
  } = $props();

  const yearOptions = [
    '1st Year',
    '2nd Year',
    '3rd Year',
    '4th Year'
  ];
</script>

<div class="member-block" class:is-leader={memberNumber === 1}>
  <div class="member-header">
    <div class="member-title-wrap">
      <span class="member-number-badge">{memberNumber}</span>
      <h4 class="member-title">{title || `Team Member ${memberNumber}`}</h4>
    </div>
    <div class="badges-wrap">
      {#if roleBadge}
        <span class="role-badge" class:leader-badge={memberNumber === 1}>{roleBadge}</span>
      {/if}
      {#if canRemove}
        <button
          type="button"
          class="remove-member-btn"
          onclick={onRemove}
          {disabled}
          title="Remove this member"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
          Remove
        </button>
      {/if}
    </div>
  </div>

  <div class="fields-grid">
    <!-- Name Field -->
    <div class="form-group field-item">
      <label class="form-label" for={`m${memberNumber}-name`}>
        <span>Name <span class="required-mark">*</span></span>
        {#if nameReadOnly}
          <span class="auto-badge">Auto</span>
        {/if}
      </label>
      <input
        id={`m${memberNumber}-name`}
        type="text"
        class="form-input"
        class:input-error={errors.name}
        placeholder="Full Name"
        bind:value={name}
        readonly={nameReadOnly}
        {disabled}
      />
      {#if errors.name}
        <span class="field-error-msg">{errors.name}</span>
      {/if}
    </div>

    <!-- Admission Number Field -->
    <div class="form-group field-item">
      <label class="form-label" for={`m${memberNumber}-adm`}>
        <span>Admission Number <span class="required-mark">*</span></span>
        {#if admissionReadOnly}
          <span class="auto-badge">Auto</span>
        {/if}
      </label>
      <input
        id={`m${memberNumber}-adm`}
        type="text"
        class="form-input"
        class:input-error={errors.admissionNumber}
        placeholder="e.g. 23BCSE012"
        bind:value={admissionNumber}
        readonly={admissionReadOnly}
        {disabled}
      />
      {#if errors.admissionNumber}
        <span class="field-error-msg">{errors.admissionNumber}</span>
      {/if}
    </div>

    <!-- Year of Study Field -->
    <div class="form-group field-item">
      <label class="form-label" for={`m${memberNumber}-year`}>
        <span>Year of Study <span class="required-mark">*</span></span>
      </label>
      <select
        id={`m${memberNumber}-year`}
        class="form-select"
        class:input-error={errors.yearOfStudy}
        bind:value={yearOfStudy}
        {disabled}
      >
        <option value="" disabled selected>Select Year of Study</option>
        {#each yearOptions as yr}
          <option value={yr}>{yr}</option>
        {/each}
      </select>
      {#if errors.yearOfStudy}
        <span class="field-error-msg">{errors.yearOfStudy}</span>
      {/if}
    </div>

    <!-- Email ID Field -->
    <div class="form-group field-item">
      <label class="form-label" for={`m${memberNumber}-email`}>
        <span>Email ID <span class="required-mark">*</span></span>
      </label>
      <input
        id={`m${memberNumber}-email`}
        type="email"
        class="form-input"
        class:input-error={errors.email}
        placeholder="student@example.edu"
        bind:value={email}
        {disabled}
      />
      {#if errors.email}
        <span class="field-error-msg">{errors.email}</span>
      {/if}
    </div>
  </div>
</div>

<style>
  .member-block {
    background: #ffffff;
    border: 1.5px solid var(--base-border);
    border-radius: var(--radius-md);
    padding: 18px 20px;
    margin-bottom: 16px;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .member-block:hover {
    border-color: #cbd5e1;
  }

  .member-block.is-leader {
    background: linear-gradient(to bottom, #fcfdfe, #ffffff);
    border-left: 3.5px solid var(--primary-cyan);
  }

  .member-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--base-border-light);
  }

  .member-title-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .member-number-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--primary-cyan-light);
    color: var(--primary-cyan-dark);
    font-size: 0.78rem;
    font-weight: 700;
  }

  .member-title {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .badges-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .role-badge {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 2px 8px;
    border-radius: var(--radius-full);
    background: var(--base-border-light);
    color: var(--text-muted);
  }

  .role-badge.leader-badge {
    background: var(--secondary-mint);
    color: var(--secondary-mint-dark);
  }

  .auto-badge {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--primary-cyan-dark);
    background: var(--primary-cyan-light);
    padding: 1px 6px;
    border-radius: 4px;
  }

  .remove-member-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: var(--error-bg);
    border: 1px solid var(--error-border);
    color: var(--error-text);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .remove-member-btn:hover:not(:disabled) {
    background: #ffe4e6;
  }

  .remove-member-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .fields-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px 16px;
  }

  @media (max-width: 640px) {
    .fields-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
