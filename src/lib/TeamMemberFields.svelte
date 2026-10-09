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
    yearReadOnly = false,
    emailReadOnly = false,
    errors = {},
    disabled = false
  } = $props();
</script>

<div class="member-block" class:is-leader={roleBadge.includes('Leader')}>
  <div class="member-header">
    <div class="member-title-wrap">
      <span class="member-num-badge">{memberNumber}</span>
      <h4 class="member-title">{title || `MEMBER ${memberNumber}`}</h4>
    </div>
    {#if roleBadge}
      <span class="role-badge" class:leader-badge={roleBadge.includes('Leader')}>{roleBadge}</span>
    {/if}
  </div>

  <div class="member-fields-grid">
    <!-- Name Field -->
    <div class="form-group">
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
    <div class="form-group">
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
    <div class="form-group">
      <label class="form-label" for={`m${memberNumber}-year`}>
        <span>Year of Study <span class="required-mark">*</span></span>
        {#if yearReadOnly}
          <span class="auto-badge">Auto</span>
        {/if}
      </label>
      {#if yearReadOnly}
        <input
          id={`m${memberNumber}-year`}
          type="text"
          class="form-input"
          value={yearOfStudy || 'Select Year'}
          readonly
          {disabled}
        />
      {:else}
        <select
          id={`m${memberNumber}-year`}
          class="form-input form-select"
          class:input-error={errors.yearOfStudy}
          bind:value={yearOfStudy}
          {disabled}
        >
          <option value="" disabled selected>Select Year</option>
          <option value="PG 1st Year">PG 1st Year</option>
          <option value="PG 2nd Year">PG 2nd Year</option>
        </select>
      {/if}
      {#if errors.yearOfStudy}
        <span class="field-error-msg">{errors.yearOfStudy}</span>
      {/if}
    </div>

    <!-- Email ID Field -->
    <div class="form-group">
      <label class="form-label" for={`m${memberNumber}-email`}>
        <span>Email ID <span class="required-mark">*</span></span>
        {#if emailReadOnly}
          <span class="auto-badge">Auto</span>
        {/if}
      </label>
      <input
        id={`m${memberNumber}-email`}
        type="email"
        class="form-input"
        class:input-error={errors.email}
        placeholder="student@example.edu"
        bind:value={email}
        readonly={emailReadOnly}
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
    border: 1px solid var(--border-card);
    border-radius: var(--radius-input);
    padding: 14px 16px;
    margin-bottom: 14px;
    transition: border-color 150ms ease;
  }

  .member-block:hover {
    border-color: #cbd5c8;
  }

  .member-block.is-leader {
    background: var(--light-green-subtle);
    border-left: 3px solid var(--forest-800);
  }

  .member-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border-divider);
  }

  .member-title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .member-num-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--light-green);
    color: var(--forest-800);
    font-size: 11px;
    font-weight: 700;
  }

  .member-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: 0.02em;
  }

  .role-badge {
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

  .member-fields-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px 14px;
  }

  @media (max-width: 640px) {
    .member-fields-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
