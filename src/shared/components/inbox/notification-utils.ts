export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('de-AT', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
