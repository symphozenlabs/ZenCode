/** Short-lived messages on the certificate pages (shown by CertScope). */
class CertificateToast {
	current = $state<{ text: string; tone: 'success' | 'error' | 'info'; id: number } | null>(null);

	showToast(text: string, tone: 'success' | 'error' | 'info' = 'info') {
		const id = Date.now() + Math.random();
		this.current = { text, tone, id };
		setTimeout(() => {
			if (this.current?.id === id) this.current = null;
		}, tone === 'error' ? 6000 : 3500);
	}
}

export const certToast = new CertificateToast();
