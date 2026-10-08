<script>
  import RegistrationPage from './lib/RegistrationPage.svelte';
  import CheckInPage from './lib/CheckInPage.svelte';

  let currentPath = $state(typeof window !== 'undefined' ? window.location.pathname : '/');
  let isCheckIn = $derived(currentPath.startsWith('/check-in/'));
  let teamId = $derived(isCheckIn ? currentPath.split('/check-in/')[1] : null);

  if (typeof window !== 'undefined') {
    window.addEventListener('popstate', () => {
      currentPath = window.location.pathname;
    });
  }
</script>

{#if isCheckIn && teamId}
  <CheckInPage {teamId} />
{:else}
  <RegistrationPage />
{/if}
