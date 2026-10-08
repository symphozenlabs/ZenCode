<script>
  import TeamMemberFields from './TeamMemberFields.svelte';
  import RegistrationSuccess from './RegistrationSuccess.svelte';
  import {
    COLLECTIONS,
    checkDuplicateRegistration,
    registerHackathonTeam,
    registerPitchFestTeam
  } from './firebase.js';

  // Event selection state: 'hackathon' | 'pitchfest'
  let activeEvent = $state('hackathon');
  let slideDirection = $state('left'); // 'left' when selecting hackathon, 'right' when selecting pitchfest

  function selectEvent(event) {
    if (activeEvent === event) return;
    slideDirection = event === 'hackathon' ? 'left' : 'right';
    activeEvent = event;
  }

  // Helper to create an empty member
  function createMember(num) {
    return {
      memberNumber: num,
      name: '',
      admissionNumber: '',
      yearOfStudy: '',
      email: ''
    };
  }

  // ---------------- HACKATHON STATE (Min 3, Max 4) ----------------
  // Default to ONLY 1 team member as requested
  let hackathonMembers = $state([createMember(1)]);
  let hackathonSubmitting = $state(false);
  let hackathonSuccess = $state(false);
  let hackathonError = $state('');
  let hackathonFieldErrors = $state({});

  function addHackathonMember() {
    if (hackathonMembers.length < 4) {
      hackathonMembers = [
        ...hackathonMembers,
        createMember(hackathonMembers.length + 1)
      ];
      hackathonError = '';
    }
  }

  function removeHackathonMember(index) {
    if (hackathonMembers.length > 1) {
      hackathonMembers = hackathonMembers
        .filter((_, idx) => idx !== index)
        .map((m, idx) => ({ ...m, memberNumber: idx + 1 }));
    }
  }

  function resetHackathon() {
    hackathonMembers = [createMember(1)];
    hackathonSubmitting = false;
    hackathonSuccess = false;
    hackathonError = '';
    hackathonFieldErrors = {};
  }

  // ---------------- PITCH FEST STATE (Min 2, Max 2) ----------------
  // Default to ONLY 1 team member as requested
  let pitchfestMembers = $state([createMember(1)]);
  let pitchfestSubmitting = $state(false);
  let pitchfestSuccess = $state(false);
  let pitchfestError = $state('');
  let pitchfestFieldErrors = $state({});

  function addPitchFestMember() {
    if (pitchfestMembers.length < 2) {
      pitchfestMembers = [
        ...pitchfestMembers,
        createMember(pitchfestMembers.length + 1)
      ];
      pitchfestError = '';
    }
  }

  function removePitchFestMember(index) {
    if (pitchfestMembers.length > 1) {
      pitchfestMembers = pitchfestMembers
        .filter((_, idx) => idx !== index)
        .map((m, idx) => ({ ...m, memberNumber: idx + 1 }));
    }
  }

  function resetPitchFest() {
    pitchfestMembers = [createMember(1)];
    pitchfestSubmitting = false;
    pitchfestSuccess = false;
    pitchfestError = '';
    pitchfestFieldErrors = {};
  }

  // Email format validator
  function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test((email || '').trim());
  }

  // ---------------- SUBMIT HACKATHON ----------------
  async function handleHackathonSubmit(e) {
    e.preventDefault();
    hackathonError = '';
    const errors = {};
    let hasError = false;

    // Validate minimum team size (Min 3, Max 4)
    if (hackathonMembers.length < 3) {
      hackathonError = `Hackathon requires a minimum of 3 team members. Currently you have ${hackathonMembers.length}. Please click [+ Add Member] below to add at least ${3 - hackathonMembers.length} more member(s).`;
      return;
    }
    if (hackathonMembers.length > 4) {
      hackathonError = 'Hackathon allows a maximum of 4 team members.';
      return;
    }

    // Validate each member
    hackathonMembers.forEach((m, idx) => {
      const num = idx + 1;
      if (!m.name.trim()) {
        errors[`m${num}Name`] = `Member ${num} name is required.`;
        hasError = true;
      }
      if (!m.admissionNumber.trim()) {
        errors[`m${num}Adm`] = `Member ${num} admission number is required.`;
        hasError = true;
      }
      if (!m.yearOfStudy) {
        errors[`m${num}Year`] = `Please select Year of Study.`;
        hasError = true;
      }
      if (!m.email.trim()) {
        errors[`m${num}Email`] = `Member ${num} email is required.`;
        hasError = true;
      } else if (!isValidEmail(m.email)) {
        errors[`m${num}Email`] = 'Enter a valid email address.';
        hasError = true;
      }
    });

    // Internal duplicate checks
    const admissions = hackathonMembers.map(m => m.admissionNumber.trim().toUpperCase()).filter(Boolean);
    const emails = hackathonMembers.map(m => m.email.trim().toLowerCase()).filter(Boolean);

    const admSet = new Set();
    for (const adm of admissions) {
      if (admSet.has(adm)) {
        hackathonError = `Duplicate admission number (${adm}) found within the team. Every member must have a unique admission number.`;
        hasError = true;
        break;
      }
      admSet.add(adm);
    }

    const emailSet = new Set();
    for (const em of emails) {
      if (emailSet.has(em)) {
        hackathonError = `Duplicate email address (${em}) found within the team. Every member must have a unique email.`;
        hasError = true;
        break;
      }
      emailSet.add(em);
    }

    hackathonFieldErrors = errors;
    if (hasError) return;

    hackathonSubmitting = true;
    try {
      // Check duplicate against Firestore Hackathon collection
      const dupCheck = await checkDuplicateRegistration(
        COLLECTIONS.HACKATHON,
        'Hackathon',
        admissions,
        emails
      );

      if (dupCheck.isDuplicate) {
        hackathonError = dupCheck.message || 'You are already registered for the Hackathon.';
        hackathonSubmitting = false;
        return;
      }

      // Member 1 is Team Leader
      const leader = hackathonMembers[0];
      await registerHackathonTeam({
        teamSize: hackathonMembers.length,
        teamLeader: {
          name: leader.name,
          admissionNumber: leader.admissionNumber,
          yearOfStudy: leader.yearOfStudy,
          email: leader.email
        },
        members: hackathonMembers
      });

      hackathonSuccess = true;
    } catch (err) {
      console.error('Hackathon registration error:', err);
      hackathonError = 'Registration failed. Please try again.';
    } finally {
      hackathonSubmitting = false;
    }
  }

  // ---------------- SUBMIT PITCH FEST ----------------
  async function handlePitchFestSubmit(e) {
    e.preventDefault();
    pitchfestError = '';
    const errors = {};
    let hasError = false;

    // Validate team size (Exactly 2 members)
    if (pitchfestMembers.length !== 2) {
      pitchfestError = `Pitch Fest requires exactly 2 team members. Currently you have ${pitchfestMembers.length}. Please click [+ Add Member] below to add Member 2.`;
      return;
    }

    // Validate each member
    pitchfestMembers.forEach((m, idx) => {
      const num = idx + 1;
      if (!m.name.trim()) {
        errors[`m${num}Name`] = `Member ${num} name is required.`;
        hasError = true;
      }
      if (!m.admissionNumber.trim()) {
        errors[`m${num}Adm`] = `Member ${num} admission number is required.`;
        hasError = true;
      }
      if (!m.yearOfStudy) {
        errors[`m${num}Year`] = `Please select Year of Study.`;
        hasError = true;
      }
      if (!m.email.trim()) {
        errors[`m${num}Email`] = `Member ${num} email is required.`;
        hasError = true;
      } else if (!isValidEmail(m.email)) {
        errors[`m${num}Email`] = 'Enter a valid email address.';
        hasError = true;
      }
    });

    // Internal duplicate checks
    const admissions = pitchfestMembers.map(m => m.admissionNumber.trim().toUpperCase()).filter(Boolean);
    const emails = pitchfestMembers.map(m => m.email.trim().toLowerCase()).filter(Boolean);

    if (admissions[0] && admissions[1] && admissions[0] === admissions[1]) {
      pitchfestError = 'Member 1 and Member 2 cannot have the same admission number.';
      hasError = true;
    }

    if (emails[0] && emails[1] && emails[0] === emails[1]) {
      pitchfestError = 'Member 1 and Member 2 cannot have the same email address.';
      hasError = true;
    }

    pitchfestFieldErrors = errors;
    if (hasError) return;

    pitchfestSubmitting = true;
    try {
      // Check duplicate against Firestore Pitch Fest collection
      const dupCheck = await checkDuplicateRegistration(
        COLLECTIONS.PITCH_FEST,
        'Pitch Fest',
        admissions,
        emails
      );

      if (dupCheck.isDuplicate) {
        pitchfestError = dupCheck.message || 'You are already registered for the Pitch Fest.';
        pitchfestSubmitting = false;
        return;
      }

      // Member 1 is Team Leader
      const leader = pitchfestMembers[0];
      await registerPitchFestTeam({
        teamLeader: {
          name: leader.name,
          admissionNumber: leader.admissionNumber,
          yearOfStudy: leader.yearOfStudy,
          email: leader.email
        },
        members: pitchfestMembers
      });

      pitchfestSuccess = true;
    } catch (err) {
      console.error('Pitch Fest registration error:', err);
      pitchfestError = 'Registration failed. Please try again.';
    } finally {
      pitchfestSubmitting = false;
    }
  }
</script>

<div class="page-wrapper">
  <!-- Top Navigation / Branding Header -->
  <header class="top-navbar">
    <div class="nav-container">
      <div class="brand-group">
        <div class="brand-logo-mark">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="brand-svg">
            <polyline points="16 18 22 12 16 6"></polyline>
            <polyline points="8 6 2 12 8 18"></polyline>
          </svg>
        </div>
        <div class="brand-text">
          <span class="brand-title">ZEN CODE</span>
          <span class="brand-year">2026</span>
        </div>
      </div>

      <div class="nav-badges">
        <span class="pill-badge pill-hackathon">Hackathon</span>
        <span class="pill-divider">+</span>
        <span class="pill-badge pill-pitch">Pitch Fest</span>
      </div>
    </div>
  </header>

  <!-- Hero Header Section -->
  <section class="hero-section">
    <div class="hero-content">
      <div class="official-pill">
        <span class="pulse-dot"></span>
        Official Registration Portal
      </div>

      <h1 class="main-heading">ZEN CODE 2026</h1>
      <h2 class="sub-heading">Hackathon &amp; Pitch Fest</h2>

      <p class="hero-description">
        Register your team for ZEN CODE 2026. Select your event track below and enter your team details.
      </p>
    </div>
  </section>

  <!-- Event Selector Tabs -->
  <div class="event-selection-wrapper">
    <div class="event-tabs" role="tablist" aria-label="Choose Event">
      <button
        type="button"
        role="tab"
        aria-selected={activeEvent === 'hackathon'}
        class="event-tab-btn hackathon-tab"
        class:active={activeEvent === 'hackathon'}
        onclick={() => selectEvent('hackathon')}
      >
        <span class="tab-indicator-dot hack-dot"></span>
        <span class="tab-label">HACKATHON</span>
        <span class="tab-track-hint">3 - 4 Members</span>
      </button>

      <button
        type="button"
        role="tab"
        aria-selected={activeEvent === 'pitchfest'}
        class="event-tab-btn pitchfest-tab"
        class:active={activeEvent === 'pitchfest'}
        onclick={() => selectEvent('pitchfest')}
      >
        <span class="tab-indicator-dot pitch-dot"></span>
        <span class="tab-label">PITCH FEST</span>
        <span class="tab-track-hint">2 Members</span>
      </button>
    </div>
  </div>

  <!-- SINGLE REGISTRATION CONTAINER -->
  <main class="single-container-wrapper">
    <div class="registration-main-container">
      {#key activeEvent}
        <div
          class="animated-form-view"
          class:slide-from-left={slideDirection === 'left'}
          class:slide-from-right={slideDirection === 'right'}
        >
          <!-- ==================== HACKATHON FORM ==================== -->
          {#if activeEvent === 'hackathon'}
            {#if hackathonSuccess}
              <RegistrationSuccess
                eventTitle="Hackathon"
                teamSize={hackathonMembers.length}
                leaderName={hackathonMembers[0]?.name}
                onReset={resetHackathon}
              />
            {:else}
              <div class="form-content-inner">
                <!-- Header -->
                <div class="event-form-header hackathon-header">
                  <div class="event-pill-tag hack-tag">
                    <span class="tag-bullet"></span>
                    Hackathon Track
                  </div>
                  <h3 class="event-heading">HACKATHON REGISTRATION</h3>
                  <p class="event-tagline">Build. Innovate. Compete.</p>
                  <div class="event-rules-banner">
                    <span class="rules-icon">ℹ️</span>
                    <span>Team Size Rule: <strong>Minimum 3</strong>, <strong>Maximum 4</strong> members.</span>
                  </div>
                </div>

                {#if hackathonError}
                  <div class="alert-box alert-error" role="alert">
                    <svg class="alert-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="12"></line>
                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <div>{hackathonError}</div>
                  </div>
                {/if}

                <form onsubmit={handleHackathonSubmit} novalidate>
                  <!-- TEAM MEMBERS LIST -->
                  <div class="members-section">
                    <div class="members-section-head">
                      <h4 class="section-title">TEAM MEMBERS</h4>
                      <span class="member-counter-badge">
                        {hackathonMembers.length} / 4 Members (Min 3 required)
                      </span>
                    </div>

                    {#each hackathonMembers as member, index (member.memberNumber)}
                      <TeamMemberFields
                        memberNumber={index + 1}
                        title={index === 0 ? 'Team Member 1 (Team Leader)' : `Team Member ${index + 1}`}
                        roleBadge={index === 0 ? 'Team Leader' : 'Team Member'}
                        bind:name={member.name}
                        bind:admissionNumber={member.admissionNumber}
                        bind:yearOfStudy={member.yearOfStudy}
                        bind:email={member.email}
                        canRemove={index > 0}
                        onRemove={() => removeHackathonMember(index)}
                        errors={{
                          name: hackathonFieldErrors[`m${index + 1}Name`],
                          admissionNumber: hackathonFieldErrors[`m${index + 1}Adm`],
                          yearOfStudy: hackathonFieldErrors[`m${index + 1}Year`],
                          email: hackathonFieldErrors[`m${index + 1}Email`]
                        }}
                        disabled={hackathonSubmitting}
                      />
                    {/each}

                    <!-- ADD MEMBER CONTROL (Max 4 for Hackathon) -->
                    <div class="add-member-control-row">
                      {#if hackathonMembers.length < 4}
                        <button
                          type="button"
                          class="add-member-btn"
                          onclick={addHackathonMember}
                          disabled={hackathonSubmitting}
                        >
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                          </svg>
                          + Add Member
                        </button>
                        <span class="add-member-hint">
                          Click to add Member {hackathonMembers.length + 1} (Up to 4 members)
                        </span>
                      {:else}
                        <div class="max-reached-pill">
                          ✓ Maximum team size reached (4 Members)
                        </div>
                      {/if}
                    </div>
                  </div>

                  <!-- SUBMIT ACTION -->
                  <div class="submit-action-wrap">
                    <button
                      type="submit"
                      class="submit-button hackathon-submit-btn"
                      disabled={hackathonSubmitting}
                    >
                      {#if hackathonSubmitting}
                        <span class="loading-spinner"></span>
                        Registering...
                      {:else}
                        REGISTER FOR HACKATHON
                      {/if}
                    </button>
                  </div>
                </form>
              </div>
            {/if}

          <!-- ==================== PITCH FEST FORM ==================== -->
          {:else}
            {#if pitchfestSuccess}
              <RegistrationSuccess
                eventTitle="Pitch Fest"
                teamSize={pitchfestMembers.length}
                leaderName={pitchfestMembers[0]?.name}
                onReset={resetPitchFest}
              />
            {:else}
              <div class="form-content-inner">
                <!-- Header -->
                <div class="event-form-header pitchfest-header">
                  <div class="event-pill-tag pitch-tag">
                    <span class="tag-bullet pitch-bullet"></span>
                    Pitch Fest Track
                  </div>
                  <h3 class="event-heading">PITCH FEST REGISTRATION</h3>
                  <p class="event-tagline">Present your idea. Inspire the future.</p>
                  <div class="event-rules-banner pitch-rules-banner">
                    <span class="rules-icon">ℹ️</span>
                    <span>Team Size Rule: <strong>Exactly 2 members</strong> mandatory.</span>
                  </div>
                </div>

                {#if pitchfestError}
                  <div class="alert-box alert-error" role="alert">
                    <svg class="alert-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="12"></line>
                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <div>{pitchfestError}</div>
                  </div>
                {/if}

                <form onsubmit={handlePitchFestSubmit} novalidate>
                  <!-- TEAM MEMBERS LIST -->
                  <div class="members-section">
                    <div class="members-section-head">
                      <h4 class="section-title">TEAM MEMBERS</h4>
                      <span class="member-counter-badge pitch-counter-badge">
                        {pitchfestMembers.length} / 2 Members (Exactly 2 required)
                      </span>
                    </div>

                    {#each pitchfestMembers as member, index (member.memberNumber)}
                      <TeamMemberFields
                        memberNumber={index + 1}
                        title={index === 0 ? 'Team Member 1 (Team Leader)' : 'Team Member 2'}
                        roleBadge={index === 0 ? 'Team Leader' : 'Mandatory Member 2'}
                        bind:name={member.name}
                        bind:admissionNumber={member.admissionNumber}
                        bind:yearOfStudy={member.yearOfStudy}
                        bind:email={member.email}
                        canRemove={index > 0}
                        onRemove={() => removePitchFestMember(index)}
                        errors={{
                          name: pitchfestFieldErrors[`m${index + 1}Name`],
                          admissionNumber: pitchfestFieldErrors[`m${index + 1}Adm`],
                          yearOfStudy: pitchfestFieldErrors[`m${index + 1}Year`],
                          email: pitchfestFieldErrors[`m${index + 1}Email`]
                        }}
                        disabled={pitchfestSubmitting}
                      />
                    {/each}

                    <!-- ADD MEMBER CONTROL (Max 2 for Pitch Fest) -->
                    <div class="add-member-control-row">
                      {#if pitchfestMembers.length < 2}
                        <button
                          type="button"
                          class="add-member-btn pitch-add-btn"
                          onclick={addPitchFestMember}
                          disabled={pitchfestSubmitting}
                        >
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                          </svg>
                          + Add Member
                        </button>
                        <span class="add-member-hint">
                          Click to add Member 2 (Pitch Fest requires 2 members)
                        </span>
                      {:else}
                        <div class="max-reached-pill pitch-max-pill">
                          ✓ Team Complete (Exactly 2 Members)
                        </div>
                      {/if}
                    </div>
                  </div>

                  <!-- SUBMIT ACTION -->
                  <div class="submit-action-wrap">
                    <button
                      type="submit"
                      class="submit-button pitchfest-submit-btn"
                      disabled={pitchfestSubmitting}
                    >
                      {#if pitchfestSubmitting}
                        <span class="loading-spinner"></span>
                        Registering...
                      {:else}
                        REGISTER FOR PITCH FEST
                      {/if}
                    </button>
                  </div>
                </form>
              </div>
            {/if}
          {/if}
        </div>
      {/key}
    </div>
  </main>

  <!-- Footer -->
  <footer class="page-footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <strong>ZEN CODE 2026</strong> &bull; Innovation &bull; Code &bull; Leadership
      </div>
      <p class="footer-note">
        All submissions are recorded in the official event database. Please verify your team admission numbers, year of study, and institutional email addresses before registering.
      </p>
    </div>
  </footer>
</div>

<style>
  .page-wrapper {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  /* Navigation Bar */
  .top-navbar {
    width: 100%;
    background: rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--base-border);
    position: sticky;
    top: 0;
    z-index: 50;
  }

  .nav-container {
    max-width: 1240px;
    margin: 0 auto;
    padding: 14px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .brand-group {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .brand-logo-mark {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-md);
    background: linear-gradient(135deg, var(--primary-cyan), var(--primary-turquoise));
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ffffff;
    box-shadow: 0 4px 10px rgba(6, 182, 212, 0.28);
  }

  .brand-svg {
    width: 20px;
    height: 20px;
  }

  .brand-text {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  .brand-title {
    font-family: var(--font-heading);
    font-size: 1.25rem;
    font-weight: 800;
    color: var(--text-primary);
    letter-spacing: -0.02em;
  }

  .brand-year {
    font-family: var(--font-heading);
    font-size: 1.15rem;
    font-weight: 800;
    color: var(--primary-cyan-dark);
  }

  .nav-badges {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .pill-badge {
    font-size: 0.78rem;
    font-weight: 700;
    padding: 4px 12px;
    border-radius: var(--radius-full);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .pill-hackathon {
    background: var(--primary-cyan-light);
    color: var(--primary-cyan-dark);
    border: 1px solid var(--primary-cyan-border);
  }

  .pill-divider {
    color: var(--text-muted);
    font-weight: 600;
  }

  .pill-pitch {
    background: var(--accent-pink-light);
    color: #be185d;
    border: 1px solid #fbcfe8;
  }

  /* Hero Section */
  .hero-section {
    padding: 38px 24px 20px 24px;
    text-align: center;
  }

  .hero-content {
    max-width: 780px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .official-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--secondary-mint-dark);
    background: #ffffff;
    border: 1px solid var(--secondary-mint);
    padding: 5px 14px;
    border-radius: var(--radius-full);
    box-shadow: var(--shadow-sm);
    margin-bottom: 14px;
  }

  .pulse-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background-color: #10b981;
    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
  }

  .main-heading {
    font-size: clamp(2.2rem, 4.5vw, 3.2rem);
    font-weight: 900;
    line-height: 1.1;
    color: var(--text-primary);
    letter-spacing: -0.03em;
    margin-bottom: 6px;
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 70%, #0e7490 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .sub-heading {
    font-size: clamp(1.2rem, 2.5vw, 1.6rem);
    font-weight: 700;
    color: var(--primary-cyan-dark);
    letter-spacing: -0.02em;
    margin-bottom: 12px;
  }

  .hero-description {
    font-size: 1rem;
    color: var(--text-secondary);
    line-height: 1.55;
    max-width: 580px;
  }

  /* Event Selector Tabs (At the top of the registration container) */
  .event-selection-wrapper {
    max-width: 760px;
    width: 100%;
    margin: 0 auto 16px auto;
    padding: 0 24px;
    display: flex;
    justify-content: center;
  }

  .event-tabs {
    display: flex;
    background: #ffffff;
    padding: 6px;
    border-radius: var(--radius-xl);
    border: 1.5px solid var(--base-border);
    box-shadow: var(--shadow-sm);
    gap: 8px;
    width: 100%;
  }

  .event-tab-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    padding: 12px 18px;
    border: 1.5px solid transparent;
    border-radius: var(--radius-lg);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .tab-label {
    font-family: var(--font-heading);
    font-size: 1rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .tab-track-hint {
    font-size: 0.74rem;
    font-weight: 600;
  }

  .tab-indicator-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    margin-bottom: 2px;
    transition: all 0.2s ease;
  }

  .hack-dot {
    background: #cbd5e1;
  }
  .pitch-dot {
    background: #cbd5e1;
  }

  /* Active Tab: Hackathon */
  .hackathon-tab.active {
    background: linear-gradient(135deg, var(--primary-cyan-light), #ffffff);
    color: var(--primary-cyan-dark);
    border-color: var(--primary-cyan-border);
    box-shadow: 0 4px 12px rgba(6, 182, 212, 0.16);
  }
  .hackathon-tab.active .hack-dot {
    background: var(--primary-cyan);
    box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.25);
  }

  /* Active Tab: Pitch Fest */
  .pitchfest-tab.active {
    background: linear-gradient(135deg, var(--accent-pink-light), #ffffff);
    color: #be185d;
    border-color: #fbcfe8;
    box-shadow: 0 4px 12px rgba(244, 114, 182, 0.16);
  }
  .pitchfest-tab.active .pitch-dot {
    background: var(--accent-pink);
    box-shadow: 0 0 0 3px rgba(244, 114, 182, 0.25);
  }

  .event-tab-btn:hover:not(.active) {
    background: var(--base-bg-subtle);
    color: var(--text-secondary);
  }

  /* SINGLE REGISTRATION CONTAINER */
  .single-container-wrapper {
    max-width: 760px;
    width: 100%;
    margin: 0 auto;
    padding: 0 24px 64px 24px;
    flex: 1;
  }

  .registration-main-container {
    background: #ffffff;
    border-radius: var(--radius-xl);
    border: 1.5px solid var(--base-border);
    box-shadow: 0 12px 36px -6px rgba(15, 23, 42, 0.07), 0 4px 8px -2px rgba(15, 23, 42, 0.03);
    overflow: hidden; /* Contains the sliding animation smoothly */
    position: relative;
    min-height: 480px;
  }

  /* Horizontal Sliding Animations */
  .animated-form-view {
    padding: 36px 32px;
    width: 100%;
  }

  .animated-form-view.slide-from-left {
    animation: slideInLeft 0.36s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  .animated-form-view.slide-from-right {
    animation: slideInRight 0.36s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  @keyframes slideInLeft {
    0% {
      opacity: 0;
      transform: translateX(-55px);
    }
    100% {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes slideInRight {
    0% {
      opacity: 0;
      transform: translateX(55px);
    }
    100% {
      opacity: 1;
      transform: translateX(0);
    }
  }

  /* Form Header Styles */
  .event-form-header {
    margin-bottom: 24px;
    padding-bottom: 18px;
    border-bottom: 1px solid var(--base-border-light);
  }

  .event-pill-tag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.76rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 4px 10px;
    border-radius: var(--radius-full);
    margin-bottom: 10px;
  }

  .hack-tag {
    color: var(--primary-cyan-dark);
    background: var(--primary-cyan-light);
    border: 1px solid var(--primary-cyan-border);
  }

  .pitch-tag {
    color: #be185d;
    background: var(--accent-pink-light);
    border: 1px solid #fbcfe8;
  }

  .tag-bullet {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: var(--primary-cyan);
  }

  .pitch-bullet {
    background-color: var(--accent-pink);
  }

  .event-heading {
    font-size: 1.6rem;
    font-weight: 800;
    color: var(--text-primary);
    margin-bottom: 4px;
    letter-spacing: -0.01em;
  }

  .event-tagline {
    font-size: 0.96rem;
    font-weight: 500;
    color: var(--text-muted);
    margin-bottom: 14px;
  }

  .event-rules-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.86rem;
    color: var(--primary-cyan-dark);
    background: var(--primary-cyan-light);
    border: 1px solid var(--primary-cyan-border);
    padding: 8px 14px;
    border-radius: var(--radius-md);
  }

  .pitch-rules-banner {
    color: #be185d;
    background: var(--accent-pink-light);
    border-color: #fbcfe8;
  }

  .rules-icon {
    font-size: 0.95rem;
  }

  /* Members Section */
  .members-section {
    margin-bottom: 24px;
  }

  .members-section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .section-title {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text-secondary);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .member-counter-badge {
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--primary-cyan-dark);
    background: var(--primary-cyan-light);
    padding: 3px 10px;
    border-radius: var(--radius-full);
  }

  .pitch-counter-badge {
    color: #be185d;
    background: var(--accent-pink-light);
  }

  /* Add Member Row */
  .add-member-control-row {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: 10px;
    padding: 12px 16px;
    background: var(--base-bg-subtle);
    border: 1.5px dashed var(--base-border);
    border-radius: var(--radius-md);
  }

  .add-member-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 9px 16px;
    font-size: 0.88rem;
    font-weight: 700;
    color: #ffffff;
    background: linear-gradient(135deg, var(--primary-cyan), var(--primary-cyan-hover));
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(6, 182, 212, 0.25);
    transition: all 0.2s ease;
  }

  .add-member-btn:hover:not(:disabled) {
    background: linear-gradient(135deg, var(--primary-cyan-hover), var(--primary-cyan-dark));
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(6, 182, 212, 0.35);
  }

  .pitch-add-btn {
    background: linear-gradient(135deg, var(--accent-coral), var(--accent-pink));
    box-shadow: 0 2px 8px rgba(251, 113, 133, 0.25);
  }

  .pitch-add-btn:hover:not(:disabled) {
    background: linear-gradient(135deg, #f43f5e, #db2777);
    box-shadow: 0 4px 12px rgba(244, 63, 94, 0.35);
  }

  .add-member-hint {
    font-size: 0.82rem;
    color: var(--text-muted);
  }

  .max-reached-pill {
    font-size: 0.84rem;
    font-weight: 700;
    color: var(--secondary-mint-dark);
    background: var(--secondary-mint);
    padding: 6px 14px;
    border-radius: var(--radius-full);
  }

  .pitch-max-pill {
    color: #be185d;
    background: var(--accent-pink-light);
    border: 1px solid #fbcfe8;
  }

  /* Submit Action */
  .submit-action-wrap {
    margin-top: 28px;
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

  /* Footer */
  .page-footer {
    background: #ffffff;
    border-top: 1px solid var(--base-border);
    padding: 32px 24px;
    margin-top: auto;
  }

  .footer-inner {
    max-width: 1240px;
    margin: 0 auto;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .footer-brand {
    font-size: 0.92rem;
    color: var(--text-secondary);
    letter-spacing: 0.02em;
  }

  .footer-note {
    font-size: 0.82rem;
    color: var(--text-muted);
    max-width: 640px;
    line-height: 1.5;
  }

  /* Responsive Breakpoints */
  @media (max-width: 640px) {
    .hero-section {
      padding: 28px 16px 16px 16px;
    }
    .event-selection-wrapper,
    .single-container-wrapper {
      padding-left: 14px;
      padding-right: 14px;
    }
    .animated-form-view {
      padding: 24px 16px;
    }
    .add-member-control-row {
      flex-direction: column;
      align-items: stretch;
      text-align: center;
    }
    .add-member-btn {
      width: 100%;
      justify-content: center;
    }
    .event-tab-btn {
      padding: 10px 8px;
    }
    .tab-label {
      font-size: 0.88rem;
    }
    .tab-track-hint {
      font-size: 0.7rem;
    }
  }
</style>
