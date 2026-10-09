<script>
  import { tick } from 'svelte';
  import { slide, fade } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import TeamMemberFields from './TeamMemberFields.svelte';
  import RegistrationSuccess from './RegistrationSuccess.svelte';
  import ConfirmRegistrationDialog from './ConfirmRegistrationDialog.svelte';
  import { checkDuplicateRegistration } from './firebase.js';
  import { motionMs, scrollIntoViewSmooth } from './motion.js';
  import { ADMISSION_HINT, isValidAdmission, normalizeAdmission, yearFromAdmission } from './admission.js';

  let {
    eventName,
    collectionName,
    register,
    minMembers,
    maxMembers,
    idPrefix,
    submitLabel,
    admissionPlaceholder = 'e.g. 25CAPMCA001',
    /** Pitch Fest teams don't have a team name. */
    askTeamName = true
  } = $props();

  let nextKey = 0;
  function emptyMember() {
    return { key: nextKey++, name: '', admissionNumber: '', email: '', mobile: '', open: true };
  }

  // Member 1 is always the team leader; the form starts with the mandatory members.
  // svelte-ignore state_referenced_locally
  let members = $state(Array.from({ length: minMembers }, emptyMember));

  let teamName = $state('');
  let teamNameError = $state('');

  let isSubmitting = $state(false);
  let isSuccess = $state(false);
  let submittedSize = $state(0);
  let submittedLeader = $state({ name: '', yearOfStudy: '', teamName: '' });
  let formError = $state('');
  /** Field errors per member, indexed like `members`. */
  let fieldErrors = $state([]);

  let formEl = $state();
  let alertEl = $state();

  const canAdd = $derived(members.length < maxMembers);

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());
  }

  /** Indian mobile number as 10 digits, or '' if it isn't one (accepts +91 / 0 prefixes and spacing). */
  function normalizeMobile(value) {
    let digits = (value || '').replace(/[\s()-]/g, '');
    if (digits.startsWith('+91')) digits = digits.slice(3);
    else if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
    else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
    return /^[6-9]\d{9}$/.test(digits) ? digits : '';
  }

  function isComplete(m, index) {
    return Boolean(
      m.name.trim() &&
        isValidAdmission(m.admissionNumber) &&
        isValidEmail(m.email) &&
        (index !== 0 || normalizeMobile(m.mobile))
    );
  }

  function roleFor(index) {
    if (index === 0) return 'Team Leader';
    return index < minMembers ? 'Required' : 'Optional';
  }

  async function addMember() {
    if (!canAdd) return;
    // Fold away members that are already filled in so the new card gets the focus.
    members.forEach((m, i) => {
      if (isComplete(m, i)) m.open = false;
    });
    members.push(emptyMember());
    fieldErrors = [];
    await tick();
    const id = `${idPrefix}-m${members.length}-name`;
    const input = document.getElementById(id);
    if (input) {
      scrollIntoViewSmooth(input.closest('.member-block'), 'center');
      input.focus({ preventScroll: true });
    }
  }

  function removeMember(index) {
    if (index < minMembers) return;
    members.splice(index, 1);
    fieldErrors = [];
    formError = '';
  }

  function validateForm() {
    let hasError = false;

    const trimmedTeamName = teamName.trim();
    teamNameError = !askTeamName
      ? ''
      : !trimmedTeamName
      ? 'Team name is required.'
      : trimmedTeamName.length < 2
        ? 'Team name must be at least 2 characters.'
        : trimmedTeamName.length > 35
          ? 'Team name must be 35 characters or fewer.'
          : '';
    if (teamNameError) hasError = true;

    const errors = members.map((m, i) => {
      const label = i === 0 ? 'Team leader' : `Member ${i + 1}`;
      const e = {};
      if (!m.name.trim()) e.name = `${label} name is required.`;
      if (!m.admissionNumber.trim()) e.admissionNumber = 'Admission number is required.';
      else if (!isValidAdmission(m.admissionNumber)) e.admissionNumber = ADMISSION_HINT;
      if (!m.email.trim()) e.email = 'Email ID is required.';
      else if (!isValidEmail(m.email)) e.email = 'Please enter a valid email address.';
      if (i === 0) {
        if (!m.mobile.trim()) e.mobile = 'Mobile number is required.';
        else if (!normalizeMobile(m.mobile)) e.mobile = 'Enter a valid 10-digit mobile number.';
      }
      if (Object.keys(e).length) hasError = true;
      return e;
    });

    // All members of a team must be distinct people.
    const seenAdm = new Map();
    const seenEmail = new Map();
    members.forEach((m, i) => {
      const adm = m.admissionNumber.trim().toUpperCase();
      if (adm) {
        if (seenAdm.has(adm) && !errors[i].admissionNumber) {
          errors[i].admissionNumber = `Same admission number as member ${seenAdm.get(adm) + 1}.`;
          hasError = true;
        } else seenAdm.set(adm, i);
      }
      const em = m.email.trim().toLowerCase();
      if (em) {
        if (seenEmail.has(em) && !errors[i].email) {
          errors[i].email = `Same email as member ${seenEmail.get(em) + 1}.`;
          hasError = true;
        } else seenEmail.set(em, i);
      }
    });

    fieldErrors = errors;
    // Expand every card that has something to fix.
    errors.forEach((e, i) => {
      if (Object.keys(e).length) members[i].open = true;
    });
    return !hasError;
  }

  async function revealProblem() {
    await tick();
    const target = formError ? alertEl : formEl?.querySelector('.input-error');
    if (target) {
      scrollIntoViewSmooth(target, 'center');
      if (target instanceof HTMLElement && target !== alertEl) target.focus({ preventScroll: true });
    }
  }

  function toPayloadMember(m, index) {
    return {
      memberNumber: index + 1,
      name: m.name,
      admissionNumber: normalizeAdmission(m.admissionNumber),
      yearOfStudy: yearFromAdmission(m.admissionNumber),
      email: m.email
    };
  }

  /** Team details awaiting confirmation in the popup; null when it's closed. */
  let pending = $state(null);
  let isChecking = $state(false);

  // Step 1: validate and check for duplicates, then ask the team to confirm.
  async function handleSubmit(e) {
    e.preventDefault();
    formError = '';

    if (!validateForm()) {
      revealProblem();
      return;
    }

    const membersList = members.map(toPayloadMember);
    const { memberNumber, ...leaderDetails } = membersList[0];

    isChecking = true;
    try {
      const dupCheck = await checkDuplicateRegistration(
        collectionName,
        eventName,
        membersList.map((m) => m.admissionNumber.trim()),
        membersList.map((m) => m.email.trim())
      );
      if (dupCheck.isDuplicate) {
        formError = dupCheck.message || 'This participant is already registered for this event.';
        revealProblem();
        return;
      }
    } catch (err) {
      console.error(`${eventName} duplicate check failed:`, err);
      formError = 'Could not verify your registration. Check your connection and try again.';
      revealProblem();
      return;
    } finally {
      isChecking = false;
    }

    pending = {
      teamName: askTeamName ? teamName.trim().replace(/\s+/g, ' ') : '',
      teamLeader: { ...leaderDetails, mobileNumber: normalizeMobile(members[0].mobile) },
      members: membersList
    };
  }

  // Step 2: the team confirmed the details in the popup — save and send passes.
  async function confirmRegistration() {
    if (!pending || isSubmitting) return;
    isSubmitting = true;
    const { teamName: cleanTeamName, teamLeader, members: membersList } = pending;

    try {
      const docId = await register({
        teamName: cleanTeamName,
        teamSize: membersList.length,
        teamLeader,
        members: membersList
      });

      // Trigger server-side QR generation & email dispatch via Resend.
      // The server reads the team from Firestore, so only the IDs are sent.
      try {
        const response = await fetch('/api/registration/send-confirmation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ collectionName, teamId: docId })
        });

        if (!response.ok) {
          const resJson = await response.json().catch(() => ({}));
          console.error(`[${eventName} Registration] Email dispatch error:`, resJson.error);
        } else {
          console.log(`[${eventName} Registration] Confirmation emails dispatched successfully.`);
        }
      } catch (emailErr) {
        console.error(`[${eventName} Registration] Confirmation email request failed:`, emailErr);
      }

      submittedSize = membersList.length;
      submittedLeader = { name: teamLeader.name, yearOfStudy: teamLeader.yearOfStudy, teamName: cleanTeamName };
      pending = null;
      isSuccess = true;
      await tick();
      scrollIntoViewSmooth(formEl?.parentElement ?? null, 'start');
    } catch (err) {
      console.error(`${eventName} registration failed:`, err);
      pending = null;
      formError = 'Registration failed. Please try again.';
      revealProblem();
    } finally {
      isSubmitting = false;
    }
  }

  function handleReset() {
    members = Array.from({ length: minMembers }, emptyMember);
    teamName = '';
    teamNameError = '';
    fieldErrors = [];
    formError = '';
    isSuccess = false;
  }
</script>

<div bind:this={formEl}>
  {#if isSuccess}
    <div in:fade={{ duration: motionMs(300) }}>
      <RegistrationSuccess
        eventTitle={eventName}
        teamName={submittedLeader.teamName}
        teamSize={submittedSize}
        leaderName={submittedLeader.name}
        yearOfStudy={submittedLeader.yearOfStudy}
        onReset={handleReset}
      />
    </div>
  {:else}
    <form onsubmit={handleSubmit} novalidate in:fade={{ duration: motionMs(250) }}>
      {#if formError}
        <div
          bind:this={alertEl}
          class="alert-box alert-error"
          role="alert"
          aria-live="polite"
          transition:slide={{ duration: motionMs(220), easing: cubicOut }}
        >
          <svg class="alert-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <div>{formError}</div>
        </div>
      {/if}

      {#if askTeamName}
      <div class="team-details">
        <div class="form-group">
          <label class="form-label" for={`${idPrefix}-team-name`}>
            <span>Team Name <span class="required-mark">*</span></span>
          </label>
          <input
            id={`${idPrefix}-team-name`}
            type="text"
            class="form-input"
            class:input-error={teamNameError}
            placeholder="e.g. Code Crusaders"
            autocomplete="off"
            maxlength="35"
            bind:value={teamName}
            disabled={isSubmitting || isChecking}
          />
          {#if teamNameError}
            <span class="field-error-msg">{teamNameError}</span>
          {:else}
            <span class="field-hint">Shown on your pass and at check-in.</span>
          {/if}
        </div>
      </div>
      {/if}

      <div class="section-header">
        <h4 class="section-heading">TEAM MEMBERS</h4>
        <span class="size-pill">
          {members.length} / {maxMembers}
          <span class="size-pill-note">
            {minMembers === 1 ? '1 required' : `${minMembers} required`}
          </span>
        </span>
      </div>

      <div class="member-list">
        {#each members as member, i (member.key)}
          <div
            animate:flip={{ duration: motionMs(260), easing: cubicOut }}
            transition:slide={{ duration: motionMs(280), easing: cubicOut }}
          >
            <TeamMemberFields
              {idPrefix}
              memberNumber={i + 1}
              title={i === 0 ? 'TEAM LEADER' : `MEMBER ${i + 1}`}
              roleBadge={roleFor(i)}
              {admissionPlaceholder}
              bind:name={member.name}
              bind:admissionNumber={member.admissionNumber}
              yearOfStudy={yearFromAdmission(member.admissionNumber)}
              bind:email={member.email}
              bind:mobile={member.mobile}
              showMobile={i === 0}
              bind:open={member.open}
              errors={fieldErrors[i] || {}}
              disabled={isSubmitting || isChecking}
              onRemove={i >= minMembers ? () => removeMember(i) : undefined}
            />
          </div>
        {/each}
      </div>

      {#if canAdd}
        <button
          type="button"
          class="add-member-btn"
          onclick={addMember}
          disabled={isSubmitting || isChecking}
          transition:slide={{ duration: motionMs(220), easing: cubicOut }}
        >
          <span class="add-icon" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </span>
          <span class="add-text">
            Add member {members.length + 1}
            <span class="add-note">Optional · up to {maxMembers} members</span>
          </span>
        </button>
      {/if}

      <div class="submit-action">
        <button type="submit" class="submit-button" disabled={isSubmitting || isChecking}>
          {#if isChecking}
            <span class="btn-spinner"></span>
            Checking details...
          {:else}
            REVIEW &amp; REGISTER
          {/if}
        </button>
      </div>
    </form>
  {/if}
</div>

<ConfirmRegistrationDialog
  {eventName}
  confirmLabel={submitLabel}
  details={pending}
  submitting={isSubmitting}
  onConfirm={confirmRegistration}
  onCancel={() => (pending = null)}
/>

<style>
  .team-details {
    background: var(--light-green-subtle);
    border: 1px solid var(--border-card);
    border-radius: var(--radius-input);
    padding: 14px 16px;
    margin-bottom: 20px;
  }

  .field-hint {
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 2px;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border-divider);
  }

  .section-heading {
    font-size: 13px;
    font-weight: 700;
    color: var(--forest-800);
    letter-spacing: 0.03em;
  }

  .size-pill {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    font-size: 12px;
    font-weight: 700;
    color: var(--forest-800);
    background: var(--light-green);
    border: 1px solid var(--border-card);
    padding: 3px 10px;
    border-radius: 999px;
    font-variant-numeric: tabular-nums;
  }

  .size-pill-note {
    font-size: 11px;
    font-weight: 500;
    color: var(--forest-700);
  }

  .add-member-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    margin-top: 2px;
    background: transparent;
    border: 1.5px dashed var(--border-input);
    border-radius: var(--radius-input);
    color: var(--forest-800);
    cursor: pointer;
    text-align: left;
    font: inherit;
    transition: background-color 180ms ease, border-color 180ms ease, transform 180ms ease;
  }

  .add-member-btn:hover:not(:disabled) {
    background: var(--light-green-subtle);
    border-color: var(--support-green);
  }

  .add-member-btn:active:not(:disabled) {
    transform: scale(0.99);
  }

  .add-member-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .add-icon {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--action-green);
    color: #ffffff;
    transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .add-member-btn:hover:not(:disabled) .add-icon {
    transform: rotate(90deg);
  }

  .add-text {
    display: flex;
    flex-direction: column;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .add-note {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-muted);
    letter-spacing: 0;
  }

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
    transition: background-color 180ms ease, transform 120ms ease, box-shadow 180ms ease;
  }

  .submit-button:hover:not(:disabled) {
    background: var(--action-green-hover);
    box-shadow: 0 4px 14px rgba(63, 115, 52, 0.25);
  }

  .submit-button:active:not(:disabled) {
    transform: translateY(1px);
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
</style>
