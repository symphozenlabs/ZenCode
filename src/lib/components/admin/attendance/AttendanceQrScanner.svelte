<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { Camera, CameraOff, Search, AlertTriangle, CheckCircle, RefreshCw, Volume2, VolumeX } from '@lucide/svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Field from '$lib/components/ui/Field.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { extractTeamIdFromQr } from '$lib/attendance/model';

	let {
		onTeamFound,
		onScanError
	}: {
		onTeamFound: (teamId: string) => void;
		onScanError?: (error: string) => void;
	} = $props();

	let Html5QrcodeClass: any = null;
	let scanner: any = null;
	let cameras = $state<Array<{ id: string; label: string }>>([]);
	let selectedCameraId = $state<string>('');
	let isScanning = $state(false);
	let isStarting = $state(false);
	let permissionDenied = $state(false);
	let permissionError = $state('');
	let manualInput = $state('');
	let manualError = $state('');
	let scanStatus = $state<'idle' | 'scanning' | 'success' | 'cooldown' | 'error'>('idle');
	let statusMessage = $state('Camera is standby. Click Start Scanner when ready.');
	let soundEnabled = $state(true);

	// Cooldown guard to prevent repeated camera triggers within 2.5 seconds
	let lastScanTime = 0;
	const COOLDOWN_MS = 2500;

	// Audio beep using standard Web Audio API
	function playSuccessBeep() {
		if (!soundEnabled || !browser) return;
		try {
			const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
			if (!AudioContext) return;
			const ctx = new AudioContext();
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = 'sine';
			osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
			gain.gain.setValueAtTime(0.2, ctx.currentTime);
			gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
			osc.connect(gain);
			gain.connect(ctx.destination);
			osc.start();
			osc.stop(ctx.currentTime + 0.15);
		} catch {
			// ignore audio errors
		}
	}

	onMount(async () => {
		if (!browser) return;
		try {
			const mod = await import('html5-qrcode');
			Html5QrcodeClass = mod.Html5Qrcode;
		} catch (err) {
			console.error('Failed to load QR scanner library:', err);
		}
	});

	onDestroy(async () => {
		await stopScanner();
	});

	async function startScanner() {
		if (!browser || !Html5QrcodeClass || isScanning || isStarting) return;

		isStarting = true;
		permissionDenied = false;
		permissionError = '';
		scanStatus = 'scanning';
		statusMessage = 'Requesting camera access…';

		try {
			// Enumerate available cameras
			if (cameras.length === 0) {
				try {
					const devices = await Html5QrcodeClass.getCameras();
					if (devices && devices.length > 0) {
						cameras = devices.map((d: any) => ({
							id: d.id,
							label: d.label || `Camera ${d.id.slice(0, 5)}`
						}));
						if (!selectedCameraId) {
							// Prefer back / environment camera if labeled
							const backCam = cameras.find((c) => /back|rear|environment/i.test(c.label));
							selectedCameraId = backCam ? backCam.id : cameras[0].id;
						}
					}
				} catch (camErr: any) {
					console.warn('Could not enumerate cameras:', camErr);
				}
			}

			if (!scanner) {
				scanner = new Html5QrcodeClass('qr-reader-target');
			}

			const cameraConfig = selectedCameraId
				? { deviceId: { exact: selectedCameraId } }
				: { facingMode: 'environment' };

			await scanner.start(
				cameraConfig,
				{
					fps: 12,
					qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
						const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
						const edge = Math.floor(minEdge * 0.72);
						return { width: edge, height: edge };
					},
					aspectRatio: 1.0
				},
				(decodedText: string) => {
					handleQrDetected(decodedText);
				},
				() => {
					// Frame skipped without QR; normal
				}
			);

			isScanning = true;
			scanStatus = 'scanning';
			statusMessage = 'Point camera at team QR pass…';
		} catch (err: any) {
			console.error('QR Scanner start failed:', err);
			isScanning = false;
			const msg = String(err?.message || err);
			if (/permission|not allowed|denied/i.test(msg)) {
				permissionDenied = true;
				permissionError = 'Camera permission was denied. Please allow camera access in your browser settings to scan QR passes.';
			} else if (/not found|no camera/i.test(msg)) {
				permissionError = 'No camera found on this device. Use manual Team ID search below.';
			} else {
				permissionError = 'Could not start camera. Please verify device permissions or use manual lookup.';
			}
			scanStatus = 'error';
			statusMessage = permissionError;
			if (onScanError) onScanError(permissionError);
		} finally {
			isStarting = false;
		}
	}

	async function stopScanner() {
		if (scanner && isScanning) {
			try {
				await scanner.stop();
			} catch (err) {
				console.warn('Error stopping scanner:', err);
			}
			isScanning = false;
			scanStatus = 'idle';
			statusMessage = 'Scanner stopped.';
		}
	}

	async function switchCamera(cameraId: string) {
		selectedCameraId = cameraId;
		if (isScanning) {
			await stopScanner();
			await startScanner();
		}
	}

	function handleQrDetected(decodedText: string) {
		const now = Date.now();
		if (now - lastScanTime < COOLDOWN_MS) {
			return; // Debounce rapid scans
		}
		lastScanTime = now;

		const cleanId = extractTeamIdFromQr(decodedText);
		if (!cleanId) {
			scanStatus = 'error';
			statusMessage = 'Unrecognized QR code format. Not a valid ZenCode registration pass.';
			return;
		}

		playSuccessBeep();
		scanStatus = 'success';
		statusMessage = `Recognized QR Code! Team ID: ${cleanId}`;

		// Pass up to parent component to find team and open panel
		onTeamFound(cleanId);

		setTimeout(() => {
			if (isScanning) {
				scanStatus = 'scanning';
				statusMessage = 'Point camera at team QR pass…';
			}
		}, 2000);
	}

	function handleManualSubmit(e: SubmitEvent) {
		e.preventDefault();
		manualError = '';
		const trimmed = manualInput.trim();
		if (!trimmed) {
			manualError = 'Please enter a Team ID or Reference ID.';
			return;
		}

		const cleanId = extractTeamIdFromQr(trimmed);
		if (!cleanId) {
			manualError = 'Invalid Team ID format.';
			return;
		}

		playSuccessBeep();
		onTeamFound(cleanId);
	}
</script>

<div class="grid gap-6 lg:grid-cols-12">
	<!-- Left: Camera Viewfinder (7 cols) -->
	<div class="lg:col-span-7 space-y-4">
		<div class="rounded-xl border border-border bg-card p-4 sm:p-6 shadow-xs">
			<div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border">
				<div class="flex items-center gap-2">
					<Camera class="size-5 text-primary" />
					<h3 class="font-bold text-foreground">Camera QR Scanner</h3>
				</div>

				<div class="flex items-center gap-2">
					<button
						type="button"
						onclick={() => (soundEnabled = !soundEnabled)}
						class="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
						title={soundEnabled ? 'Mute beep' : 'Enable beep'}
						aria-label="Toggle scan sound"
					>
						{#if soundEnabled}
							<Volume2 class="size-4" />
						{:else}
							<VolumeX class="size-4" />
						{/if}
					</button>

					{#if cameras.length > 1}
						<select
							class="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground focus:ring-1 focus:ring-ring"
							bind:value={selectedCameraId}
							onchange={(e) => switchCamera((e.target as HTMLSelectElement).value)}
							disabled={isStarting}
						>
							{#each cameras as cam}
								<option value={cam.id}>{cam.label}</option>
							{/each}
						</select>
					{/if}
				</div>
			</div>

			<!-- Viewfinder Container -->
			<div class="relative mt-4 overflow-hidden rounded-lg border-2 border-dashed border-border bg-stage aspect-square max-h-[380px] mx-auto flex flex-col items-center justify-center">
				<div id="qr-reader-target" class="w-full h-full"></div>

				{#if !isScanning && !isStarting}
					<div class="absolute inset-0 z-10 flex flex-col items-center justify-center bg-stage/90 p-6 text-center backdrop-blur-xs">
						<Camera class="size-12 text-muted-foreground/50 mb-3" />
						<p class="text-sm font-medium text-cream mb-1">Camera is off</p>
						<p class="text-xs text-cream/70 max-w-xs mb-4">
							Click below to activate your camera and scan ZenCode team passes.
						</p>
						<Button onclick={startScanner} variant="default">
							<Camera class="size-4" /> Start Camera
						</Button>
					</div>
				{:else if isStarting}
					<div class="absolute inset-0 z-10 flex flex-col items-center justify-center bg-stage/95 p-6 text-center">
						<Spinner class="size-8 text-primary mb-3" />
						<p class="text-sm font-medium text-cream">Starting camera…</p>
					</div>
				{/if}

				<!-- Scan Status Overlay Pill -->
				{#if isScanning}
					<div class="absolute bottom-3 inset-x-3 z-10 flex items-center justify-between rounded-lg bg-stage-raised/90 border border-stage-line px-3 py-2 text-xs text-cream backdrop-blur-sm">
						<div class="flex items-center gap-2 truncate">
							{#if scanStatus === 'success'}
								<CheckCircle class="size-4 text-emerald-400 shrink-0" />
								<span class="truncate font-semibold text-emerald-400">{statusMessage}</span>
							{:else}
								<span class="size-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
								<span class="truncate">{statusMessage}</span>
							{/if}
						</div>
						<button
							type="button"
							onclick={stopScanner}
							class="ml-2 shrink-0 rounded px-2 py-1 text-[11px] font-semibold text-white/80 hover:bg-white/10"
						>
							Pause
						</button>
					</div>
				{/if}
			</div>

			<!-- Permission or Camera Error Alert -->
			{#if permissionError}
				<div class="mt-4 flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
					<AlertTriangle class="size-4 shrink-0 mt-0.5" />
					<div class="flex-1">
						<p class="font-semibold">{permissionDenied ? 'Camera Access Required' : 'Camera Error'}</p>
						<p class="mt-0.5">{permissionError}</p>
					</div>
				</div>
			{/if}

			<div class="mt-4 text-xs text-muted-foreground space-y-1">
				<p>• <strong>Individual Check-In:</strong> Scanning a team QR loads the team roster. Each present member must then be individually marked present.</p>
				<p>• <strong>Anti-Duplicate:</strong> Already present students are safely identified; re-scanning will not create duplicates.</p>
			</div>
		</div>
	</div>

	<!-- Right: Manual Search Fallback & Instructions (5 cols) -->
	<div class="lg:col-span-5 space-y-4">
		<!-- Manual Lookup Card -->
		<div class="rounded-xl border border-border bg-card p-5 shadow-xs">
			<div class="flex items-center gap-2 pb-3 border-b border-border">
				<Search class="size-5 text-primary" />
				<h3 class="font-bold text-foreground">Manual Team Search</h3>
			</div>

			<p class="mt-3 text-xs text-muted-foreground">
				If the participant does not have their QR or the camera is unavailable, search directly by Team ID or Reference ID.
			</p>

			<form onsubmit={handleManualSubmit} class="mt-4 space-y-3">
				<Field
					label="Team ID or Pass URL"
					bind:value={manualInput}
					error={manualError}
					placeholder="e.g. 5xJ2k9aP or ZC-5XJ2K9"
				/>

				<Button type="submit" variant="default" class="w-full">
					<Search class="size-4" /> Find Team Roster
				</Button>
			</form>
		</div>

		<!-- Quick Scanning Tips -->
		<div class="rounded-xl border border-border bg-card/60 p-5">
			<h4 class="text-sm font-bold text-foreground mb-2">Organizer Desk Instructions</h4>
			<ul class="text-xs text-muted-foreground space-y-2 list-disc list-inside">
				<li>Have the team leader or any member present their pass on their phone screen or printed PDF.</li>
				<li>Ensure good screen brightness and hold the phone steady 15–20 cm in front of the lens.</li>
				<li>Verify each physically present member against their college ID card and admission number.</li>
				<li>Click <strong>Mark Present</strong> for each member present at the desk.</li>
			</ul>
		</div>
	</div>
</div>
