<script>
  import TeamMemberFields from './TeamMemberFields.svelte';
  import RegistrationSuccess from './RegistrationSuccess.svelte';
  import { 
    COLLECTIONS, 
    checkDuplicateRegistration, 
    registerHackathonTeam 
  } from './firebase.js';

  // State
  let teamLeader = $state({
    name: '',
    admissionNumber: '',
    classSection: ''
  });

  let teamSize = $state(3); // 3 or 4

  // Member 1 email (name and admission are synced with teamLeader)
  let member1Email = $state('');

  let member2 = $state({
    name: '',
    admissionNumber: '',
    email: ''
  });

  let member3 = $state({
    name: '',
    admissionNumber: '',
    email: ''
  });

  let member4 = $state({
    name: '',
    admissionNumber: '',
    email: ''
  });

  // UI status
  let isSubmitting = $state(false);
  let isSuccess = $state(false);
  let formError = $state('');
  let fieldErrors = $state({});

  // Sync Member 1 fields automatically from Team Leader
  let member1Name = $derived(teamLeader.name);
  let member1Admission = $derived(teamLeader.admissionNumber);

  // Email format validator
  function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test((email || '').trim());
  }

  // Validate the entire form
  function validateForm() {
    const errors = {};
    let hasError = false;

    // 1. Team Leader details
    if (!teamLeader.name.trim()) {
      errors.leaderName = 'Team Leader name is required.';
      hasError = true;
    }
    if (!teamLeader.admissionNumber.trim()) {
      errors.leaderAdmission = 'Team Leader admission number is required.';
      hasError = true;
    }
    if (!teamLeader.classSection.trim()) {
      errors.leaderClassSection = 'Class & Section is required.';
      hasError = true;
    }

    // 2. Member 1 Email
    if (!member1Email.trim()) {
      errors.m1Email = 'Team Leader email is required.';
      hasError = true;
    } else if (!isValidEmail(member1Email)) {
      errors.m1Email = 'Please enter a valid email address.';
      hasError = true;
    }

    // 3. Member 2 details
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

    // 4. Member 3 details
    if (!member3.name.trim()) {
      errors.m3Name = 'Member 3 name is required.';
      hasError = true;
    }
    if (!member3.admissionNumber.trim()) {
      errors.m3Admission = 'Member 3 admission number is required.';
      hasError = true;
    }
    if (!member3.email.trim()) {
      errors.m3Email = 'Member 3 email is required.';
      hasError = true;
    } else if (!isValidEmail(member3.email)) {
      errors.m3Email = 'Please enter a valid email address.';
      hasError = true;
    }

    // 5. Member 4 details (only if teamSize === 4)
    if (teamSize === 4) {
      if (!member4.name.trim()) {
        errors.m4Name = 'Member 4 name is required when team size is 4.';
        hasError = true;
      }
      if (!member4.admissionNumber.trim()) {
        errors.m4Admission = 'Member 4 admission number is required.';
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

    // 6. Check internal team duplicates
    const currentAdmissions = [
      teamLeader.admissionNumber.trim().toUpperCase(),
      member2.admissionNumber.trim().toUpperCase(),
      member3.admissionNumber.trim().toUpperCase(),
      ...(teamSize === 4 ? [member4.admissionNumber.trim().toUpperCase()] : [])
    ].filter(Boolean);

    const currentEmails = [
      member1Email.trim().toLowerCase(),
      member2.email.trim().toLowerCase(),
      member3.email.trim().toLowerCase(),
      ...(teamSize === 4 ? [member4.email.trim().toLowerCase()] : [])
    ].filter(Boolean);

    const admSet = new Set();
    for (const adm of currentAdmissions) {
      if (admSet.has(adm)) {
        errors.general = `Duplicate admission number (${adm}) found within the team. All team members must have unique admission numbers.`;
        hasError = true;
        break;
      }
      admSet.add(adm);
    }

    const emailSet = new Set();
    for (const em of currentEmails) {
      if (emailSet.has(em)) {
        errors.general = `Duplicate email address (${em}) found within the team. All team members must have unique emails.`;
        hasError = true;
        break;
      }
      emailSet.add(em);
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
      // Collect members list
      const membersList = [
        {
          memberNumber: 1,
          name: teamLeader.name,
          admissionNumber: teamLeader.admissionNumber,
          email: member1Email
        },
        {
          memberNumber: 2,
          name: member2.name,
          admissionNumber: member2.admissionNumber,
          email: member2.email
        },
        {
          memberNumber: 3,
          name: member3.name,
          admissionNumber: member3.admissionNumber,
          email: member3.email
        }
      ];

      if (teamSize === 4) {
        membersList.push({
          memberNumber: 4,
          name: member4.name,
          admissionNumber: member4.admissionNumber,
          email: member4.email
        });
      }

      const admissionNumbers = membersList.map(m => m.admissionNumber);
      const emails = membersList.map(m => m.email);

      // Check duplicate in Firestore for Hackathon
      const dupCheck = await checkDuplicateRegistration(
        COLLECTIONS.HACKATHON,
        'Hackathon',
        admissionNumbers,
        emails
      );

      if (dupCheck.isDuplicate) {
        formError = dupCheck.message || 'You are already registered for the Hackathon.';
        isSubmitting = false;
        return;
      }

      // Save to Firestore
      await registerHackathonTeam({
        teamSize,
        teamLeader: {
          name: teamLeader.name,
          admissionNumber: teamLeader.admissionNumber,
          classSection: teamLeader.classSection,
          email: member1Email
        },
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

  // Reset form to pristine state
  function handleReset() {
    teamLeader = {
      name: '',
      admissionNumber: '',
      classSection: ''
    };
    teamSize = 3;
    member1Email = '';
    member2 = { name: '', admissionNumber: '', email: '' };
    member3 = { name: '', admissionNumber: '', email: '' };
    member4 = { name: '', admissionNumber: '', email: '' };
    fieldErrors = {};
    formError = '';
    isSuccess = false;
  }
</script>

<div class="registration-card hackathon-card">
  <!-- Card Header -->
  <div class="card-header">
    <div class="event-badge">
      <span class="badge-dot"></span>
      Coding & Innovation
    </div>
    <h2 class="card-title">HACKATHON REGISTRATION</h2>
    <p class="card-tagline">Build. Innovate. Compete.</p>
  </div>

  {#if isSuccess}
    <RegistrationSuccess
      eventTitle="Hackathon"
      teamSize={teamSize}
      leaderName={teamLeader.name}
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

      <!-- SECTION: TEAM LEADER DETAILS -->
      <section class="form-section">
        <div class="section-title-wrap">
          <h3 class="section-title">TEAM LEADER DETAILS</h3>
          <span class="section-note">Primary Contact</span>
        </div>

        <div class="form-grid">
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
              placeholder="e.g. Alex Johnson"
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

          <!-- Class and Section -->
          <div class="form-group grid-full">
            <label class="form-label" for="hack-leader-class">
              <span>Class and Section <span class="required-mark">*</span></span>
            </label>
            <input
              id="hack-leader-class"
              type="text"
              class="form-input"
              class:input-error={fieldErrors.leaderClassSection}
              placeholder="e.g. CSE - Section B / 3rd Year"
              bind:value={teamLeader.classSection}
              disabled={isSubmitting}
            />
            {#if fieldErrors.leaderClassSection}
              <span class="field-error-msg">{fieldErrors.leaderClassSection}</span>
            {/if}
          </div>
        </div>
      </section>

      <!-- SECTION: HOW MANY TEAM MEMBERS? -->
      <section class="form-section team-size-section">
        <div class="team-size-header">
          <div>
            <label class="form-label text-bold" for="hack-team-size">
              HOW MANY TEAM MEMBERS?
            </label>
            <span class="team-size-hint">Min 3 members, Max 4 members</span>
          </div>

          <!-- Clean Member Count Selector -->
          <div class="size-selector-toggle" role="radiogroup" aria-label="Team Size">
            <button
              type="button"
              class="toggle-btn"
              class:active={teamSize === 3}
              onclick={() => { teamSize = 3; }}
              disabled={isSubmitting}
            >
              3 Members
            </button>
            <button
              type="button"
              class="toggle-btn"
              class:active={teamSize === 4}
              onclick={() => { teamSize = 4; }}
              disabled={isSubmitting}
            >
              4 Members
            </button>
          </div>
        </div>
      </section>

      <!-- SECTION: HACKATHON TEAM MEMBERS -->
      <section class="form-section">
        <div class="section-title-wrap">
          <h3 class="section-title">TEAM MEMBERS</h3>
          <span class="section-note">
            {teamSize === 3 ? '3 Members Total' : '4 Members Total'}
          </span>
        </div>

        <!-- TEAM MEMBER 1 (Team Leader) -->
        <TeamMemberFields
          memberNumber={1}
          title="Team Member 1"
          roleBadge="Team Leader"
          name={member1Name}
          admissionNumber={member1Admission}
          bind:email={member1Email}
          nameReadOnly={true}
          admissionReadOnly={true}
          errors={{ email: fieldErrors.m1Email }}
          disabled={isSubmitting}
        />

        <!-- TEAM MEMBER 2 -->
        <TeamMemberFields
          memberNumber={2}
          title="Team Member 2"
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

        <!-- TEAM MEMBER 3 -->
        <TeamMemberFields
          memberNumber={3}
          title="Team Member 3"
          roleBadge="Mandatory"
          bind:name={member3.name}
          bind:admissionNumber={member3.admissionNumber}
          bind:email={member3.email}
          errors={{
            name: fieldErrors.m3Name,
            admissionNumber: fieldErrors.m3Admission,
            email: fieldErrors.m3Email
          }}
          disabled={isSubmitting}
        />

        <!-- TEAM MEMBER 4 (Only when teamSize === 4) -->
        {#if teamSize === 4}
          <div class="member-4-container">
            <TeamMemberFields
              memberNumber={4}
              title="Team Member 4"
              roleBadge="Required (4-Member Team)"
              isOptional={false}
              bind:name={member4.name}
              bind:admissionNumber={member4.admissionNumber}
              bind:email={member4.email}
              errors={{
                name: fieldErrors.m4Name,
                admissionNumber: fieldErrors.m4Admission,
                email: fieldErrors.m4Email
              }}
              disabled={isSubmitting}
            />
          </div>
        {/if}
      </section>

      <!-- SUBMIT BUTTON -->
      <div class="submit-action-wrap">
        <button
          type="submit"
          class="submit-button hackathon-submit-btn"
          disabled={isSubmitting}
        >
          {#if isSubmitting}
            <span class="loading-spinner"></span>
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
    box-shadow: 0 16px 36px -6px rgba(6, 182, 212, 0.1), 0 4px 10px -2px rgba(15, 23, 42, 0.04);
  }

  .card-header {
    margin-bottom: 24px;
    padding-bottom: 18px;
    border-bottom: 1px solid var(--base-border-light);
  }

  .event-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.76rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--primary-cyan-dark);
    background: var(--primary-cyan-light);
    padding: 4px 10px;
    border-radius: var(--radius-full);
    margin-bottom: 10px;
  }

  .badge-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: var(--primary-cyan);
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

  .form-section {
    margin-bottom: 22px;
  }

  .section-title-wrap {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }

  .section-title {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text-secondary);
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .section-note {
    font-size: 0.78rem;
    color: var(--text-muted);
    font-weight: 500;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px 16px;
  }

  .grid-full {
    grid-column: 1 / -1;
  }

  /* Team Size Selector */
  .team-size-section {
    background: var(--base-bg-subtle);
    border: 1px solid var(--base-border);
    border-radius: var(--radius-md);
    padding: 16px 20px;
  }

  .team-size-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
  }

  .text-bold {
    font-weight: 700;
    font-size: 0.88rem;
    color: var(--text-primary);
  }

  .team-size-hint {
    display: block;
    font-size: 0.76rem;
    color: var(--text-muted);
  }

  .size-selector-toggle {
    display: flex;
    background: #e2e8f0;
    padding: 3px;
    border-radius: var(--radius-md);
    gap: 2px;
  }

  .toggle-btn {
    border: none;
    background: transparent;
    padding: 6px 14px;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--text-muted);
    border-radius: calc(var(--radius-md) - 2px);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .toggle-btn.active {
    background: #ffffff;
    color: var(--primary-cyan-dark);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .member-4-container {
    animation: fadeIn 0.25s ease;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
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

  .hackathon-submit-btn {
    background: linear-gradient(135deg, var(--primary-cyan), var(--primary-cyan-hover));
    box-shadow: 0 4px 14px rgba(6, 182, 212, 0.32);
  }

  .hackathon-submit-btn:hover:not(:disabled) {
    background: linear-gradient(135deg, var(--primary-cyan-hover), var(--primary-cyan-dark));
    transform: translateY(-1px);
    box-shadow: 0 6px 18px rgba(6, 182, 212, 0.42);
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
    .form-grid {
      grid-template-columns: 1fr;
    }
    .team-size-header {
      flex-direction: column;
      align-items: flex-start;
    }
    .size-selector-toggle {
      width: 100%;
    }
    .toggle-btn {
      flex: 1;
      text-align: center;
    }
  }
</style>
