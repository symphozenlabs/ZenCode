<script>
  import { onMount } from 'svelte';
  import { db, COLLECTIONS } from './firebase.js';
  import { doc, getDoc } from 'firebase/firestore';

  let { teamId = '' } = $props();

  let loading = $state(true);
  let error = $state('');
  let registrationData = $state(null);
  let collectionUsed = $state('');
  let isCheckedIn = $state(false);
  let checkInTime = $state('');

  // Extract clean team ID if payload is a URL, encoded JSON, or raw ID
  function extractCleanTeamId(rawInput) {
    if (!rawInput) return '';
    let cleaned = decodeURIComponent(rawInput).trim();

    // If it's a JSON token string: {"type":"TEAM_ATTENDANCE","teamId":"..."}
    if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
      try {
        const parsed = JSON.parse(cleaned);
        if (parsed.teamId) return parsed.teamId;
      } catch (e) {
        // Fallback to raw
      }
    }

    // If it's a URL path like /check-in/XYZ
    if (cleaned.includes('/check-in/')) {
      const parts = cleaned.split('/check-in/');
      return parts[parts.length - 1].split('?')[0].split('/')[0];
    }

    return cleaned;
  }

  const cleanTeamId = $derived(extractCleanTeamId(teamId));

  const teamNameDisplay = $derived.by(() => {
    if (!registrationData) return 'Team';
    if (registrationData.teamName) return registrationData.teamName;
    const leader = registrationData.teamLeader?.name || 'ZenCode';
    const event = registrationData.event || 'Team';
    return `${leader}'s ${event} Team`;
  });

  const displayMembers = $derived.by(() => {
    if (!registrationData?.members || !Array.isArray(registrationData.members)) return [];
    if (!registrationData?.teamLeader) return registrationData.members;

    const leaderEmail = (registrationData.teamLeader.email || '').trim().toLowerCase();
    const leaderAdm = (registrationData.teamLeader.admissionNumber || '').trim().toLowerCase();

    return registrationData.members.filter(m => {
      const mEmail = (m.email || '').trim().toLowerCase();
      const mAdm = (m.admissionNumber || '').trim().toLowerCase();
      if (leaderEmail && mEmail === leaderEmail) return false;
      if (leaderAdm && mAdm === leaderAdm) return false;
      return true;
    });
  });

  onMount(async () => {
    const targetId = cleanTeamId;
    if (!targetId) {
      error = 'No Team Registration ID provided in QR Code / URL.';
      loading = false;
      return;
    }

    try {
      // First check Hackathon collection
      const hackRef = doc(db, COLLECTIONS.HACKATHON, targetId);
      const hackSnap = await getDoc(hackRef);

      if (hackSnap.exists()) {
        registrationData = { id: hackSnap.id, ...hackSnap.data() };
        collectionUsed = COLLECTIONS.HACKATHON;
        if (hackSnap.data().checkedIn) {
          isCheckedIn = true;
          checkInTime = hackSnap.data().checkedInAt || 'Already Recorded';
        }
      } else {
        // Next check Pitch Fest collection
        const pitchRef = doc(db, COLLECTIONS.PITCH_FEST, targetId);
        const pitchSnap = await getDoc(pitchRef);

        if (pitchSnap.exists()) {
          registrationData = { id: pitchSnap.id, ...pitchSnap.data() };
          collectionUsed = COLLECTIONS.PITCH_FEST;
          if (pitchSnap.data().checkedIn) {
            isCheckedIn = true;
            checkInTime = pitchSnap.data().checkedInAt || 'Already Recorded';
          }
        } else {
          error = `No registration record found for Team ID: "${targetId}".`;
        }
      }
    } catch (err) {
      console.error('Error fetching registration:', err);
      error = 'Failed to load team check-in details. Please check the network connection and try again.';
    } finally {
      loading = false;
    }
  });

  function handleCheckInTeam() {
    isCheckedIn = true;
    checkInTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    if (typeof timestamp.toDate === 'function') {
      return timestamp.toDate().toLocaleString();
    }
    if (timestamp.seconds) {
      return new Date(timestamp.seconds * 1000).toLocaleString();
    }
    return new Date(timestamp).toLocaleString();
  }
</script>

<div class="checkin-wrapper">
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
      <div class="desk-tag">
        <span class="pulse-dot"></span>
        Check-in Desk Verification
      </div>
    </div>
  </header>

  <main class="checkin-container">
    {#if loading}
      <div class="status-card loading-card">
        <div class="spinner"></div>
        <p>Verifying Team Registration QR Code...</p>
      </div>
    {:else if error}
      <div class="status-card error-card">
        <div class="icon-wrap error-icon">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
        </div>
        <h2>Verification Failed</h2>
        <p class="error-msg">{error}</p>
        <a href="/" class="action-btn">Return to Home</a>
      </div>
    {:else if registrationData}
      <div class="verify-card">
        <div class="verify-header">
          <div class="status-badge verified">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Registration Verified
          </div>
          <h2 class="event-title">{registrationData.event || 'ZenCode Event'}</h2>
          <div class="team-meta-line">
            <div class="team-name-tag">{teamNameDisplay}</div>
            <div class="team-id-pill">
              Team ID: <code>{registrationData.id}</code>
            </div>
          </div>
        </div>

        <!-- Attendance Check-in Banner -->
        <div class="attendance-banner {isCheckedIn ? 'checked-in-state' : 'pending-state'}">
          <div class="attendance-status-info">
            <div class="attendance-label">TEAM ATTENDANCE STATUS</div>
            <div class="attendance-value">
              {#if isCheckedIn}
                <span class="status-checked-badge">✓ Team Checked In ({checkInTime})</span>
              {:else}
                <span class="status-pending-badge">Pending Attendance Desk Check-in</span>
              {/if}
            </div>
          </div>

          {#if !isCheckedIn}
            <button type="button" class="checkin-action-btn" onclick={handleCheckInTeam}>
              ✓ Mark Team as Checked In
            </button>
          {:else}
            <div class="checked-in-stamp">
              All team members marked present
            </div>
          {/if}
        </div>

        <div class="meta-row">
          <div class="meta-item">
            <span class="meta-label">Event</span>
            <span class="meta-value">{registrationData.event || 'Hackathon'}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Team Size</span>
            <span class="meta-value">{registrationData.teamSize || (displayMembers.length + 1)} Members</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Registered At</span>
            <span class="meta-value">{formatDate(registrationData.registeredAt)}</span>
          </div>
        </div>

        <!-- Members Section -->
        <div class="members-section">
          <h3 class="section-title">Registered Team Members</h3>

          <div class="members-grid">
            {#if registrationData.teamLeader}
              <div class="member-card leader-card">
                <div class="card-header">
                  <span class="member-num">1</span>
                  <span class="role-badge leader">Team Leader</span>
                </div>
                <div class="member-name">{registrationData.teamLeader.name}</div>
                <div class="detail-row">
                  <span class="detail-label">Admission No:</span>
                  <span class="detail-val">{registrationData.teamLeader.admissionNumber}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Year of Study:</span>
                  <span class="detail-val">{registrationData.teamLeader.yearOfStudy || registrationData.teamLeader.classSection || 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Email:</span>
                  <span class="detail-val">{registrationData.teamLeader.email}</span>
                </div>
              </div>
            {/if}

            {#each displayMembers as m, idx}
              <div class="member-card">
                <div class="card-header">
                  <span class="member-num">{idx + 2}</span>
                  <span class="role-badge">Member</span>
                </div>
                <div class="member-name">{m.name}</div>
                <div class="detail-row">
                  <span class="detail-label">Admission No:</span>
                  <span class="detail-val">{m.admissionNumber}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Year of Study:</span>
                  <span class="detail-val">{m.yearOfStudy || m.classSection || 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Email:</span>
                  <span class="detail-val">{m.email}</span>
                </div>
              </div>
            {/each}
          </div>
        </div>

        <div class="card-actions">
          <a href="/" class="secondary-btn">← Back to Registration</a>
        </div>
      </div>
    {/if}
  </main>
</div>

<style>
  .checkin-wrapper {
    min-height: 100vh;
    background-color: #0f172a;
    color: #f8fafc;
    font-family: system-ui, -apple-system, sans-serif;
  }

  .top-navbar {
    background: rgba(15, 23, 42, 0.9);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding: 16px 24px;
  }

  .nav-container {
    max-width: 900px;
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .brand-group {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .brand-logo-mark {
    width: 34px;
    height: 34px;
    background: linear-gradient(135deg, #06b6d4, #0284c7);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  .brand-svg {
    width: 20px;
    height: 20px;
  }

  .brand-title {
    font-weight: 800;
    font-size: 1.1rem;
    letter-spacing: 0.5px;
  }

  .brand-year {
    color: #06b6d4;
    font-weight: 700;
    font-size: 0.9rem;
    margin-left: 4px;
  }

  .desk-tag {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
    color: #94a3b8;
    background: rgba(255, 255, 255, 0.05);
    padding: 6px 14px;
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .pulse-dot {
    width: 8px;
    height: 8px;
    background-color: #10b981;
    border-radius: 50%;
    box-shadow: 0 0 8px #10b981;
  }

  .checkin-container {
    max-width: 800px;
    margin: 40px auto;
    padding: 0 20px;
  }

  .status-card {
    background: #1e293b;
    border-radius: 16px;
    padding: 40px;
    text-align: center;
    border: 1px solid #334155;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(255, 255, 255, 0.1);
    border-top-color: #06b6d4;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 16px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .icon-wrap {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 16px;
  }

  .error-icon {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
  }

  .error-msg {
    color: #94a3b8;
    margin-bottom: 24px;
  }

  .action-btn, .secondary-btn {
    display: inline-block;
    padding: 10px 20px;
    border-radius: 8px;
    background: #0284c7;
    color: white;
    text-decoration: none;
    font-weight: 600;
  }

  .secondary-btn {
    background: rgba(255, 255, 255, 0.1);
    color: #e2e8f0;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .verify-card {
    background: #1e293b;
    border-radius: 16px;
    padding: 32px;
    border: 1px solid #334155;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  }

  .verify-header {
    text-align: center;
    padding-bottom: 24px;
    border-bottom: 1px solid #334155;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 0.85rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;

    &.verified {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
  }

  .event-title {
    font-size: 1.8rem;
    font-weight: 800;
    margin: 12px 0 8px;
    color: #ffffff;
  }

  .team-meta-line {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 12px;
    margin-top: 8px;
  }

  .team-name-tag {
    font-size: 1.1rem;
    font-weight: 700;
    color: #e2e8f0;
    background: rgba(255, 255, 255, 0.08);
    padding: 4px 14px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
  }

  .team-id-pill code {
    background: #0f172a;
    padding: 5px 12px;
    border-radius: 6px;
    color: #38bdf8;
    font-family: monospace;
    font-size: 0.95rem;
    font-weight: 700;
    border: 1px solid #334155;
  }

  .attendance-banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 20px;
    border-radius: 12px;
    margin: 20px 0;
    transition: all 0.2s ease;

    &.pending-state {
      background: rgba(245, 158, 11, 0.1);
      border: 1.5px solid rgba(245, 158, 11, 0.3);
    }

    &.checked-in-state {
      background: rgba(16, 185, 129, 0.12);
      border: 1.5px solid rgba(16, 185, 129, 0.4);
    }
  }

  .attendance-status-info {
    text-align: left;
  }

  .attendance-label {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.5px;
    color: #94a3b8;
    text-transform: uppercase;
  }

  .attendance-value {
    margin-top: 4px;
  }

  .status-pending-badge {
    color: #fbbf24;
    font-weight: 700;
    font-size: 0.95rem;
  }

  .status-checked-badge {
    color: #34d399;
    font-weight: 800;
    font-size: 1.05rem;
  }

  .checkin-action-btn {
    background: #10b981;
    color: #ffffff;
    font-weight: 700;
    font-size: 0.95rem;
    padding: 10px 20px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
    transition: background 0.15s ease, transform 0.1s ease;

    &:hover {
      background: #059669;
      transform: translateY(-1px);
    }

    &:active {
      transform: translateY(0);
    }
  }

  .checked-in-stamp {
    font-size: 0.85rem;
    color: #a7f3d0;
    font-weight: 600;
    background: rgba(16, 185, 129, 0.2);
    padding: 6px 14px;
    border-radius: 20px;
  }

  .meta-row {
    display: flex;
    justify-content: space-around;
    padding: 20px 0;
    border-bottom: 1px solid #334155;
    margin-bottom: 24px;
  }

  .meta-item {
    text-align: center;
  }

  .meta-label {
    display: block;
    font-size: 0.75rem;
    color: #94a3b8;
    text-transform: uppercase;
    font-weight: 700;
  }

  .meta-value {
    font-size: 0.95rem;
    font-weight: 600;
    color: #f1f5f9;
    margin-top: 4px;
  }

  .members-section {
    margin-bottom: 24px;
  }

  .section-title {
    font-size: 1.1rem;
    font-weight: 700;
    color: #cbd5e1;
    margin-bottom: 16px;
  }

  .members-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 16px;
  }

  .member-card {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 16px;

    &.leader-card {
      border-left: 4px solid #06b6d4;
    }
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .member-num {
    width: 22px;
    height: 22px;
    background: #334155;
    color: #94a3b8;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 700;
  }

  .role-badge {
    font-size: 0.7rem;
    text-transform: uppercase;
    font-weight: 700;
    color: #94a3b8;
    background: #1e293b;
    padding: 2px 8px;
    border-radius: 10px;

    &.leader {
      background: rgba(6, 182, 212, 0.2);
      color: #22d3ee;
    }
  }

  .member-name {
    font-size: 1.1rem;
    font-weight: 700;
    color: #ffffff;
    margin-bottom: 8px;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    margin-top: 4px;
  }

  .detail-label {
    color: #64748b;
  }

  .detail-val {
    color: #cbd5e1;
    font-weight: 500;
  }

  .card-actions {
    text-align: center;
    margin-top: 24px;
  }
</style>
