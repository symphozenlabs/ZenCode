<script>
  import TeamMemberFields from './TeamMemberFields.svelte';
  import RegistrationSuccess from './RegistrationSuccess.svelte';
  import {
    COLLECTIONS,
    checkDuplicateRegistration,
    registerHackathonTeam
  } from './firebase.js';

  // Team Leader details
  let teamLeader = $state({
    name: '',
    admissionNumber: '',
    yearOfStudy: '',
    email: ''
  });

  // Team size: 3 or 4
  let teamSize = $state(3);

  // Members 2, 3, 4
  let member2 = $state({
    name: '',
    admissionNumber: '',
    yearOfStudy: '',
    email: ''
  });

  let member3 = $state({
    name: '',
    admissionNumber: '',
    yearOfStudy: '',
    email: ''
  });

  let member4 = $state({
    name: '',
    admissionNumber: '',
    yearOfStudy: '',
    email: ''
  });

  // Submission & validation state
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

    // Team Leader validations
    if (!teamLeader.name.trim()) {
      errors.leaderName = 'Name is required.';
      hasError = true;
    }
    if (!teamLeader.admissionNumber.trim()) {
      errors.leaderAdmission = 'Admission Number is required.';
      hasError = true;
    }
    if (!teamLeader.yearOfStudy) {
      errors.leaderYearOfStudy = 'Please select Year of Study.';
      hasError = true;
    }
    if (!teamLeader.email.trim()) {
      errors.leaderEmail = 'Email ID is required.';
      hasError = true;
    } else if (!isValidEmail(teamLeader.email)) {
      errors.leaderEmail = 'Please enter a valid email address.';
      hasError = true;
    }

    // Member 2 validations
    if (!member2.name.trim()) {
      errors.m2Name = 'Member 2 name is required.';
      hasError = true;
    }
    if (!member2.admissionNumber.trim()) {
      errors.m2Admission = 'Member 2 admission number is required.';
      hasError = true;
    }
    if (!member2.yearOfStudy) {
      errors.m2YearOfStudy = 'Please select Year of Study.';
      hasError = true;
    }
    if (!member2.email.trim()) {
      errors.m2Email = 'Member 2 email is required.';
      hasError = true;
    } else if (!isValidEmail(member2.email)) {
      errors.m2Email = 'Please enter a valid email address.';
      hasError = true;
    }

    // Member 3 validations
    if (!member3.name.trim()) {
      errors.m3Name = 'Member 3 name is required.';
      hasError = true;
    }
    if (!member3.admissionNumber.trim()) {
      errors.m3Admission = 'Member 3 admission number is required.';
      hasError = true;
    }
    if (!member3.yearOfStudy) {
      errors.m3YearOfStudy = 'Please select Year of Study.';
      hasError = true;
    }
    if (!member3.email.trim()) {
      errors.m3Email = 'Member 3 email is required.';
      hasError = true;
    } else if (!isValidEmail(member3.email)) {
      errors.m3Email = 'Please enter a valid email address.';
      hasError = true;
    }

    // Member 4 validations (if teamSize === 4)
    if (teamSize === 4) {
      if (!member4.name.trim()) {
        errors.m4Name = 'Member 4 name is required for a 4-member team.';
        hasError = true;
      }
      if (!member4.admissionNumber.trim()) {
        errors.m4Admission = 'Member 4 admission number is required.';
        hasError = true;
      }
      if (!member4.yearOfStudy) {
        errors.m4YearOfStudy = 'Please select Year of Study.';
        hasError = true;
      }
      if (!member4.email.trim()) {
        errors.m4Email = 'Member 4 email is required.';
        hasError = true;
      } else if (!isValidEmail(member4.email)) {
        errors.m4Email = 'Please enter a valid email address.';
        hasError = true;
      }
    }

    // Check internal team duplicates
    const admissions = [
      teamLeader.admissionNumber.trim().toUpperCase(),
      member2.admissionNumber.trim().toUpperCase(),
      member3.admissionNumber.trim().toUpperCase(),
      ...(teamSize === 4 ? [member4.admissionNumber.trim().toUpperCase()] : [])
    ].filter(Boolean);

    const emails = [
      teamLeader.email.trim().toLowerCase(),
      member2.email.trim().toLowerCase(),
      member3.email.trim().toLowerCase(),
      ...(teamSize === 4 ? [member4.email.trim().toLowerCase()] : [])
    ].filter(Boolean);

    const admSet = new Set();
    for (const adm of admissions) {
      if (admSet.has(adm)) {
        formError = `Duplicate admission number (${adm}) found within the team. All team members must have unique admission numbers.`;
        hasError = true;
        break;
      }
      admSet.add(adm);
    }

    if (!formError) {
      const emailSet = new Set();
      for (const em of emails) {
        if (emailSet.has(em)) {
          formError = `Duplicate email (${em}) found within the team. All team members must have unique email addresses.`;
          hasError = true;
          break;
        }
        emailSet.add(em);
      }
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
      const membersList = [
        {
          memberNumber: 1,
          name: teamLeader.name,
          admissionNumber: teamLeader.admissionNumber,
          yearOfStudy: teamLeader.yearOfStudy,
          email: teamLeader.email
        },
        {
          memberNumber: 2,
          name: member2.name,
          admissionNumber: member2.admissionNumber,
          yearOfStudy: member2.yearOfStudy,
          email: member2.email
        },
        {
          memberNumber: 3,
          name: member3.name,
          admissionNumber: member3.admissionNumber,
          yearOfStudy: member3.yearOfStudy,
          email: member3.email
        }
      ];

      if (teamSize === 4) {
        membersList.push({
          memberNumber: 4,
          name: member4.name,
          admissionNumber: member4.admissionNumber,
          yearOfStudy: member4.yearOfStudy,
          email: member4.email
        });
      }

      const admissionNumbers = membersList.map(m => m.admissionNumber);
      const emails = membersList.map(m => m.email);

      // Check duplicates in Hackathon collection
      const dupCheck = await checkDuplicateRegistration(
        COLLECTIONS.HACKATHON,
        'Hackathon',
        admissionNumbers,
        emails
      );

      if (dupCheck.isDuplicate) {
        formError = dupCheck.message || 'This participant is already registered for this event.';
        isSubmitting = false;
        return;
      }

      // Save to Firestore
      await registerHackathonTeam({
        teamSize,
        teamLeader,
        members: membersList
      });

      isSuccess = true;
    } catch (err) {
      console.error('Hackathon registration failed:', err);
      formError = 'Registration failed. Please try again.';
    } finally {
      isSubmitting = false;
    }
  }

  // Reset form
  function handleReset() {
    teamLeader = { name: '', admissionNumber: '', yearOfStudy: '', email: '' };
    teamSize = 3;
    member2 = { name: '', admissionNumber: '', yearOfStudy: '', email: '' };
    member3 = { name: '', admissionNumber: '', yearOfStudy: '', email: '' };
    member4 = { name: '', admissionNumber: '', yearOfStudy: '', email: '' };
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
      <span class="event-type-label">HACKATHON TRACK</span>
    </div>
    <h3 class="card-title">HACKATHON REGISTRATION</h3>
    <p class="card-tagline">Build. Innovate. Compete.</p>
  </div>

  {#if isSuccess}
    <RegistrationSuccess
      eventTitle="Hackathon"
      teamSize={teamSize}
      leaderName={teamLeader.name}
      yearOfStudy={teamLeader.yearOfStudy}
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

      <!-- SECTION: TEAM LEADER DETAILS -->
      <div class="section-container">
        <div class="section-header">
          <h4 class="section-heading">TEAM LEADER DETAILS</h4>
          <span class="section-sub">Primary Contact</span>
        </div>

        <div class="fields-grid">
          <!-- Name -->
          <div class="form-group">
            <label class="form-label" for="hack-leader-name">
              <span>Name <span class="required-mark">*</span></span>
            </label>
            <input
              id="hack-leader-name"
              type="text"
              class="form-input"
              class:input-error={fieldErrors.leaderName}
              placeholder="Full Name"
              bind:value={teamLeader.name}
              disabled={isSubmitting}
            />
            {#if fieldErrors.leaderName}
              <span class="field-error-msg">{fieldErrors.leaderName}</span>
            {/if}
          </div>

          <!-- Admission Number -->
          <div class="form-group">
            <label class="form-label" for="hack-leader-adm">
              <span>Admission Number <span class="required-mark">*</span></span>
            </label>
            <input
              id="hack-leader-adm"
              type="text"
              class="form-input"
              class:input-error={fieldErrors.leaderAdmission}
              placeholder="e.g. 23BCSE101"
              bind:value={teamLeader.admissionNumber}
              disabled={isSubmitting}
            />
            {#if fieldErrors.leaderAdmission}
              <span class="field-error-msg">{fieldErrors.leaderAdmission}</span>
            {/if}
          </div>

          <!-- Year of Study -->
          <div class="form-group">
            <label class="form-label" for="hack-leader-year">
              <span>Year of Study <span class="required-mark">*</span></span>
            </label>
            <select
              id="hack-leader-year"
              class="form-input form-select"
              class:input-error={fieldErrors.leaderYearOfStudy}
              bind:value={teamLeader.yearOfStudy}
              disabled={isSubmitting}
            >
              <option value="" disabled selected>Select Year</option>
              <option value="PG 1st Year">PG 1st Year</option>
              <option value="PG 2nd Year">PG 2nd Year</option>
            </select>
            {#if fieldErrors.leaderYearOfStudy}
              <span class="field-error-msg">{fieldErrors.leaderYearOfStudy}</span>
            {/if}
          </div>

          <!-- Email ID -->
          <div class="form-group">
            <label class="form-label" for="hack-leader-email">
              <span>Email ID <span class="required-mark">*</span></span>
            </label>
            <input
              id="hack-leader-email"
              type="email"
              class="form-input"
              class:input-error={fieldErrors.leaderEmail}
              placeholder="student@example.edu"
              bind:value={teamLeader.email}
              disabled={isSubmitting}
            />
            {#if fieldErrors.leaderEmail}
              <span class="field-error-msg">{fieldErrors.leaderEmail}</span>
            {/if}
          </div>
        </div>
      </div>

      <!-- SECTION: TEAM SIZE -->
      <div class="team-size-container">
        <label class="team-size-label" for="hack-team-size-group">
          HOW MANY TEAM MEMBERS?
        </label>
        <div class="segmented-control" id="hack-team-size-group" role="radiogroup" aria-label="Team Size">
          <button
            type="button"
            class="segment-btn"
            class:selected={teamSize === 3}
            onclick={() => { teamSize = 3; }}
            disabled={isSubmitting}
          >
            3 MEMBERS
          </button>
          <button
            type="button"
            class="segment-btn"
            class:selected={teamSize === 4}
            onclick={() => { teamSize = 4; }}
            disabled={isSubmitting}
          >
            4 MEMBERS
          </button>
        </div>
      </div>

      <!-- SECTION: TEAM MEMBERS -->
      <div class="section-container">
        <div class="section-header">
          <h4 class="section-heading">TEAM MEMBERS</h4>
          <span class="section-sub">{teamSize} Members Total</span>
        </div>

        <!-- MEMBER 1: TEAM LEADER -->
        <TeamMemberFields
          memberNumber={1}
          title="MEMBER 1"
          roleBadge="TEAM LEADER"
          name={teamLeader.name}
          admissionNumber={teamLeader.admissionNumber}
          yearOfStudy={teamLeader.yearOfStudy}
          email={teamLeader.email}
          nameReadOnly={true}
          admissionReadOnly={true}
          yearReadOnly={true}
          emailReadOnly={true}
          disabled={isSubmitting}
        />

        <!-- MEMBER 2 -->
        <TeamMemberFields
          memberNumber={2}
          title="MEMBER 2"
          roleBadge="Required"
          bind:name={member2.name}
          bind:admissionNumber={member2.admissionNumber}
          bind:yearOfStudy={member2.yearOfStudy}
          bind:email={member2.email}
          errors={{
            name: fieldErrors.m2Name,
            admissionNumber: fieldErrors.m2Admission,
            yearOfStudy: fieldErrors.m2YearOfStudy,
            email: fieldErrors.m2Email
          }}
          disabled={isSubmitting}
        />

        <!-- MEMBER 3 -->
        <TeamMemberFields
          memberNumber={3}
          title="MEMBER 3"
          roleBadge="Required"
          bind:name={member3.name}
          bind:admissionNumber={member3.admissionNumber}
          bind:yearOfStudy={member3.yearOfStudy}
          bind:email={member3.email}
          errors={{
            name: fieldErrors.m3Name,
            admissionNumber: fieldErrors.m3Admission,
            yearOfStudy: fieldErrors.m3YearOfStudy,
            email: fieldErrors.m3Email
          }}
          disabled={isSubmitting}
        />

        <!-- MEMBER 4 (Only if teamSize === 4) -->
        {#if teamSize === 4}
          <TeamMemberFields
            memberNumber={4}
            title="MEMBER 4"
            roleBadge="Required (4th Member)"
            bind:name={member4.name}
            bind:admissionNumber={member4.admissionNumber}
            bind:yearOfStudy={member4.yearOfStudy}
            bind:email={member4.email}
            errors={{
              name: fieldErrors.m4Name,
              admissionNumber: fieldErrors.m4Admission,
              yearOfStudy: fieldErrors.m4YearOfStudy,
              email: fieldErrors.m4Email
            }}
            disabled={isSubmitting}
          />
        {/if}
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
            REGISTER FOR HACKATHON
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

  /* Segmented control for Team Size */
  .team-size-container {
    background: var(--light-green-subtle);
    border: 1px solid var(--border-card);
    border-radius: var(--radius-input);
    padding: 12px 14px;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
  }

  .team-size-label {
    font-size: 12px;
    font-weight: 700;
    color: var(--forest-800);
    letter-spacing: 0.02em;
  }

  .segmented-control {
    display: flex;
    gap: 6px;
  }

  .segment-btn {
    padding: 7px 14px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.02em;
    border-radius: var(--radius-input);
    border: 1px solid var(--border-card);
    background: #f0f3ee;
    color: var(--text-primary);
    cursor: pointer;
    transition: all 150ms ease;
  }

  .segment-btn.selected {
    background: var(--action-green);
    color: #ffffff;
    border-color: var(--action-green);
  }

  .segment-btn:hover:not(.selected) {
    background: #e6eae3;
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
    .team-size-container {
      flex-direction: column;
      align-items: stretch;
    }
    .segmented-control {
      width: 100%;
    }
    .segment-btn {
      flex: 1;
      text-align: center;
    }
  }
</style>
