// Live order updates. The server sends a tiny "something changed" ping; we answer by re-loading the list
// through the normal API. If the live line cannot be opened (offline, old browser, server restarting) the
// page simply keeps working with its own refresh, so nothing depends on this.
//
//   startLiveOrders({ onChange, onState })
//     onChange()      called (at most once per 300 ms) when an order changed
//     onState(bool)   called when the live line goes up or down
function startLiveOrders({ onChange, onState = () => {} }) {
  if (typeof EventSource === 'undefined' || !isLoggedIn()) return { stop() {} };

  let source = null;
  let retryTimer = null;
  let debounce = null;
  let wait = 3000;       // grows to 30 s while the server is unreachable
  let stopped = false;

  const changed = () => {
    clearTimeout(debounce);
    debounce = setTimeout(onChange, 300);
  };

  async function connect() {
    if (stopped || source) return;
    try {
      // EventSource cannot send our login header, so trade the login for a one-time ticket first.
      const res = await fetch(`${API_BASE_URL}/orders/stream-ticket`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      if (!res.ok) throw new Error('no ticket');
      const { ticket } = await res.json();
      if (stopped) return;

      source = new EventSource(`${API_BASE_URL}/orders/stream?ticket=${encodeURIComponent(ticket)}`);
      source.addEventListener('ready', () => { wait = 3000; onState(true); changed(); }); // catch up on anything missed
      source.addEventListener('order', changed);
      source.onerror = () => {
        // A used ticket cannot be reused, so close and start over with a new one instead of letting the browser retry.
        if (source) source.close();
        source = null;
        onState(false);
        schedule();
      };
    } catch (e) {
      source = null;
      onState(false);
      schedule();
    }
  }

  function schedule() {
    if (stopped) return;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, wait);
    wait = Math.min(wait * 2, 30000);
  }

  // Coming back to a tab that sat in the background: reconnect if needed and refresh once.
  const onVisible = () => {
    if (document.visibilityState !== 'visible' || stopped) return;
    if (!source) { clearTimeout(retryTimer); wait = 3000; connect(); }
    changed();
  };
  document.addEventListener('visibilitychange', onVisible);

  connect();
  return {
    stop() {
      stopped = true;
      clearTimeout(retryTimer); clearTimeout(debounce);
      document.removeEventListener('visibilitychange', onVisible);
      if (source) source.close();
    }
  };
}
