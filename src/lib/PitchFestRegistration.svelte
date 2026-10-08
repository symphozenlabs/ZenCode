<script>
  import RegistrationSuccess from './RegistrationSuccess.svelte';
  import { 
    COLLECTIONS, 
    checkDuplicateRegistration, 
    registerPitchFestTeam 
  } from './firebase.js';

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

  // UI status
  let isSubmitting = $state(false);
  let isSuccess = $state(false);
  let formError = $state('');
  let fieldErrors = $state({});

  // Email format validator
  function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test((email || '').trim());
  }

  // Validate form fields
  function validateForm() {
    const errors = {};
    let hasError = false;

    // Member 1 / Team Leader validation
    if (!member1.name.trim()) {
      errors.m1Name = 'Member 1 name is required.';
      hasError = true;
    }
    if (!member1.admissionNumber.trim()) {
      errors.m1Admission = 'Member 1 admission number is required.';
      hasError = true;
    }
    if (!member1.classSection.trim()) {
      errors.m1ClassSection = 'Class & Section is required.';
      hasError = true;
    }
    if (!member1.email.trim()) {
      errors.m1Email = 'Member 1 email is required.';
      hasError = true;
    } else if (!isValidEmail(member1.email)) {
      errors.m1Email = 'Please enter a valid email address.';
      hasError = true;
    }

    // Member 2 validation
    if (!member2.name.trim()) {
      errors.m2Name = 'Member 2 name is required.';
      hasError = true;
    }
    if (!member2.admissionNumber.trim()) {
      errors.m2Admission = 'Member 2 admission number is required.';
      hasError = true;
    }
    if (!member2.email.trim()) {
      errors.m2Email = 'Member 2 email is required.';
      hasError = true;
    } else if (!isValidEmail(member2.email)) {
      errors.m2Email = 'Please enter a valid email address.';
      hasError = true;
    }

    // Check internal team duplicates between Member 1 and Member 2
    if (
      member1.admissionNumber.trim() &&
      member2.admissionNumber.trim() &&
      member1.admissionNumber.trim().toUpperCase() === member2.admissionNumber.trim().toUpperCase()
    ) {
      errors.general = 'Member 1 and Member 2 cannot have the same admission number.';
      hasError = true;
    }

    if (
      member1.email.trim() &&
      member2.email.trim() &&
      member1.email.trim().toLowerCase() === member2.email.trim().toLowerCase()
    ) {
      errors.general = 'Member 1 and Member 2 cannot have the same email address.';
      hasError = true;
    }

    fieldErrors = errors;
    if (errors.general) {
      formError = errors.general;
    }
    return !hasError;
  }

  // Handle Form Submission
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

      // Check duplicate in Firestore for Pitch Fest
      const dupCheck = await checkDuplicateRegistration(
        COLLECTIONS.PITCH_FEST,
        'Pitch Fest',
        admissionNumbers,
        emails
      );

      if (dupCheck.isDuplicate) {
        formError = dupCheck.message || 'You are already registered for the Pitch Fest.';
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

<div class="registration-card pitchfest-card">
  <!-- Card Header -->
  <div class="card-header">
    <div class="event-badge pitch-badge">
      <span class="badge-dot pitch-dot"></span>
      Idea & Pitching
    </div>
    <h2 class="card-title">PITCH FEST REGISTRATION</h2>
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
    <form class="registration-form" onsubmit={handleSubmit} novalidate>
      {#if formError}
        <div class="alert-box alert-error" role="alert">
          <svg class="alert-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <div>{formError}</div>
        </div>
      {/if}

      <!-- Fixed Team Size Info Bar -->
      <div class="fixed-team-banner">
        <div class="banner-left">
          <span class="team-fixed-label">Fixed Team Size</span>
          <span class="team-fixed-val">Exactly 2 Members</span>
        </div>
        <span class="banner-pill">2 Members Required</span>
      </div>

      <!-- MEMBER 1 / TEAM LEADER -->
      <section class="member-box is-leader">
        <div class="member-header">
          <div class="member-title-wrap">
            <span class="member-number-badge">1</span>
            <h3 class="member-title">Member 1 / Team Leader</h3>
          </div>
          <span class="role-badge leader-badge">Team Leader</span>
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
              placeholder="e.g. Maya Chen"
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
              <span>Class & Section <span class="required-mark">*</span></span>
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
      </section>

      <!-- MEMBER 2 -->
      <section class="member-box">
        <div class="member-header">
          <div class="member-title-wrap">
            <span class="member-number-badge">2</span>
            <h3 class="member-title">Team Member 2</h3>
          </div>
          <span class="role-badge">Mandatory</span>
        </div>

        <div class="fields-grid">
          <!-- Name -->
          <div class="form-group">
            <label class="form-label" for="pitch-m2-name">
              <span>Name <span class="required-mark">*</span></span>
            </label>
            <input
              id="pitch-m2-name"
              type="text"
              class="form-input"
              class:input-error={fieldErrors.m2Name}
              placeholder="e.g. Daniel Lee"
              bind:value={member2.name}
              disabled={isSubmitting}
            />
            {#if fieldErrors.m2Name}
              <span class="field-error-msg">{fieldErrors.m2Name}</span>
            {/if}
          </div>

          <!-- Admission Number -->
          <div class="form-group">
            <label class="form-label" for="pitch-m2-adm">
              <span>Admission Number <span class="required-mark">*</span></span>
            </label>
            <input
              id="pitch-m2-adm"
              type="text"
              class="form-input"
              class:input-error={fieldErrors.m2Admission}
              placeholder="e.g. 23BITE088"
              bind:value={member2.admissionNumber}
              disabled={isSubmitting}
            />
            {#if fieldErrors.m2Admission}
              <span class="field-error-msg">{fieldErrors.m2Admission}</span>
            {/if}
          </div>

          <!-- Email ID -->
          <div class="form-group field-full">
            <label class="form-label" for="pitch-m2-email">
              <span>Email ID <span class="required-mark">*</span></span>
            </label>
            <input
              id="pitch-m2-email"
              type="email"
              class="form-input"
              class:input-error={fieldErrors.m2Email}
              placeholder="daniel.lee@example.edu"
              bind:value={member2.email}
              disabled={isSubmitting}
            />
            {#if fieldErrors.m2Email}
              <span class="field-error-msg">{fieldErrors.m2Email}</span>
            {/if}
          </div>
        </div>
      </section>

      <!-- SUBMIT BUTTON -->
      <div class="submit-action-wrap">
        <button
          type="submit"
          class="submit-button pitchfest-submit-btn"
          disabled={isSubmitting}
        >
          {#if isSubmitting}
            <span class="loading-spinner"></span>
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
  .registration-card {
    background: #ffffff;
    border-radius: var(--radius-xl);
    border: 1px solid var(--base-border);
    padding: 32px;
    box-shadow: 0 10px 30px -5px rgba(15, 23, 42, 0.05), 0 4px 6px -2px rgba(15, 23, 42, 0.02);
    display: flex;
    flex-direction: column;
    position: relative;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }

  .registration-card:hover {
    box-shadow: 0 16px 36px -6px rgba(244, 114, 182, 0.12), 0 4px 10px -2px rgba(15, 23, 42, 0.04);
  }

  .card-header {
    margin-bottom: 24px;
    padding-bottom: 18px;
    border-bottom: 1px solid var(--base-border-light);
  }

  .pitch-badge {
    color: #be185d;
    background: var(--accent-pink-light);
  }

  .pitch-dot {
    background-color: var(--accent-pink);
  }

  .card-title {
    font-size: 1.55rem;
    font-weight: 800;
    color: var(--text-primary);
    margin-bottom: 4px;
    letter-spacing: -0.01em;
  }

  .card-tagline {
    font-size: 0.96rem;
    font-weight: 500;
    color: var(--text-muted);
  }

  /* Fixed Team Size Banner */
  .fixed-team-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: linear-gradient(to right, #fff5f7, #fdf2f8);
    border: 1px solid #fce7f3;
    border-radius: var(--radius-md);
    padding: 14px 18px;
    margin-bottom: 22px;
  }

  .banner-left {
    display: flex;
    flex-direction: column;
  }

  .team-fixed-label {
    font-size: 0.76rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--support-mauve);
    font-weight: 600;
  }

  .team-fixed-val {
    font-size: 0.95rem;
    font-weight: 800;
    color: #9d174d;
  }

  .banner-pill {
    font-size: 0.78rem;
    font-weight: 700;
    color: #be185d;
    background: #ffffff;
    padding: 4px 10px;
    border-radius: var(--radius-full);
    border: 1px solid #fbcfe8;
  }

  .member-box {
    background: #ffffff;
    border: 1px solid var(--base-border);
    border-radius: var(--radius-md);
    padding: 20px;
    margin-bottom: 18px;
    transition: border-color 0.2s ease;
  }

  .member-box:hover {
    border-color: #cbd5e1;
  }

  .member-box.is-leader {
    background: linear-gradient(to bottom, #fffafc, #ffffff);
    border-left: 3.5px solid var(--accent-pink);
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
    background: var(--accent-pink-light);
    color: #be185d;
    font-size: 0.78rem;
    font-weight: 700;
  }

  .member-title {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text-primary);
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
    background: #fce7f3;
    color: #be185d;
  }

  .fields-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px 16px;
  }

  .field-full {
    grid-column: 1 / -1;
  }

  /* Submit Action */
  .submit-action-wrap {
    margin-top: 26px;
  }

  .submit-button {
    width: 100%;
    padding: 14px 20px;
    font-size: 0.95rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #ffffff;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    transition: all 0.2s ease;
  }

  .pitchfest-submit-btn {
    background: linear-gradient(135deg, var(--accent-coral), var(--accent-pink));
    box-shadow: 0 4px 14px rgba(251, 113, 133, 0.3);
  }

  .pitchfest-submit-btn:hover:not(:disabled) {
    background: linear-gradient(135deg, #f43f5e, #db2777);
    transform: translateY(-1px);
    box-shadow: 0 6px 18px rgba(244, 63, 94, 0.4);
  }

  .submit-button:active:not(:disabled) {
    transform: translateY(0);
  }

  .submit-button:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    box-shadow: none;
  }

  .loading-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #ffffff;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 640px) {
    .registration-card {
      padding: 22px 18px;
    }
    .fields-grid {
      grid-template-columns: 1fr;
    }
    .field-full {
      grid-column: 1 / -1;
    }
  }
</style>
