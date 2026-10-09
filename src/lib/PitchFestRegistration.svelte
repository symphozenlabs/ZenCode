<script>
  import TeamRegistrationForm from './TeamRegistrationForm.svelte';
  import { COLLECTIONS, registerPitchFestTeam } from './firebase.js';

  // Pitch Fest needs only the team leader; a 2nd member is optional.
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

  <TeamRegistrationForm
    eventName="Pitch Fest"
    collectionName={COLLECTIONS.PITCH_FEST}
    register={registerPitchFestTeam}
    minMembers={1}
    maxMembers={2}
    askTeamName={false}
    idPrefix="pitch"
    submitLabel="REGISTER FOR PITCH FEST"
  />
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
</style>
