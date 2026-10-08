<script>
  import TeamMemberFields from './TeamMemberFields.svelte';
  import RegistrationSuccess from './RegistrationSuccess.svelte';
  import {
    COLLECTIONS,
    checkDuplicateRegistration,
    registerPitchFestTeam
  } from './registration-db.js';

  // Pitch Fest strictly has 2 members
  const teamSize = 2;

  // Member 1 / Team Leader
  let member1 = $state({
    name: '',
    admissionNumber: '',
    classSection: '',
    email: ''
  });

  // Member 2
  let member2 = $state({
    name: '',
    admissionNumber: '',
    email: ''
  });

  // Status & validation
  let isSubmitting = $state(false);
  let isSuccess = $state(false);
  let formError = $state('');
  let fieldErrors = $state({});

  // Email format validator
  function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test((email || '').trim());
  }

  // Validate form
  function validateForm() {
    const errors = {};
    let hasError = false;

    // Member 1 validation
    if (!member1.name.trim()) {
      errors.m1Name = 'Name is required.';
      hasError = true;
    }
    if (!member1.admissionNumber.trim()) {
      errors.m1Admission = 'Admission Number is required.';
      hasError = true;
    }
    if (!member1.classSection.trim()) {
      errors.m1ClassSection = 'Class and Section is required.';
      hasError = true;
    }
    if (!member1.email.trim()) {
      errors.m1Email = 'Email ID is required.';
      hasError = true;
    } else if (!isValidEmail(member1.email)) {
      errors.m1Email = 'Please enter a valid email address.';
      hasError = true;
    }

    // Member 2 validation
    if (!member2.name.trim()) {
      errors.m2Name = 'Name is required.';
      hasError = true;
    }
    if (!member2.admissionNumber.trim()) {
      errors.m2Admission = 'Admission Number is required.';
      hasError = true;
    }
    if (!member2.email.trim()) {
      errors.m2Email = 'Email ID is required.';
      hasError = true;
    } else if (!isValidEmail(member2.email)) {
      errors.m2Email = 'Please enter a valid email address.';
      hasError = true;
    }

    // Check duplicate within the team
    if (
      member1.admissionNumber.trim() &&
      member2.admissionNumber.trim() &&
      member1.admissionNumber.trim().toUpperCase() === member2.admissionNumber.trim().toUpperCase()
    ) {
      formError = 'Member 1 and Member 2 cannot have the same admission number.';
      hasError = true;
    }

    if (
      !formError &&
      member1.email.trim() &&
      member2.email.trim() &&
      member1.email.trim().toLowerCase() === member2.email.trim().toLowerCase()
    ) {
      formError = 'Member 1 and Member 2 cannot have the same email address.';
      hasError = true;
    }

    fieldErrors = errors;
    return !hasError;
  }

  // Handle Submit
  async function handleSubmit(e) {
    e.preventDefault();
    formError = '';

    if (!validateForm()) {
      return;
    }

    isSubmitting = true;

    try {
      const admissionNumbers = [
        member1.admissionNumber.trim(),
        member2.admissionNumber.trim()
      ];
      const emails = [
        member1.email.trim(),
        member2.email.trim()
      ];

      // Check duplicates in Pitch Fest collection
      const dupCheck = await checkDuplicateRegistration(
        COLLECTIONS.PITCH_FEST,
        'Pitch Fest',
        admissionNumbers,
        emails
      );

      if (dupCheck.isDuplicate) {
        formError = dupCheck.message || 'This participant is already registered for this event.';
        isSubmitting = false;
        return;
      }

      // Save to Firestore
      await registerPitchFestTeam({
        teamLeader: {
          name: member1.name,
          admissionNumber: member1.admissionNumber,
          classSection: member1.classSection,
          email: member1.email
        },
        members: [
          {
            memberNumber: 1,
            name: member1.name,
            admissionNumber: member1.admissionNumber,
            email: member1.email
          },
          {
            memberNumber: 2,
            name: member2.name,
            admissionNumber: member2.admissionNumber,
            email: member2.email
          }
        ]
      });

      isSuccess = true;
    } catch (err) {
      console.error('Pitch Fest registration failed:', err);
      formError = 'Registration failed. Please try again.';
    } finally {
      isSubmitting = false;
    }
  }

  // Reset form
  function handleReset() {
    member1 = { name: '', admissionNumber: '', classSection: '', email: '' };
    member2 = { name: '', admissionNumber: '', email: '' };
    fieldErrors = {};
    formError = '';
    isSuccess = false;
  }
</script>

<div class="form-content-inner">
  <!-- Card Header -->
  <div class="card-header">
    <div class="indicator-row">
      <span class="event-indicator"></span>
      <span class="event-type-label">PITCH FEST TRACK</span>
    </div>
    <h3 class="card-title">PITCH FEST REGISTRATION</h3>
    <p class="card-tagline">Present your idea. Inspire the future.</p>
  </div>

  {#if isSuccess}
    <RegistrationSuccess
      eventTitle="Pitch Fest"
      teamSize={teamSize}
      leaderName={member1.name}
      onReset={handleReset}
    />
  {:else}
    <form onsubmit={handleSubmit} novalidate>
      {#if formError}
        <div class="alert-box alert-error" role="alert" aria-live="polite">
          <svg class="alert-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <div>{formError}</div>
        </div>
      {/if}

      <!-- Fixed Team Size Info Row -->
      <div class="team-size-info-row">
        <div class="info-label-group">
          <span class="info-title">TEAM SIZE</span>
          <span class="info-desc">Fixed Requirement</span>
        </div>
        <div class="size-pill">
          2 MEMBERS
        </div>
      </div>

      <!-- SECTION: TEAM LEADER / MEMBER 1 -->
      <div class="section-container">
        <div class="section-header">
          <h4 class="section-heading">TEAM LEADER / MEMBER 1</h4>
          <span class="section-sub">Leader Details</span>
        </div>

        <div class="fields-grid">
          <!-- Name -->
          <div class="form-group">
            <label class="form-label" for="pitch-m1-name">
              <span>Name <span class="required-mark">*</span></span>
            </label>
            <input
              id="pitch-m1-name"
              type="text"
              class="form-input"
              class:input-error={fieldErrors.m1Name}
              placeholder="Full Name"
              bind:value={member1.name}
              disabled={isSubmitting}
            />
            {#if fieldErrors.m1Name}
              <span class="field-error-msg">{fieldErrors.m1Name}</span>
            {/if}
          </div>

          <!-- Admission Number -->
          <div class="form-group">
            <label class="form-label" for="pitch-m1-adm">
              <span>Admission Number <span class="required-mark">*</span></span>
            </label>
            <input
              id="pitch-m1-adm"
              type="text"
              class="form-input"
              class:input-error={fieldErrors.m1Admission}
              placeholder="e.g. 23BITE045"
              bind:value={member1.admissionNumber}
              disabled={isSubmitting}
            />
            {#if fieldErrors.m1Admission}
              <span class="field-error-msg">{fieldErrors.m1Admission}</span>
            {/if}
          </div>

          <!-- Class and Section -->
          <div class="form-group">
            <label class="form-label" for="pitch-m1-class">
              <span>Class and Section <span class="required-mark">*</span></span>
            </label>
            <input
              id="pitch-m1-class"
              type="text"
              class="form-input"
              class:input-error={fieldErrors.m1ClassSection}
              placeholder="e.g. IT-A / 2nd Year"
              bind:value={member1.classSection}
              disabled={isSubmitting}
            />
            {#if fieldErrors.m1ClassSection}
              <span class="field-error-msg">{fieldErrors.m1ClassSection}</span>
            {/if}
          </div>

          <!-- Email ID -->
          <div class="form-group">
            <label class="form-label" for="pitch-m1-email">
              <span>Email ID <span class="required-mark">*</span></span>
            </label>
            <input
              id="pitch-m1-email"
              type="email"
              class="form-input"
              class:input-error={fieldErrors.m1Email}
              placeholder="maya.chen@example.edu"
              bind:value={member1.email}
              disabled={isSubmitting}
            />
            {#if fieldErrors.m1Email}
              <span class="field-error-msg">{fieldErrors.m1Email}</span>
            {/if}
          </div>
        </div>
      </div>

      <!-- SECTION: MEMBER 2 -->
      <div class="section-container">
        <div class="section-header">
          <h4 class="section-heading">TEAM MEMBER 2</h4>
          <span class="section-sub">Required Member</span>
        </div>

        <TeamMemberFields
          memberNumber={2}
          title="MEMBER 2"
          roleBadge="Mandatory"
          bind:name={member2.name}
          bind:admissionNumber={member2.admissionNumber}
          bind:email={member2.email}
          errors={{
            name: fieldErrors.m2Name,
            admissionNumber: fieldErrors.m2Admission,
            email: fieldErrors.m2Email
          }}
          disabled={isSubmitting}
        />
      </div>

      <!-- SUBMIT BUTTON -->
      <div class="submit-action">
        <button
          type="submit"
          class="submit-button"
          disabled={isSubmitting}
        >
          {#if isSubmitting}
            <span class="btn-spinner"></span>
            Registering...
          {:else}
            REGISTER FOR PITCH FEST
          {/if}
        </button>
      </div>
    </form>
  {/if}
</div>

<style>
  .form-content-inner {
    background: transparent;
    padding: 0;
  }

  .card-header {
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border-divider);
  }

  .indicator-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }

  .event-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--forest-800);
  }

  .event-type-label {
    font-size: 11px;
    font-weight: 700;
    color: var(--forest-800);
    letter-spacing: 0.05em;
  }

  .card-title {
    font-size: 19px;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 4px;
    letter-spacing: -0.01em;
  }

  .card-tagline {
    font-size: 13px;
    color: var(--text-muted);
  }

  /* Information Row for Team Size */
  .team-size-info-row {
    background: var(--light-green);
    border: 1px solid var(--border-card);
    border-radius: var(--radius-input);
    padding: 12px 14px;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .info-label-group {
    display: flex;
    flex-direction: column;
  }

  .info-title {
    font-size: 12px;
    font-weight: 700;
    color: var(--forest-800);
    letter-spacing: 0.02em;
  }

  .info-desc {
    font-size: 11px;
    color: var(--forest-700);
  }

  .size-pill {
    font-size: 12px;
    font-weight: 700;
    color: var(--forest-800);
    background: #ffffff;
    border: 1px solid var(--border-card);
    padding: 4px 10px;
    border-radius: var(--radius-badge);
    letter-spacing: 0.02em;
  }

  .section-container {
    margin-bottom: 20px;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--border-divider);
  }

  .section-heading {
    font-size: 13px;
    font-weight: 700;
    color: var(--forest-800);
    letter-spacing: 0.03em;
  }

  .section-sub {
    font-size: 12px;
    color: var(--text-muted);
  }

  .fields-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px 14px;
  }

  /* Submit Button */
  .submit-action {
    margin-top: 24px;
  }

  .submit-button {
    width: 100%;
    height: 44px;
    background: var(--action-green);
    color: #ffffff;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.03em;
    border: none;
    border-radius: var(--radius-btn);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: background 150ms ease;
  }

  .submit-button:hover:not(:disabled) {
    background: var(--action-green-hover);
  }

  .submit-button:disabled {
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

  @media (max-width: 640px) {
    .fields-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
